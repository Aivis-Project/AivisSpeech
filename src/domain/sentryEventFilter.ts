import type { Event, EventHint } from "@sentry/electron/renderer";

type SentryEventPredicate = (eventText: string) => boolean;
type NativeStackFramePackage = {
  package?: unknown;
};

const MAX_COLLECT_TEXT_DEPTH = 50;
const MAX_HTTP_STATUS_DEPTH = 50;

const LOCAL_ENGINE_ENDPOINT_PATTERN =
  /https?:\/\/(?:\[REDACTED_IP\]|(?:127\.0\.0\.1|localhost|\[[^\]]+\]|[0-9.]+)):\d+\/(?:speaker_info|engine_manifest|aivm_models)\b/i;
const LOCAL_ENGINE_ERROR_ENDPOINT_PATTERN =
  /https?:\/\/(?:\[REDACTED_IP\]|(?:127\.0\.0\.1|localhost|\[[^\]]+\]|[0-9.]+)):\d+\/(?:version|engine_manifest|aivm_models|speaker_info|is_initialized_speaker|initialize_speaker|audio_query|synthesis)\b/i;
const INITIALIZE_SPEAKER_ENDPOINT_PATTERN =
  /https?:\/\/(?:\[REDACTED_IP\]|(?:127\.0\.0\.1|localhost|\[[^\]]+\]|[0-9.]+)):\d+\/initialize_speaker\b/i;

const DROP_ERROR_PATTERNS: readonly RegExp[] = [
  /(?=[\s\S]*ZodError)(?=[\s\S]*"received":\s*"nan")(?=[\s\S]*"splitterPosition")(?=[\s\S]*"audioInfoPaneWidth")/i,
  /EPERM: operation not permitted, rename '.*[\\/]AivisSpeech[\\/]config\.json-[0-9a-f-]+\.tmp' -> '.*[\\/]AivisSpeech[\\/]config\.json'/i,
  /ENOSPC: no space left on device/i,
  /EPIPE: broken pipe, write/i,
  /spawn UNKNOWN/i,
  /Invalid string length/i,
  /memory access out of bounds/i,
  /Fatal Error: Out of Memory/i,
  /\bRtlAllocateHeap\b/i,
  /\bMemoryError\b/i,
  /\bOOM\b/i,
  /AbortError: The play\(\) request was interrupted by (?:a call to pause\(\)|a new load request|a pause was requested by the user)/i,
  /NotSupportedError: Failed to load because no supported source was found/i,
  /NotFoundError: Requested device not found/i,
  /AudioContext\.setSinkId\(\): failed: the device .+ is not found/i,
  /'GPU' process exited with '(?:crashed|abnormal-exit)'/i,
  /'Utility' process exited with 'abnormal-exit'/i,
  /ERR_FAILED \(-2\) loading 'app:\/\/\.\/index\.html/i,
  /Fatal Error: EXCEPTION_BREAKPOINT/i,
  /Fatal Error: Simulated Exception/i,
  /Fatal Error: SIGSEGV \/ SEGV_MAPERR/i,
  /crash_reporter::DumpWithoutCrashing/i,
  /\bares_dns_rr_get_ttl\b/i,
  /Fatal Error: SIGBUS \/ BUS_ADRERR/i,
  /\bv8::CodeEvent::GetScriptColumn\b/i,
  /Fatal Error: EXCEPTION_ACCESS_VIOLATION_READ[\s\S]*\bBaseThreadInitThunk\b/i,
  /Fatal Error: EXCEPTION_ACCESS_VIOLATION_READ[\s\S]*atidxx64\.dll/i,
  /Fatal Error: EXCEPTION_ACCESS_VIOLATION_READ[\s\S]*D3DCompiler_47\.dll/i,
  /v8::internal::GlobalHandles::Destroy/i,
];

const DROP_ERROR_PREDICATES: readonly SentryEventPredicate[] = [
  (eventText) =>
    /(?:TypeError|FetchError)[\s\S]*Failed to fetch/i.test(eventText) &&
    /useFetchNewUpdateInfos\.ts|raw\.githubusercontent\.com\/Aivis-Project\/AivisSpeech\/master\/public\/updateInfos\.json/i.test(
      eventText,
    ),
  (eventText) =>
    /Network response was not ok/i.test(eventText) &&
    /useFetchNewUpdateInfos\.ts|updateInfos\.json/i.test(eventText),
  (eventText) =>
    /(?:TypeError|FetchError)[\s\S]*(?:Failed to fetch|interceptors did not return an alternative response)/i.test(
      eventText,
    ) && LOCAL_ENGINE_ERROR_ENDPOINT_PATTERN.test(eventText),
];

/**
 * Sentry へ送る必要がない既知のエラーイベントを破棄する
 * @param event Sentry SDK が送信しようとしているイベント
 * @param hint Sentry SDK が付与する例外情報などの補足情報
 * @returns 送信するイベント、または送信を止める場合は null
 */
export const filterSentryErrorEvent = <TEvent extends Event>(
  event: TEvent,
  hint?: EventHint,
): TEvent | null => {
  const eventText = collectSentryEventText(event, hint);

  // Sentry の issue 名だけに頼ると別経路の同名エラーを巻き込みやすいため、実イベントに出た署名だけを落とす
  if (matchesAnyPattern(DROP_ERROR_PATTERNS, eventText)) {
    return null;
  }

  // `Failed to fetch` は範囲が広いため、更新確認などの既知経路に限定する
  if (DROP_ERROR_PREDICATES.some((predicate) => predicate(eventText) === true)) {
    return null;
  }

  // `ResponseError` は複数の Engine API のパンくずが混ざるため、URL と status を同じ記録単位で確認する
  if (
    /Response returned an error code/i.test(eventText) &&
    hasInitializeSpeakerHttp500(event)
  ) {
    return null;
  }

  return event;
};

/**
 * Sentry へ送る必要がない既知の性能イベントを破棄する
 * @param event Sentry SDK が送信しようとしているトランザクションイベント
 * @param hint Sentry SDK が付与する補足情報
 * @returns 送信するイベント、または送信を止める場合は null
 */
export const filterSentryTransactionEvent = <TEvent extends Event>(
  event: TEvent,
  hint?: EventHint,
): TEvent | null => {
  const eventText = collectSentryEventText(event, hint);

  // ローカル Engine API のレスポンスは製品仕様に近く、性能 issue として送り続ける価値が薄い
  if (LOCAL_ENGINE_ENDPOINT_PATTERN.test(eventText)) {
    return null;
  }

  return event;
};

const matchesAnyPattern = (patterns: readonly RegExp[], text: string): boolean => {
  return patterns.some((pattern) => pattern.test(text));
};

const hasInitializeSpeakerHttp500 = (event: Event): boolean => {
  const httpRecords: unknown[] = [];

  if (event.breadcrumbs != undefined) {
    for (const breadcrumb of event.breadcrumbs) {
      httpRecords.push(breadcrumb.data);
    }
  }

  if (event.request != undefined) {
    httpRecords.push(event.request);
  }

  if (event.spans != undefined) {
    for (const span of event.spans) {
      httpRecords.push({
        description: span.description,
        data: span.data,
      });
    }
  }

  return httpRecords.some((httpRecord) => {
    const recordText = collectValueText(httpRecord);
    return (
      INITIALIZE_SPEAKER_ENDPOINT_PATTERN.test(recordText) &&
      hasHttpStatus500(httpRecord)
    );
  });
};

const hasHttpStatus500 = (
  value: unknown,
  visitedObjects = new WeakSet<object>(),
  depth = 0,
): boolean => {
  if (value == undefined) {
    return false;
  }

  // Sentry の data は外部ライブラリ由来の任意オブジェクトなので、循環や極端な深さでは探索を打ち切る
  if (depth > MAX_HTTP_STATUS_DEPTH) {
    return false;
  }

  if (typeof value === "string") {
    return /HTTP 500|status_code["']?\s*[:=]\s*500|status(?:Code)?["']?\s*[:=]\s*500/i.test(
      value,
    );
  }

  if (typeof value === "number") {
    return false;
  }

  if (Array.isArray(value)) {
    if (visitedObjects.has(value)) {
      return false;
    }
    visitedObjects.add(value);
    return value.some((item) =>
      hasHttpStatus500(item, visitedObjects, depth + 1),
    );
  }

  if (typeof value === "object") {
    if (visitedObjects.has(value)) {
      return false;
    }
    visitedObjects.add(value);

    return Object.entries(value).some(([key, item]) => {
      if (/^(?:status_code|statusCode|status)$/i.test(key)) {
        return Number(item) === 500;
      }
      return hasHttpStatus500(item, visitedObjects, depth + 1);
    });
  }

  return false;
};

const collectSentryEventText = (event: Event, hint?: EventHint): string => {
  const texts: string[] = [];

  // SDK が作る表示名と、実例外の情報を両方見る
  appendText(texts, event.message);
  appendText(texts, event.transaction);
  appendText(texts, hint?.originalException);
  appendText(texts, hint?.syntheticException);
  appendText(texts, hint?.data);

  if (event.logentry != undefined) {
    appendText(texts, event.logentry.message);
    appendText(texts, event.logentry.params);
  }

  if (event.exception?.values != undefined) {
    for (const exception of event.exception.values) {
      appendText(texts, exception.type);
      appendText(texts, exception.value);
      appendText(texts, exception.mechanism);

      // ネイティブクラッシュは frames 側に Chromium / V8 の関数名だけが出る場合がある
      if (exception.stacktrace?.frames != undefined) {
        for (const frame of exception.stacktrace.frames) {
          appendText(texts, frame.filename);
          appendText(texts, frame.abs_path);
          appendText(texts, frame.function);
          appendText(texts, (frame as NativeStackFramePackage).package);
        }
      }
    }
  }

  if (event.breadcrumbs != undefined) {
    for (const breadcrumb of event.breadcrumbs) {
      appendText(texts, breadcrumb.type);
      appendText(texts, breadcrumb.category);
      appendText(texts, breadcrumb.message);
      appendText(texts, breadcrumb.data);
    }
  }

  if (event.request != undefined) {
    appendText(texts, event.request.url);
    appendText(texts, event.request.method);
    appendText(texts, event.request.data);
  }

  if (event.spans != undefined) {
    for (const span of event.spans) {
      appendText(texts, span.op);
      appendText(texts, span.description);
      appendText(texts, span.data);
    }
  }

  appendText(texts, event.extra);
  appendText(texts, event.contexts);
  appendText(texts, event.tags);

  return texts.join("\n");
};

const collectValueText = (value: unknown): string => {
  const texts: string[] = [];
  appendText(texts, value, new WeakSet<object>());
  return texts.join("\n");
};

const appendText = (
  texts: string[],
  value: unknown,
  visitedObjects = new WeakSet<object>(),
  depth = 0,
): void => {
  if (value == undefined) {
    return;
  }

  // Sentry のイベントには外部由来の任意オブジェクトが入るため、送信前フィルタ内での stack overflow を避ける
  if (depth > MAX_COLLECT_TEXT_DEPTH) {
    return;
  }

  if (typeof value === "string") {
    texts.push(value);
    return;
  }

  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    texts.push(String(value));
    return;
  }

  if (value instanceof Error) {
    texts.push(value.name);
    texts.push(value.message);
    if (value.stack != undefined) {
      texts.push(value.stack);
    }
    return;
  }

  if (Array.isArray(value)) {
    if (visitedObjects.has(value)) {
      return;
    }
    visitedObjects.add(value);

    for (const item of value) {
      appendText(texts, item, visitedObjects, depth + 1);
    }
    return;
  }

  if (typeof value === "object") {
    if (visitedObjects.has(value)) {
      return;
    }
    visitedObjects.add(value);

    for (const [key, item] of Object.entries(value)) {
      texts.push(key);
      appendText(texts, item, visitedObjects, depth + 1);
    }
  }
};
