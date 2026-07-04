import ga4mp from "@analytics-debugger/ga4mp";

import { getAppInfos } from "@/domain/appInfo";


const GA4_MEASUREMENT_ID = "G-TEMWCS6D7B";
let isEnabled = false;
type GA4Instance = {
  trackEvent: (eventName: string, eventParameters?: Record<string, unknown>) => void;
};

let ga4instance: GA4Instance | null = null;

// GA4 の LocalStorage キー
// 本家の Cookie 仕様に合わせている
// ref: https://www.bbccss.com/explanation-of-cookie-values-used-by-ga4.html
const GA4_CLIENT_ID_KEY = "_ga";
const GA4_SESSION_KEY = `_ga_${GA4_MEASUREMENT_ID.replace("G-", "")}`;

// セッションタイムアウト (30分、秒単位)
// ref: 公式のデフォルト値は30分
const SESSION_TIMEOUT = 30 * 60;

type GA4SessionData = {
  session_id: string;
  session_count: number;
  engagement: 0 | 1;
  timestamp: number;
};

/**
 * GA4 形式のクライアント ID を取得または新規作成する
 * GA4MP で必要な形式 ({random}.{timestamp}) でクライアント ID を返す
 */
function getOrCreateClientId(): string {
  const randomInt = () => Math.floor(Math.random() * (2147483647 - 0 + 1) + 0);
  const timestampInSeconds = () => Math.floor(Date.now() / 1000);

  const storedClientId = localStorage.getItem(GA4_CLIENT_ID_KEY);
  if (storedClientId) {
    // LocalStorage に保存されている GA4 形式のクライアント ID を解析し、
    // GA4MP で必要な形式 ({random}.{timestamp}) で返す
    // Format: GA1.1.{random}.{timestamp}
    const [, , random, timestamp] = storedClientId.split(".");
    return `${random}.${timestamp}`;
  }

  // 新しいクライアント ID を新規作成し、LocalStorage に保存する
  const randomNumber = randomInt();
  const timestamp = timestampInSeconds();
  const clientId = `${randomNumber}.${timestamp}`;
  localStorage.setItem(GA4_CLIENT_ID_KEY, `GA1.1.${clientId}`);

  // GA4MP で必要な形式 ({random}.{timestamp}) で返す (GA1 から始まるヘッダは含まない)
  return clientId;
}

/**
 * GA4 のセッションデータを解析する
 */
function parseGA4SessionString(sessionStr: string | null): GA4SessionData | null {
  if (!sessionStr) return null;

  try {
    // Format: GS1.1.{session_id}.{session_count}.{engagement}.{timestamp}.0.0.0
    const [prefix1, prefix2, session_id, session_count, engagement, timestamp] = sessionStr.split(".");
    if (prefix1 !== "GS1" || prefix2 !== "1") return null;

    return {
      session_id,
      session_count: Number(session_count),
      engagement: Number(engagement) as 0 | 1,
      timestamp: Number(timestamp),
    };
  } catch {
    return null;
  }
}

/**
 * GA4 のセッションデータを作成する
 */
function createGA4SessionString(data: GA4SessionData): string {
  // Format: GS1.1.{session_id}.{session_count}.{engagement}.{timestamp}.0.0.0
  return `GS1.1.${data.session_id}.${data.session_count}.${data.engagement}.${data.timestamp}.0.0.0`;
}

/**
 * セッションがタイムアウトしているかどうかを確認する
 */
function isSessionTimedOut(): boolean {
  const sessionStr = localStorage.getItem(GA4_SESSION_KEY);
  const sessionData = parseGA4SessionString(sessionStr);
  if (!sessionData) return true;

  const now = Math.floor(Date.now() / 1000);
  return now - sessionData.timestamp > SESSION_TIMEOUT;
}

/**
 * セッションデータを取得または新規作成する
 */
function getOrCreateSession(): GA4SessionData {
  const now = Math.floor(Date.now() / 1000);
  const sessionStr = localStorage.getItem(GA4_SESSION_KEY);
  const sessionData = parseGA4SessionString(sessionStr);

  // セッションデータがない、またはセッションタイムアウトしている場合は新規作成する
  if (!sessionData || isSessionTimedOut()) {
    // 新規セッションを作成する
    const newSessionData: GA4SessionData = {
      session_id: String(now),
      session_count: (sessionData?.session_count ?? 0) + 1,
      engagement: 1, // 簡易実装のため、初期状態もエンゲージメントとする
      timestamp: now,
    };

    localStorage.setItem(GA4_SESSION_KEY, createGA4SessionString(newSessionData));

    // session_start イベントを送信
    // GA4 インスタンスの初期化を待ってからイベントを送信する
    setTimeout(() => {
      if (ga4instance) {
        ga4instance.trackEvent("session_start");
      }
    }, 500);

    return newSessionData;
  }

  // 既存のセッションを継続する
  // 最後のアクティビティ時刻を更新
  sessionData.timestamp = now;
  localStorage.setItem(GA4_SESSION_KEY, createGA4SessionString(sessionData));

  return sessionData;
}

/**
 * Google Analytics 4 を Electron で使うための composable
 * ref: https://ga4mp.dev/#/
 */
export function useAnalytics() {
  const enable = () => {
    isEnabled = true;
  };

  const disable = () => {
    isEnabled = false;
  };

  const trackEvent = async (
    eventName: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    eventParameters?: Record<string, any>,
  ) => {
    if (!isEnabled) return;

    // 新規セッション開始時またはセッションタイムアウト時のみ、新しいインスタンスを作成
    // セッションの継続タイムスタンプを記録するため、状態に関わらず毎回 getOrCreateSession() を呼ぶ必要がある
    const shouldInitializeGA4 = ga4instance == null || isSessionTimedOut();
    const client_id = getOrCreateClientId();
    const { session_id, session_count } = getOrCreateSession();
    if (shouldInitializeGA4) {
      // 新規セッション取得前に document.title にタイトルを設定しておくことで、タイミング次第では
      // テレメトリで送信されるタイトルにバージョン情報が含まれなくなる ("AivisSpeech" のみになってしまう) ことを防ぐ
      // document.title への今後の変更は GA4MP 側には反映されない
      const appInfo = getAppInfos();
      window.document.title = `AivisSpeech ${appInfo.version}`;
      ga4instance = ga4mp([GA4_MEASUREMENT_ID], {
        debug: true,
        non_personalized_ads: true,
        client_id: client_id,
        session_id: session_id,
        session_number: session_count,
      });
    }
    ga4instance!.trackEvent(eventName, eventParameters);
  };

  return {
    enable,
    disable,
    trackEvent,
  };
}
