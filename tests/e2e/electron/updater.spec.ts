import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import type http from "node:http";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import {
  _electron as electron,
  expect,
  type Locator,
  Page,
  test,
} from "@playwright/test";
import { getNewestQuasarDialog } from "../locators";
import { startUpdateTestServer as startUpdateTestHttpServer } from "../../../tools/update-test-server";
import {
  UPDATE_TEST_VERSION,
  getInstallerFileName,
} from "@/domain/updateDownload";

const execFileAsync = promisify(execFile);
const updateTestPort = 18080;
const updateTestUrl = `http://127.0.0.1:${updateTestPort}`;

/** update-test-server が HTTP で応答するまで待つ上限時間 (ms) */
const UPDATE_SERVER_STARTUP_TIMEOUT_MS = 30000;
/** update-test-server の起動待ちポーリング間隔 (ms) */
const UPDATE_SERVER_POLL_INTERVAL_MS = 500;
/** updater E2E 全体のタイムアウト時間 (ms) */
const UPDATE_E2E_TIMEOUT_MS = 20 * 60 * 1000;
/** Engine の初回ダウンロード後に表示されるダイアログを待つ上限時間 (ms) */
const INITIAL_OR_UPDATE_DIALOG_TIMEOUT_MS = 6 * 60 * 1000;
/** 初回起動ダイアログまたは更新通知ダイアログを探す間隔 (ms) */
const INITIAL_OR_UPDATE_DIALOG_POLL_INTERVAL_MS = 500;
/** Windows インストーラー起動ボタンの click を待つ上限時間 (ms) */
const WINDOWS_INSTALLER_CLICK_TIMEOUT_MS = 30 * 1000;
/** Windows インストーラーのプロセス出現を待つ上限時間 (ms) */
const WINDOWS_INSTALLER_PROCESS_TIMEOUT_MS = 60 * 1000;
/** CI の初回起動ダイアログを抑制するために保存する設定ファイルのマイグレーションバージョン */
const E2E_CONFIG_MIGRATION_VERSION = "1.2.0";

test.describe.configure({ mode: "serial" });

/**
 * updater E2E で使用するパッケージ済みアプリのディレクトリパスを取得する。
 * @returns OS / CPU に対応する electron-builder の出力ディレクトリパス
 */
function getPackagedAppDirectoryPath(): string {
  if (process.platform === "win32") {
    return path.resolve("dist_electron", "win-unpacked");
  }

  if (process.platform === "darwin") {
    return path.resolve(
      "dist_electron",
      process.arch === "arm64" ? "mac-arm64" : "mac",
    );
  }

  throw new Error(`Unsupported platform: ${process.platform}`);
}

/**
 * build.yml の zip 成果物から展開されたアプリケーションの実行ファイルパスを取得する。
 * @returns Electron アプリケーションの実行ファイルパス
 */
function getAppExecutablePath(): string {
  if (process.platform === "win32") {
    return path.join(getPackagedAppDirectoryPath(), "AivisSpeech.exe");
  }

  if (process.platform === "darwin") {
    return path.join(
      getPackagedAppDirectoryPath(),
      "AivisSpeech.app",
      "Contents",
      "MacOS",
      "AivisSpeech",
    );
  }

  throw new Error(`Unsupported platform: ${process.platform}`);
}

/**
 * パッケージ済みアプリから見たデフォルトエンジンの実行ファイルパスを取得する。
 * @returns パッケージ済みアプリの cwd から解決できるエンジン実行ファイルパス
 */
function getEngineExecutionFilePath(): string {
  // ローカル実行時は AivisSpeech と同じ階層の AivisSpeech-Engine ディレクトリに
  // AivisSpeech Engine のリポジトリがあり、かつ uv run task build で事前にビルド済みバイナリが配置されている前提で、
  // ../AivisSpeech-Engine/dist/run/run.exe をデフォルトエンジンの実行ファイルパスとして使う
  // CI では build-and-upload ジョブが作成したアーティファクトに AivisSpeech Engine が同梱されている前提で検証する
  if (process.env.CI !== "true") {
    return path.resolve(
      "..",
      "AivisSpeech-Engine",
      "dist",
      "run",
      process.platform === "win32" ? "run.exe" : "run",
    );
  }

  if (process.platform === "win32") {
    return "AivisSpeech-Engine/run.exe";
  }

  if (process.platform === "darwin") {
    return "../Resources/AivisSpeech-Engine/run";
  }

  throw new Error(`Unsupported platform: ${process.platform}`);
}

/**
 * パッケージ済みアプリのメインプロセスに渡すデフォルトエンジン情報を生成する。
 * @returns VITE_DEFAULT_ENGINE_INFOS に設定する JSON 文字列
 */
function createDefaultEngineInfosEnv(): string {
  return JSON.stringify([
    {
      uuid: "1b4a5014-d9fd-11ee-b97d-83c170a68ed3",
      name: "AivisSpeech Engine",
      executionEnabled: true,
      executionFilePath: getEngineExecutionFilePath(),
      executionArgs: [],
      host: "http://127.0.0.1:10101",
    },
  ]);
}

/**
 * 現在の OS / CPU に対応する updater のインストーラーファイル名を取得する。
 * @returns テストサーバーからダウンロードされるインストーラーファイル名
 */
function getExpectedInstallerFileName(): string {
  if (process.platform === "win32") {
    return getInstallerFileName("windows-x64", UPDATE_TEST_VERSION);
  }

  if (process.platform === "darwin" && process.arch === "x64") {
    return getInstallerFileName("macos-x64", UPDATE_TEST_VERSION);
  }

  if (process.platform === "darwin" && process.arch === "arm64") {
    return getInstallerFileName("macos-arm64", UPDATE_TEST_VERSION);
  }

  throw new Error(
    `Unsupported platform for updater E2E. platform: ${process.platform}, arch: ${process.arch}`,
  );
}

/**
 * Electron 起動時に渡せるよう、未定義値を含まない環境変数を生成する。
 * @returns Playwright の electron.launch() に渡せる環境変数
 */
function createElectronLaunchEnv(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] => {
      return entry[1] != null;
    }),
  );
}

/**
 * パッケージ済みアプリを updater E2E 用の更新配信先で起動する環境変数を生成する。
 * @returns Electron 起動時に渡す環境変数
 */
function createPackagedAppLaunchEnvironment(): Record<string, string> {
  const env = createElectronLaunchEnv();
  env.AIVISSPEECH_UPDATE_TEST_URL = updateTestUrl;
  env.VITE_DEFAULT_ENGINE_INFOS = createDefaultEngineInfosEnv();

  return env;
}

/**
 * Electron の appData ディレクトリパスを取得する。
 * @returns OS ごとの appData ディレクトリパス
 */
function getAppDataDirectoryPath(): string {
  if (process.platform === "win32") {
    return process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming");
  }

  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support");
  }

  throw new Error(`Unsupported platform: ${process.platform}`);
}

/**
 * パッケージ済みアプリの userData ディレクトリパスを取得する。
 * main.ts では app.getPath("appData") と VITE_APP_NAME から userData を決定しているため、
 * テスト側でも同じ名前を使って起動前の config.json を配置する。
 * @returns OS ごとの AivisSpeech userData ディレクトリパス
 */
function getPackagedAppUserDataDirectoryPath(): string {
  const appName = process.env.VITE_APP_NAME;
  if (appName == null || appName === "") {
    throw new Error("VITE_APP_NAME is not set.");
  }

  return path.join(getAppDataDirectoryPath(), appName);
}

/**
 * CI の updater E2E に不要な初回確認ダイアログを抑制する。
 * @returns Promise
 */
async function prepareCiConfig(): Promise<void> {
  if (process.env.CI !== "true") {
    return;
  }

  const userDataDirectoryPath = getPackagedAppUserDataDirectoryPath();
  await fs.mkdir(userDataDirectoryPath, { recursive: true });
  await fs.writeFile(
    path.join(userDataDirectoryPath, "config.json"),
    JSON.stringify(
      {
        acceptRetrieveTelemetry: "Refused",
        acceptTerms: "Accepted",
        skipUpdateVersion: "0.0.0",
        __internal__: {
          migrations: {
            version: E2E_CONFIG_MIGRATION_VERSION,
          },
        },
      },
      undefined,
      2,
    ),
  );
  console.log(`Prepared CI config. path: ${userDataDirectoryPath}`);
}

/**
 * updater テストサーバーを起動し、HTTP 応答できるまで待機する。
 * @returns テスト終了時に呼び出す cleanup 関数
 */
async function startUpdateTestServer(): Promise<() => Promise<void>> {
  const server = await startUpdateTestHttpServer({
    port: updateTestPort,
  });

  const startedAt = Date.now();
  while (Date.now() - startedAt < UPDATE_SERVER_STARTUP_TIMEOUT_MS) {
    const response = await fetch(`${updateTestUrl}/updateInfos.json`).catch(
      () => undefined,
    );
    if (response?.ok === true) {
      return async () => {
        await closeServer(server);
      };
    }
    await new Promise((resolve) =>
      setTimeout(resolve, UPDATE_SERVER_POLL_INTERVAL_MS),
    );
  }

  await closeServer(server);
  throw new Error(
    `Failed to start update test server within ${UPDATE_SERVER_STARTUP_TIMEOUT_MS}ms.`,
  );
}

/**
 * HTTP サーバーを停止する。
 * @param server 停止する HTTP サーバー
 */
async function closeServer(server: http.Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error != null) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

/**
 * 初回起動時の確認ダイアログが表示された場合だけ閉じる。
 * @param page Electron のメインウィンドウ
 */
async function completeInitialDialogsIfNeeded(page: Page): Promise<void> {
  const startedAt = Date.now();
  let firstDialog: "terms" | "update" | undefined;

  while (Date.now() - startedAt < INITIAL_OR_UPDATE_DIALOG_TIMEOUT_MS) {
    if (
      (await page
        .getByText("ライセンス情報")
        .isVisible()
        .catch(() => false)) === true
    ) {
      firstDialog = "terms";
      break;
    }

    if (
      (await page
        .getByText("アップデートがあります")
        .isVisible()
        .catch(() => false)) === true
    ) {
      firstDialog = "update";
      break;
    }

    await new Promise((resolve) =>
      setTimeout(resolve, INITIAL_OR_UPDATE_DIALOG_POLL_INTERVAL_MS),
    );
  }

  if (firstDialog == null) {
    const visibleText = await page
      .locator("body")
      .innerText({ timeout: 1_000 })
      .catch((error) => {
        return `Failed to read body text: ${String(error)}`;
      });
    throw new Error(
      `Failed to find initial dialogs or update dialog within ${INITIAL_OR_UPDATE_DIALOG_TIMEOUT_MS}ms.\nVisible text:\n${visibleText.slice(0, 4000)}`,
    );
  }

  if (firstDialog === "update") {
    return;
  }

  await page.getByRole("button", { name: "同意してはじめる" }).click();

  await expect(page.getByText("使いやすさ向上のためのお願い")).toBeVisible({
    timeout: INITIAL_OR_UPDATE_DIALOG_TIMEOUT_MS,
  });
  await page.getByRole("button", { name: "許可" }).click();
}

/**
 * Windows インストーラーの起動イベントを待機してから終了する。
 * @param installerFileName インストーラーのファイル名
 */
async function waitAndKillWindowsInstaller(
  installerFileName: string,
): Promise<void> {
  const helperScriptPath = path.resolve(
    "tests",
    "e2e",
    "electron",
    "wait-and-kill-windows-installer.ps1",
  );
  const powershellResult = await execFileAsync("powershell", [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    helperScriptPath,
    "-InstallerFileName",
    installerFileName,
    "-TimeoutSeconds",
    String(Math.ceil(WINDOWS_INSTALLER_PROCESS_TIMEOUT_MS / 1000)),
  ]);

  console.log(
    `Detected Windows installer launch. result: ${powershellResult.stdout.trim()}`,
  );
}

/**
 * Windows のインストーラー起動ボタンを押し、起動したインストーラーを終了する。
 * @param installerButton インストーラー起動ボタンの Locator
 * @param installerFileName インストーラーのファイル名
 */
async function clickAndKillWindowsInstaller(
  installerButton: Locator,
  installerFileName: string,
): Promise<void> {
  const installerProcessPromise =
    waitAndKillWindowsInstaller(installerFileName);
  const clickPromise = installerButton
    .click({ timeout: WINDOWS_INSTALLER_CLICK_TIMEOUT_MS })
    .catch((error) => {
      console.log(
        `Windows installer launch click did not complete normally. error: ${String(error)}`,
      );
    });

  await Promise.all([installerProcessPromise, clickPromise]);
}

/**
 * macOS の DMG マウントを待機してから detach する。
 */
async function waitAndDetachMacDmg(): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 60_000) {
    const hdiutilResult = await execFileAsync("hdiutil", ["info"]).catch(
      () => undefined,
    );

    if (hdiutilResult?.stdout.includes("/Volumes/AivisSpeech") === true) {
      await execFileAsync("hdiutil", ["detach", "/Volumes/AivisSpeech"]).catch(
        () => undefined,
      );
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error("Failed to detect mounted AivisSpeech DMG.");
}

/**
 * レンダラーから見たアップデート情報 URL と fetch 可否を検証する。
 * @param page Electron のメインウィンドウ
 */
async function verifyRendererCanFetchUpdateInfos(page: Page): Promise<void> {
  const updateInfosFetchResult = await page.evaluate(async () => {
    const updateInfosUrl = await window.backend.getUpdateInfosUrl();
    const response = await fetch(updateInfosUrl);

    return {
      body: await response.text(),
      ok: response.ok,
      status: response.status,
      updateInfosUrl,
    };
  });

  console.log(
    `Renderer update infos URL: ${updateInfosFetchResult.updateInfosUrl}`,
  );

  expect(updateInfosFetchResult.updateInfosUrl).toBe(
    `${updateTestUrl}/updateInfos.json`,
  );
  expect(updateInfosFetchResult.ok).toBe(true);
  expect(updateInfosFetchResult.body).toContain(UPDATE_TEST_VERSION);
}

test("パッケージ済みアプリで更新通知から実インストーラー起動まで動作する", async () => {
  test.setTimeout(UPDATE_E2E_TIMEOUT_MS);

  const stopUpdateTestServer = await startUpdateTestServer();
  await prepareCiConfig();
  const packagedAppLaunchEnvironment = createPackagedAppLaunchEnvironment();
  const expectedInstallerFileName = getExpectedInstallerFileName();
  const expectedInstallerPath = path.join(
    os.homedir(),
    "Downloads",
    expectedInstallerFileName,
  );
  const downloadStartedAt = Date.now();

  try {
    const app = await electron.launch({
      executablePath: getAppExecutablePath(),
      cwd: path.dirname(getAppExecutablePath()),
      env: packagedAppLaunchEnvironment,
      // CI 環境ではタイムアウト時間を長めに設定
      timeout: process.env.CI ? 5 * 60 * 1000 : 60 * 1000,
    });

    expect(
      await app.evaluate(() => process.env.AIVISSPEECH_UPDATE_TEST_URL),
    ).toBe(updateTestUrl);

    app.on("console", (message) => {
      console.log(message.text());
    });

    const page = await app.firstWindow({
      // CI 環境ではタイムアウト時間を長めに設定
      timeout: process.env.CI ? 120 * 1000 : 60 * 1000,
    });
    page.on("console", (message) => {
      console.log(`[renderer:${message.type()}] ${message.text()}`);
    });
    page.on("pageerror", (error) => {
      console.log(`[renderer:pageerror] ${error.message}`);
    });
    page.on("requestfailed", (request) => {
      console.log(
        `[renderer:requestfailed] ${request.url()} ${request.failure()?.errorText ?? ""}`,
      );
    });

    await verifyRendererCanFetchUpdateInfos(page);
    await completeInitialDialogsIfNeeded(page);

    const dialog = getNewestQuasarDialog(page);
    await expect(dialog.getByText("アップデートがあります")).toBeVisible({
      timeout: 60_000,
    });
    await dialog.getByRole("button", { name: "アップデート" }).click();

    await expect(
      dialog.getByRole("button", {
        name:
          process.platform === "darwin"
            ? "インストーラーを開く"
            : "インストールして再起動",
      }),
    ).toBeVisible({
      timeout: 15 * 60 * 1000,
    });

    const installerStat = await fs.stat(expectedInstallerPath);
    expect(installerStat.size).toBeGreaterThan(0);
    expect(installerStat.mtimeMs).toBeGreaterThanOrEqual(downloadStartedAt);

    const launchInstallerButton = dialog.getByRole("button", {
      name:
        process.platform === "darwin"
          ? "インストーラーを開く"
          : "インストールして再起動",
    });

    // Windows は「インストールして再起動」でインストーラーに制御が移り、アプリ側は既に終了していることがある
    // その場合 app.close() は例外になり得るため無視する
    if (process.platform === "win32") {
      await clickAndKillWindowsInstaller(
        launchInstallerButton,
        expectedInstallerFileName,
      );
      await app.close().catch(() => undefined);
      return;
    }

    // macOS はインストーラー起動後も Electron アプリが生存する想定なので、例外を握りつぶさず通常どおり close する
    if (process.platform === "darwin") {
      await launchInstallerButton.click();
      await waitAndDetachMacDmg();
      await app.close();
      return;
    }

    throw new Error(`Unsupported platform: ${process.platform}`);
  } finally {
    await stopUpdateTestServer();
  }
});
