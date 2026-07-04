"use strict";

import path from "path";

import fs from "fs";
import { pathToFileURL } from "url";
import { app, dialog, Menu, net, protocol, session, shell } from "electron";
import installExtension, { VUEJS_DEVTOOLS } from "electron-devtools-installer";

import * as Sentry from "@sentry/electron/main";
import electronLog from "electron-log/main";
import dayjs from "dayjs";
import { initializeEngineInfoManager } from "./manager/engineInfoManager";
import { initializeEngineProcessManager } from "./manager/engineProcessManager";
import { initializeVvppManager, isVvppFile } from "./manager/vvppManager";
import {
  getWindowManager,
  initializeWindowManager,
} from "./manager/windowManager";
import configMigration014 from "./configMigration014";
import { initializeRuntimeInfoManager } from "./manager/RuntimeInfoManager";
import { registerIpcMainHandle, ipcMainSendProxy, IpcMainHandle } from "./ipc";
import { getConfigManager } from "./electronConfig";
import { getEngineAndVvppController } from "./engineAndVvppController";
import { getIpcMainHandle } from "./ipcMainHandle";
import { EngineInfo } from "@/type/preload";
import { isMac, isProduction } from "@/helpers/platform";
import { createLogger } from "@/helpers/log";
import { filterSentryErrorEvent } from "@/domain/sentryEventFilter";

type SingleInstanceLockData = {
  filePath: string | undefined;
};

const isDevelopment = import.meta.env.DEV;
const isTest = import.meta.env.MODE === "test";

if (isDevelopment) {
  app.commandLine.appendSwitch("remote-debugging-port", "9222");
}

let suffix = "";
if (isTest) {
  suffix = "-Test";
} else if (isDevelopment) {
  suffix = "-Dev";
}
const appName = import.meta.env.VITE_APP_NAME + suffix;
console.log(`Environment: ${import.meta.env.MODE}, appData: ${appName}`);

// バージョン0.14より前の設定ファイルの保存場所
const beforeUserDataDir = app.getPath("userData"); // マイグレーション用

// app.getPath("userData")を呼ぶとディレクトリが作成されてしまうため空なら削除する。
let errorForRemoveBeforeUserDataDir: Error | undefined;
try {
  fs.rmdirSync(beforeUserDataDir, { recursive: false });
} catch (e) {
  const err = e as NodeJS.ErrnoException;
  if (err?.code !== "ENOTEMPTY") {
    // electron-logを初期化してからエラーを出力する
    errorForRemoveBeforeUserDataDir = err;
  }
}

// appnameをAivisSpeechとしてsetする
app.setName(appName);

// Electronの設定ファイルの保存場所を変更
const fixedUserDataDir = path.join(app.getPath("appData"), appName);
if (!fs.existsSync(fixedUserDataDir)) {
  fs.mkdirSync(fixedUserDataDir);
}
app.setPath("userData", fixedUserDataDir);
if (!isDevelopment) {
  configMigration014({ fixedUserDataDir, beforeUserDataDir }); // 以前のファイルがあれば持ってくる
}

// Sentry によるエラートラッキングを開始 (production 環境のみ有効)
// app.setPath("userData") を設定した後に呼ぶ必要がある
// ref: https://docs.sentry.io/platforms/javascript/guides/electron/
if (isProduction) {
  Sentry.init({
    dsn: "https://ab3b3a5b0e9d1c90dae483f740dbc78b@o4508551725383680.ingest.us.sentry.io/4508555292901376",
    release: `AivisSpeech@${app.getVersion() === "999.999.999" ? "latest" : app.getVersion()}`,
    environment: "production",
    // Electron / Chromium の minidump は JavaScript 側の修正に使いにくく、Sentry の quota 消費も大きい
    // JavaScript 例外の収集は残し、ネイティブクラッシュの送信だけを止める
    integrations: Sentry.getDefaultIntegrations({}).filter(
      (integration) => integration.name !== "SentryMinidump",
    ),
    // main プロセスでもエラー以外の利用状況は収集しない
    // AivisSpeech Engine 側と同じく、トレースは送信量に対して得られる情報が少ないため明示的に無効化する
    tracesSampleRate: 0.0,
    // ファイルロックや Chromium ネイティブクラッシュなど、実測済みの既知ノイズを送信前に止める
    beforeSend: filterSentryErrorEvent,
  });
}

electronLog.initialize({ preload: false });
// silly 以上のログをコンソールに出力
electronLog.transports.console.format = "[{y}/{m}/{d} {h}:{i}:{s}] {level}: {text}";
electronLog.transports.console.level = "silly";

// info 以上のログをファイルに出力
const prefix = dayjs().format("YYYYMMDD_HHmmss");
electronLog.transports.file.format = "[{y}/{m}/{d} {h}:{i}:{s}] {level}: {text}";
electronLog.transports.file.level = "info";
electronLog.transports.file.fileName = `${prefix}.log`;

const log = createLogger("main");

if (errorForRemoveBeforeUserDataDir != undefined) {
  log.error(errorForRemoveBeforeUserDataDir);
}

process.on("uncaughtException", (error) => {
  log.error(error);

  if (isDevelopment) {
    app.exit(1);
  } else {
    const { message, name } = error;
    let detailedMessage = "";
    detailedMessage += "メインプロセスで原因不明のエラーが発生しました。\n";
    detailedMessage += `エラー名: ${name}\n`;
    detailedMessage += `メッセージ: ${message}\n`;
    if (error.stack) {
      detailedMessage += `スタックトレース: \n${error.stack}`;
    }

    dialog.showErrorBox("エラーが発生しました", detailedMessage);
  }
});
process.on("unhandledRejection", (reason) => {
  log.error(reason);
});

function getAppPaths() {
  let appDirPath: string;
  let __static: string;

  if (isDevelopment) {
    // import.meta.dirnameはdist_electronを指しているので、一つ上のディレクトリに移動する
    appDirPath = path.resolve(import.meta.dirname, "..");
    __static = path.join(appDirPath, "public");
  } else {
    appDirPath = path.dirname(app.getPath("exe"));
    __static = import.meta.dirname;
  }

  return { appDirPath, __static };
}
const { appDirPath, __static } = getAppPaths();

// 製品版はカレントディレクトリを.exeのパスにする
// TODO: ディレクトリを移動しないようにしたい
if (!isDevelopment) {
  process.chdir(appDirPath);
}

protocol.registerSchemesAsPrivileged([
  { scheme: "app", privileges: { secure: true, standard: true, stream: true } },
]);

// ソフトウェア起動時はプロトコルを app にする
void app.whenReady().then(() => {
  protocol.handle("app", (request) => {
    // 読み取り先のファイルがインストールディレクトリ内であることを確認する
    // ref: https://www.electronjs.org/ja/docs/latest/api/protocol#protocolhandlescheme-handler
    const { pathname } = new URL(request.url);
    const pathToServe = path.resolve(path.join(import.meta.dirname, pathname));
    const relativePath = path.relative(import.meta.dirname, pathToServe);
    const isUnsafe =
      path.isAbsolute(relativePath) ||
      relativePath.startsWith("..") ||
      relativePath === "";
    if (isUnsafe) {
      log.error(`Bad Request URL: ${request.url}`);
      return new Response("bad", {
        status: 400,
        headers: { "content-type": "text/html" },
      });
    }
    return net.fetch(pathToFileURL(pathToServe).toString());
  });
});

// 信頼できるオリジン（開発サーバーまたは app プロトコル）からのセッション権限リクエストのみ許可し、それ以外は拒否
void app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler(
    (webContents, permission, callback, { requestingUrl }) => {
      const parsedUrl = new URL(webContents.getURL());
      const parsedRequestingUrl = new URL(requestingUrl);
      let isAllowedResource: boolean;
      if (
        isDevelopment &&
        import.meta.env.VITE_DEV_SERVER_URL != undefined
      ) {
        const { origin } = new URL(import.meta.env.VITE_DEV_SERVER_URL);
        isAllowedResource =
          parsedUrl.origin === origin && parsedRequestingUrl.origin === origin;
      } else {
        isAllowedResource =
          parsedUrl.protocol === "app:" &&
          parsedRequestingUrl.protocol === "app:";
      }
      return callback(isAllowedResource);
    },
  );
});

// engine
const vvppEngineDir = path.join(app.getPath("userData"), "vvpp-engines");

if (!fs.existsSync(vvppEngineDir)) {
  fs.mkdirSync(vvppEngineDir);
}

const onEngineProcessError = (engineInfo: EngineInfo, error: Error) => {
  const engineId = engineInfo.uuid;
  log.error(`ENGINE ${engineId} ERROR:`, error);

  // winが作られる前にエラーが発生した場合はwinへの通知を諦める
  // FIXME: winが作られた後にエンジンを起動させる
  const win = windowManager.win;
  if (win != undefined) {
    ipcMainSendProxy.DETECTED_ENGINE_ERROR(win, { engineId });
  } else {
    log.error("onEngineProcessError: win is undefined");
  }

  dialog.showErrorBox("音声合成エンジンエラー", error.message);
};

const appState = {
  willQuit: false,
};

initializeWindowManager({
  appStateGetter: () => appState,
  isDevelopment,
  isTest,
  staticDir: __static,
});
initializeRuntimeInfoManager({
  runtimeInfoPath: path.join(app.getPath("userData"), "runtime-info.json"),
  appVersion: app.getVersion(),
});
initializeEngineInfoManager({
  defaultEngineDir: appDirPath,
  vvppEngineDir,
});
initializeEngineProcessManager({ onEngineProcessError });
initializeVvppManager({ vvppEngineDir, tmpDir: app.getPath("temp") });

const configManager = getConfigManager();
const windowManager = getWindowManager();
const engineAndVvppController = getEngineAndVvppController();

/**
 * マルチエンジン機能が有効だった場合はtrueを返す。
 * 無効だった場合はダイアログを表示してfalseを返す。
 */
function checkMultiEngineEnabled(): boolean {
  const enabled = configManager.get("enableMultiEngine");
  if (!enabled) {
    windowManager.showMessageBoxSync({
      type: "info",
      title: "マルチエンジン機能が無効です",
      message: "マルチエンジン機能が無効です。vvpp ファイルを使用するには設定からマルチエンジン機能を有効にしてください。",
      buttons: ["OK"],
      noLink: true,
    });
  }
  return enabled;
}

/**
 * AivisSpeech の起動時に直接開けるファイルかどうかを判定する。
 * Electron / Chromium の起動オプションや未対応ファイルは、初期ファイルパスとして扱わない。
 * @param filePath コマンドライン引数として渡されたファイルパス
 * @returns 起動時に直接処理できるファイルの場合は true
 */
function isSupportedInitialFilePath(filePath: string): boolean {
  return path.extname(filePath) === ".aisp" || isVvppFile(filePath);
}

/** コマンドライン引数を取得する */
function getArgv(): string[] {
  // 製品版でmacOS以外の場合、引数はargv[1]以降をそのまま
  if (isProduction) {
    if (!isMac) {
      return process.argv.slice(1);
    }
  }
  // 開発版の場合、引数は`--`がある場合は`--`以降、無い場合は引数なしとして扱う
  else {
    const index = process.argv.indexOf("--");
    if (index !== -1) {
      return process.argv.slice(index + 1);
    }
  }
  return [];
}

let initialFilePath: string | undefined = getArgv().find(
  isSupportedInitialFilePath,
); // TODO: カプセル化する

const menuTemplateForMac: Electron.MenuItemConstructorOptions[] = [
  {
    label: "AivisSpeech",
    submenu: [{ role: "quit" }],
  },
  {
    label: "Edit",
    submenu: [
      { role: "cut" },
      { role: "copy" },
      { role: "paste" },
      { role: "selectAll" },
    ],
  },
];

// For macOS, set the native menu to enable shortcut keys such as 'Cmd + V'.
if (isMac) {
  Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplateForMac));
} else {
  if (!isDevelopment) {
    Menu.setApplicationMenu(null);
  }
}

// プロセス間通信
registerIpcMainHandle<IpcMainHandle>(
  getIpcMainHandle({
    appStateGetter: () => appState,
    staticDirPath: __static,
    appDirPath,
    initialFilePathGetter: () => initialFilePath,
  }),
);

// app callback
app.on("web-contents-created", (_e, contents) => {
  // リンククリック時はブラウザを開く
  contents.setWindowOpenHandler(({ url }) => {
    const { protocol } = new URL(url);
    if (protocol.match(/^https?:/) || protocol === "mailto:") {
      void shell.openExternal(url);
    } else {
      log.error(`許可されないリンクです。url: ${url}`);
    }
    return { action: "deny" };
  });

  // ナビゲーションを無効化
  contents.on("will-navigate", (event) => {
    // preloadスクリプト変更時のホットリロードを許容する
    if (contents.getURL() !== event.url) {
      log.error(`ナビゲーションは無効化されています。url: ${event.url}`);
      event.preventDefault();
    }
  });
});

// Called before window closing
app.on("before-quit", async (event) => {
  if (!appState.willQuit) {
    event.preventDefault();
    ipcMainSendProxy.CHECK_EDITED_AND_NOT_SAVE(windowManager.getWindow(), {
      closeOrReload: "close",
    });
    return;
  }

  log.info("Checking ENGINE status before app quit");
  const { engineCleanupResult, configSavedResult } =
    engineAndVvppController.gracefulShutdown();

  // - エンジンの停止
  // - エンジン終了後処理
  // - 設定ファイルの保存
  // が完了している
  if (
    engineCleanupResult === "alreadyCompleted" &&
    configSavedResult === "alreadySaved"
  ) {
    log.info("Post engine kill process and config save done. Quitting app");
    return;
  }

  // すべてのエンジンプロセスのキルを開始

  // 同期的にbefore-quitイベントをキャンセル
  log.info("Interrupt app quit");
  event.preventDefault();

  if (engineCleanupResult !== "alreadyCompleted") {
    log.info("Waiting for post engine kill process");
    await engineCleanupResult;
  }
  if (configSavedResult !== "alreadySaved") {
    log.info("Waiting for config save");
    await configSavedResult;
  }

  // アプリケーションの終了を再試行する
  log.info("Attempting to quit app again");
  app.quit();
  return;
});

app.once("will-finish-launching", () => {
  // macOS only
  app.once("open-file", (event, filePath) => {
    event.preventDefault();
    initialFilePath = filePath;
  });
});

void app.whenReady().then(async () => {
  log.info(`AivisSpeech version ${app.getVersion()}`);

  await configManager.initialize().catch(async (e) => {
    log.error(e);

    const appExit = async () => {
      await configManager?.ensureSaved();
      app.exit(1);
    };
    const openConfigFolderAndExit = async () => {
      await shell.openPath(app.getPath("userData"));
      // 直後にexitするとフォルダが開かないため
      await new Promise((resolve) => {
        setTimeout(resolve, 500);
      });
      await appExit();
    };
    const resetConfig = async () => {
      configManager.reset();
      await configManager.ensureSaved();
    };

    // 実利用時はconfigファイル削除で解決する可能性があることを案内して終了
    if (!isDevelopment) {
      await dialog
        .showMessageBox({
          type: "error",
          title: "設定ファイルの読み込みエラー",
          message: `設定ファイルの読み込みに失敗しました。${app.getPath(
            "userData",
          )} にある config.json の名前を変えることで解決することがあります（ただし設定がすべてリセットされます）。設定ファイルがあるフォルダを開きますか？`,
          buttons: ["キャンセル", "設定ファイルがあるフォルダを開く"],
          noLink: true,
          cancelId: 0,
        })
        .then(async ({ response }) => {
          switch (response) {
            case 0:
              await appExit();
              break;
            case 1:
              await openConfigFolderAndExit();
              break;
            default:
              throw new Error(`Unknown response: ${response}`);
          }
        });
    }

    // 開発時はconfigをリセットして起動を続行するかも問う
    else {
      await dialog
        .showMessageBox({
          type: "error",
          title: "設定ファイルの読み込みエラー（開発者向け案内）",
          message: "設定ファイルの読み込みに失敗しました。設定ファイルの名前を変更するか、設定をリセットしてください。",
          buttons: [
            "何もせず終了",
            "設定ファイルのフォルダを開いて終了",
            "設定をリセットして続行",
          ],
          noLink: true,
          cancelId: 0,
        })
        .then(async ({ response }) => {
          switch (response) {
            case 0:
              await appExit();
              break;
            case 1:
              await openConfigFolderAndExit();
              break;
            case 2:
              await resetConfig();
              break;
            default:
              throw new Error(`Unknown response: ${response}`);
          }
        });
    }
  });

  if (isDevelopment && !isTest) {
    try {
      await installExtension(VUEJS_DEVTOOLS);
    } catch (e) {
      log.error("Vue Devtools failed to install:", e);
    }
  }

  // VVPPがデフォルトエンジンに指定されていたらインストールする
  // NOTE: この機能は工事中。参照: https://github.com/VOICEVOX/voicevox/issues/1194
  const packageInfos =
    await engineAndVvppController.fetchInsallablePackageInfos();
  for (const { engineName, packageInfo } of packageInfos) {
    // インストールするか確認
    const result = dialog.showMessageBoxSync({
      type: "info",
      title: "デフォルトエンジンのインストール",
      message: `${engineName} をインストールしますか？`,
      buttons: ["インストール", "キャンセル"],
      cancelId: 1,
    });
    if (result == 1) {
      continue;
    }

    // ダウンロードしてインストールする
    let lastLogTime = 0; // とりあえずログを0.1秒に1回だけ出力する
    await engineAndVvppController.downloadAndInstallVvppEngine(
      app.getPath("downloads"),
      packageInfo,
      {
        onProgress: ({ type, progress }) => {
          if (Date.now() - lastLogTime > 100) {
            log.info(
              `VVPP default engine progress: ${type}: ${Math.floor(progress)}%`,
            );
            lastLogTime = Date.now();
          }
        },
      },
    );
  }

  // 多重起動防止
  // TODO: readyを待たずにもっと早く実行すべき
  if (
    !isDevelopment &&
    !isTest &&
    !app.requestSingleInstanceLock({
      filePath: initialFilePath,
    } satisfies SingleInstanceLockData)
  ) {
    log.info("AivisSpeech already running. Cancelling launch.");
    log.info(`File path sent: ${initialFilePath}`);
    appState.willQuit = true;
    app.quit();
    return;
  }

  if (initialFilePath) {
    log.info(`Initial file path provided: ${initialFilePath}`);
    if (isVvppFile(initialFilePath)) {
      log.info(`vvpp file install: ${initialFilePath}`);
      // FIXME: GUI側に合流させる
      if (checkMultiEngineEnabled()) {
        await engineAndVvppController.installVvppEngineWithWarning({
          vvppPath: initialFilePath,
          reloadNeeded: false,
        });
      }
    }
  }

  await engineAndVvppController.launchEngines();
  await windowManager.createWindow();
});

// 他のプロセスが起動したとき、`requestSingleInstanceLock`経由で`rawData`が送信される。
app.on("second-instance", async (_event, _argv, _workDir, rawData) => {
  const data = rawData as SingleInstanceLockData;
  const win = windowManager.win;
  if (win == undefined) {
    // TODO: 起動シーケンス中の場合はWindowが作られるまで待つ
    log.warn("A 'second-instance' event was emitted but there is no window.");
    return;
  }
  if (!data.filePath) {
    log.info("No file path sent");
  } else if (isVvppFile(data.filePath)) {
    log.info("Second instance launched with vvpp file");
    // FIXME: GUI側に合流させる
    if (checkMultiEngineEnabled()) {
      await engineAndVvppController.installVvppEngineWithWarning({
        vvppPath: data.filePath,
        reloadNeeded: true,
        reloadCallback: () => {
          ipcMainSendProxy.CHECK_EDITED_AND_NOT_SAVE(win, {
            closeOrReload: "reload",
          });
        },
      });
    }
  } else if (data.filePath.endsWith(".aisp")) {
    log.info("Second instance launched with aisp file");
    ipcMainSendProxy.LOAD_PROJECT_FILE(win, {
      filePath: data.filePath,
    });
  }
  windowManager.restoreAndFocus();
});

if (isDevelopment) {
  if (process.platform === "win32") {
    process.on("message", (data) => {
      if (data === "graceful-exit") {
        log.info("Received graceful-exit");
        app.quit();
      }
    });
  } else {
    process.on("SIGTERM", () => {
      app.quit();
    });
  }
}
