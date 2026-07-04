import { describe, expect, it } from "vitest";
import type { Event } from "@sentry/electron/renderer";
import {
  filterSentryErrorEvent,
  filterSentryTransactionEvent,
} from "@/domain/sentryEventFilter";

const generateExceptionEvent = (
  exceptionType: string,
  exceptionValue: string,
): Event => {
  return {
    exception: {
      values: [
        {
          type: exceptionType,
          value: exceptionValue,
        },
      ],
    },
  };
};

const generateBreadcrumbEvent = (
  exceptionType: string,
  exceptionValue: string,
  breadcrumbData: Record<string, unknown>,
): Event => {
  return {
    ...generateExceptionEvent(exceptionType, exceptionValue),
    breadcrumbs: [
      {
        type: "http",
        category: "fetch",
        data: breadcrumbData,
      },
    ],
  };
};

describe("filterSentryErrorEvent", () => {
  it.each([
    generateExceptionEvent(
      "ZodError",
      `[
        {
          "code": "invalid_type",
          "expected": "number",
          "received": "nan",
          "path": ["splitterPosition", "audioInfoPaneWidth"],
          "message": "Expected number, received nan"
        }
      ]`,
    ),
    generateExceptionEvent(
      "Error",
      "EPERM: operation not permitted, rename " +
        "'C:\\Users\\Taro\\AppData\\Roaming\\AivisSpeech\\config.json-609e131c-2f5c-47e7-906e-de14d69049b4.tmp' -> " +
        "'C:\\Users\\Taro\\AppData\\Roaming\\AivisSpeech\\config.json'",
    ),
    generateExceptionEvent("Error", "ENOSPC: no space left on device, write"),
    generateExceptionEvent("Error", "EPIPE: broken pipe, write"),
    generateExceptionEvent("Error", "spawn UNKNOWN"),
    generateExceptionEvent("RangeError", "Invalid string length"),
    generateExceptionEvent("RuntimeError", "memory access out of bounds"),
    generateExceptionEvent("Error", "Fatal Error: Out of Memory / 0x7ff84c6379da"),
    generateExceptionEvent("Error", "RtlAllocateHeap"),
    generateExceptionEvent("MemoryError", "Unable to allocate enough memory"),
    generateExceptionEvent("Error", "Renderer process crashed with OOM"),
    generateExceptionEvent(
      "Error",
      "AbortError: The play() request was interrupted by a call to pause(). https://goo.gl/LdLk22",
    ),
    generateExceptionEvent(
      "Error",
      "AbortError: The play() request was interrupted by a new load request. https://goo.gl/LdLk22",
    ),
    generateExceptionEvent(
      "NotSupportedError",
      "NotSupportedError: Failed to load because no supported source was found",
    ),
    generateExceptionEvent(
      "NotFoundError",
      "AudioContext.setSinkId(): failed: the device 03e291515f94df5ad11b221b90b0e41416bc27fae4e1b46221e28a187423dd29 is not found.",
    ),
    generateExceptionEvent("Error", "NotFoundError: Requested device not found"),
    generateBreadcrumbEvent("TypeError", "Failed to fetch", {
      url: "https://raw.githubusercontent.com/Aivis-Project/AivisSpeech/master/public/updateInfos.json",
    }),
    generateBreadcrumbEvent(
      "FetchError",
      "The request failed and the interceptors did not return an alternative response",
      {
        url: "http://127.0.0.1:10101/engine_manifest",
      },
    ),
    generateBreadcrumbEvent("TypeError", "Failed to fetch", {
      url: "http://127.0.0.1:10101/synthesis?speaker=1431611904&enable_interrogative_upspeak=false",
    }),
    generateBreadcrumbEvent(
      "ResponseError",
      "Response returned an error code",
      {
        url: "http://127.0.0.1:10101/initialize_speaker?speaker=1650575744",
        status_code: 500,
      },
    ),
    generateBreadcrumbEvent(
      "Error",
      "ERR_FAILED (-2) loading 'app://./index.html?isMultiEngineOffMode=false'",
      {
        reason: "crashed",
        serviceName: "GPU",
      },
    ),
    generateExceptionEvent(
      "EXCEPTION_BREAKPOINT / 0x7ff77e0132ab",
      "Fatal Error: EXCEPTION_BREAKPOINT / 0x7ff77e0132ab",
    ),
    generateExceptionEvent(
      "Error",
      "Fatal Error: Simulated Exception / 0x7ff6710fafc7",
    ),
    generateExceptionEvent("Error", "crash_reporter::DumpWithoutCrashing"),
    generateExceptionEvent("Error", "'GPU' process exited with 'abnormal-exit'"),
    generateExceptionEvent("Error", "'Utility' process exited with 'abnormal-exit'"),
    generateExceptionEvent(
      "Error",
      "Fatal Error: SIGSEGV / SEGV_MAPERR / 0x58c6261c1a69\n" +
        "ares_dns_rr_get_ttl",
    ),
    generateExceptionEvent("Error", "Fatal Error: SIGBUS / BUS_ADRERR / 0x59ed886fc2d0"),
    generateExceptionEvent(
      "Error",
      "Fatal Error: SIGBUS / BUS_ADRERR / 0x56386bdc1000\n" +
        "v8::CodeEvent::GetScriptColumn",
    ),
    generateExceptionEvent(
      "Error",
      "Fatal Error: EXCEPTION_ACCESS_VIOLATION_READ / 0x0\n" +
        "BaseThreadInitThunk\n" +
        "D3DCompiler_47.dll",
    ),
    ({
      exception: {
        values: [
          {
            type: "EXCEPTION_ACCESS_VIOLATION_READ / 0x0",
            value: "Fatal Error: EXCEPTION_ACCESS_VIOLATION_READ / 0x0",
            stacktrace: {
              frames: [
                {
                  function: "BaseThreadInitThunk",
                },
                {
                  package:
                    "C:\\WINDOWS\\System32\\DriverStore\\FileRepository\\u0417877.inf_amd64_8b2c2b61b3f8a9e5\\B417004\\atidxx64.dll",
                },
              ],
            },
          },
        ],
      },
    } as unknown as Event),
    ({
      exception: {
        values: [
          {
            type: "EXCEPTION_ACCESS_VIOLATION_READ / 0x0",
            value: "Fatal Error: EXCEPTION_ACCESS_VIOLATION_READ / 0x0",
            stacktrace: {
              frames: [
                {
                  function: "BaseThreadInitThunk",
                },
              ],
            },
          },
        ],
      },
    } as unknown as Event),
    ({
      exception: {
        values: [
          {
            type: "SIGSEGV / 0x0",
            value: "Fatal Error: SIGSEGV / 0x0",
            stacktrace: {
              frames: [
                {
                  function: "v8::internal::GlobalHandles::Destroy",
                },
              ],
            },
          },
        ],
      },
    } as unknown as Event),
  ])("既知の破棄対象エラーを送信しない", (event) => {
    expect(filterSentryErrorEvent(event)).toBeNull();
  });

  it.each([
    generateExceptionEvent(
      "TypeError",
      "Cannot read properties of undefined (reading 'container')",
    ),
    generateExceptionEvent(
      "Error",
      "audioQuery is not defined for audioItem",
    ),
    generateExceptionEvent(
      "ResponseError",
      "Response returned an error code",
    ),
    generateExceptionEvent(
      "Error",
      "話者の変更に失敗しました：\n26c059c8-7267-4b20-84f6-d163cc04c1d2：\nResponseError: Response returned an error code",
    ),
  ])("本体側の修正余地があるエラーを残す", (event) => {
    expect(filterSentryErrorEvent(event)).toBe(event);
  });

  it("initialize_speaker 以外の 500 は同じイベント内に initialize_speaker のパンくずがあっても残す", () => {
    const event: Event = {
      ...generateExceptionEvent("ResponseError", "Response returned an error code"),
      breadcrumbs: [
        {
          type: "http",
          category: "fetch",
          data: {
            url: "http://127.0.0.1:10101/initialize_speaker?speaker=1878365376",
            status_code: 204,
          },
        },
        {
          type: "http",
          category: "fetch",
          data: {
            url: "http://127.0.0.1:10101/synthesis?speaker=13055520&enable_interrogative_upspeak=false",
            status_code: 500,
          },
        },
      ],
    };

    expect(filterSentryErrorEvent(event)).toBe(event);
  });

  it("同じ Failed to fetch でも発生経路が不明なエラーを残す", () => {
    const event = generateBreadcrumbEvent("TypeError", "Failed to fetch", {
      url: "https://example.com/some-api",
    });

    expect(filterSentryErrorEvent(event)).toBe(event);
  });

  it("循環参照を含む追加情報でも送信前フィルタ内で例外を投げない", () => {
    const extra: Record<string, unknown> = {
      reason: "debug metadata",
    };
    extra.self = extra;
    const event: Event = {
      ...generateExceptionEvent("Error", "修正余地がある通常エラー"),
      extra,
    };

    expect(filterSentryErrorEvent(event)).toBe(event);
  });

  it("循環参照を含むHTTP情報でもinitialize_speakerの500を判定できる", () => {
    const data: Record<string, unknown> = {
      url: "http://127.0.0.1:10101/initialize_speaker?speaker=1650575744",
      status_code: 500,
    };
    data.self = data;
    const event = generateBreadcrumbEvent(
      "ResponseError",
      "Response returned an error code",
      data,
    );

    expect(filterSentryErrorEvent(event)).toBeNull();
  });
});

describe("filterSentryTransactionEvent", () => {
  it.each([
    {
      type: "transaction" as const,
      transaction: "Large HTTP payload",
      spans: [
        {
          span_id: "aaaaaaaaaaaaaaaa",
          trace_id: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          start_timestamp: 1,
          description:
            "GET http://127.0.0.1:10101/speaker_info?speaker_uuid=561e4e59-3bc9-4726-9028-44a3c12a6f1d",
        },
      ],
    },
    {
      type: "transaction" as const,
      transaction: "N+1 API Call",
      request: {
        url: "http://127.0.0.1:10101/speaker_info?speaker_uuid=561e4e59-3bc9-4726-9028-44a3c12a6f1d",
      },
    },
    {
      type: "transaction" as const,
      transaction: "/index.html",
      spans: [
        {
          span_id: "aaaaaaaaaaaaaaaa",
          trace_id: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          start_timestamp: 1,
          description: "GET http://127.0.0.1:10101/engine_manifest",
        },
      ],
    },
  ] satisfies Event[])("既知のローカル Engine 性能イベントを送信しない", (event) => {
    expect(filterSentryTransactionEvent(event)).toBeNull();
  });

  it("通常の画面トランザクションを残す", () => {
    const event: Event = {
      type: "transaction",
      transaction: "/index.html",
    };

    expect(filterSentryTransactionEvent(event)).toBe(event);
  });
});
