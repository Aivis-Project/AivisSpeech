import fs from "fs";
import path from "path";
import { spawn } from "node:child_process";
import { app, BrowserWindow, nativeTheme, shell } from "electron";
import { hasSupportedGpu } from "./device";
import { getConfigManager } from "./electronConfig";
import { getEngineAndVvppController } from "./engineAndVvppController";
import { writeFileSafely } from "./fileHelper";
import { IpcMainHandle, ipcMainSendProxy } from "./ipc";
import { getEngineInfoManager } from "./manager/engineInfoManager";
import { getEngineProcessManager } from "./manager/engineProcessManager";
import { getWindowManager } from "./manager/windowManager";
import { UpdateManager } from "./updateManager";
import { createLogger } from "@/helpers/log";
import {
  getCurrentUpdatePlatform,
  resolveUpdateInfosUrl,
  resolveUpdateInstallerDownload,
} from "@/domain/updateDownload";
import { AssetTextFileNames } from "@/type/staticResources";
import { failure, success } from "@/type/result";
import {
  defaultToolbarButtonSetting,
  EngineId,
  SystemError,
  TextAsset,
} from "@/type/preload";

const log = createLogger("IpcMainHandle");

// エンジンのフォルダを開く
function openEngineDirectory(engineId: EngineId) {
  let engineDirectory: string;
  try {
    engineDirectory = getEngineInfoManager().fetchEngineDirectory(engineId);
  } catch (error) {
    // Engine 一覧の更新直後は、UI が古い engineId のボタンを押せる瞬間がある
    log.warn(`Failed to resolve engine directory: ${engineId}`, error);
    return;
  }

  // Windows環境だとスラッシュ区切りのパスが動かない。
  // path.resolveはWindowsだけバックスラッシュ区切りにしてくれるため、path.resolveを挟む。
  void shell.openPath(path.resolve(engineDirectory));
}

/**
 * 保存に適した場所を選択するかキャンセルするまでダイアログを繰り返し表示する。
 * アンインストール等で消えうる場所などを避ける。
 * @param showDialogFunction ダイアログを表示する関数
 */
async function retryShowSaveDialogWhileSafeDir<
  T extends Electron.OpenDialogReturnValue | Electron.SaveDialogReturnValue,
>(showDialogFunction: () => Promise<T>, appDirPath: string): Promise<T> {
  /**
   * 指定されたパスが安全でないかどうかを判断する
   */
  const isUnsafePath = (filePath: string) => {
    const unsafeSaveDirs = [appDirPath, app.getPath("userData")]; // アンインストールで消えうるフォルダ
    return unsafeSaveDirs.some((unsafeDir) => {
      const relativePath = path.relative(unsafeDir, filePath);
      return !(
        path.isAbsolute(relativePath) ||
        relativePath.startsWith(`..${path.sep}`) ||
        relativePath === ".."
      );
    });
  };

  /**
   * 警告ダイアログを表示し、ユーザーが再試行を選択したかどうかを返す
   */
  const showWarningDialog = async () => {
    const windowManager = getWindowManager();
    const productName = app.getName().toUpperCase();
    const warningResult = await windowManager.showMessageBox({
      message: `指定された保存先は${productName}により自動的に削除される可能性があります。\n他の場所に保存することをおすすめします。`,
      type: "warning",
      buttons: ["保存場所を変更", "無視して保存"],
      defaultId: 0,
      title: "警告",
      cancelId: 0,
    });
    return warningResult.response === 0 ? "retry" : "forceSave";
  };

  while (true) {
    const result = await showDialogFunction();
    // キャンセルされた場合、結果を直ちに返す
    if (result.canceled) return result;

    // 選択されたファイルパスを取得
    const filePath =
      "filePaths" in result ? result.filePaths[0] : result.filePath;

    // 選択されたパスが安全かどうかを確認
    if (isUnsafePath(filePath)) {
      const result = await showWarningDialog();
      if (result === "retry") continue; // ユーザーが保存場所を変更を選択した場合
    }
    return result; // 安全なパスが選択された場合
  }
}

export function getIpcMainHandle(params: {
  appStateGetter: () => { willQuit: boolean };
  staticDirPath: string;
  appDirPath: string;
  initialFilePathGetter: () => string | undefined;
}): IpcMainHandle {
  const { appStateGetter, staticDirPath, appDirPath, initialFilePathGetter } =
    params;

  const configManager = getConfigManager();
  const engineAndVvppController = getEngineAndVvppController();
  const engineInfoManager = getEngineInfoManager();
  const engineProcessManager = getEngineProcessManager();
  const windowManager = getWindowManager();
  // 自動アップデート用のダウンロードマネージャー
  // ダウンロード先はユーザーの Downloads フォルダ
  const updateManager = new UpdateManager(() => app.getPath("downloads"));

  return {
    GET_TEXT_ASSET: async (_, textType) => {
      const fileName = path.join(staticDirPath, AssetTextFileNames[textType]);
      const text = await fs.promises.readFile(fileName, "utf-8");
      if (textType === "OssLicenses" || textType === "UpdateInfos") {
        return JSON.parse(text) as TextAsset[typeof textType];
      }
      return text;
    },

    GET_ALT_PORT_INFOS: () => {
      return engineInfoManager.altPortInfos;
    },

    GET_INITIAL_PROJECT_FILE_PATH: async () => {
      const initialFilePath = initialFilePathGetter();
      if (initialFilePath && initialFilePath.endsWith(".aisp")) {
        return initialFilePath;
      }
    },

    /**
     * 保存先になるディレクトリを選ぶダイアログを表示する。
     */
    SHOW_SAVE_DIRECTORY_DIALOG: async (_, { title }) => {
      const result = await retryShowSaveDialogWhileSafeDir(
        () =>
          windowManager.showOpenDialog({
            title,
            properties: [
              "openDirectory",
              "createDirectory",
              "treatPackageAsDirectory",
            ],
          }),
        appDirPath,
      );
      if (result.canceled) {
        return undefined;
      }
      return result.filePaths[0];
    },

    /**
     * ディレクトリ選択ダイアログを表示する。
     * 保存先として選ぶ場合は SHOW_SAVE_DIRECTORY_DIALOG を使うべき。
     */
    SHOW_OPEN_DIRECTORY_DIALOG: async (_, { title }) => {
      const result = await windowManager.showOpenDialog({
        title,
        properties: [
          "openDirectory",
          "createDirectory",
          "treatPackageAsDirectory",
        ],
      });
      if (result.canceled) {
        return undefined;
      }
      return result.filePaths[0];
    },

    SHOW_WARNING_DIALOG: (_, { title, message }) => {
      return windowManager.showMessageBox({
        type: "warning",
        title,
        message,
      });
    },

    SHOW_ERROR_DIALOG: (_, { title, message }) => {
      return windowManager.showMessageBox({
        type: "error",
        title,
        message,
      });
    },

    SHOW_OPEN_FILE_DIALOG: (_, { title, name, extensions, defaultPath }) => {
      return windowManager.showOpenDialogSync({
        title,
        defaultPath,
        filters: [{ name, extensions }],
        properties: ["openFile", "createDirectory", "treatPackageAsDirectory"],
      })?.[0];
    },

    SHOW_SAVE_FILE_DIALOG: async (
      _,
      { title, defaultPath, name, extensions },
    ) => {
      const result = await retryShowSaveDialogWhileSafeDir(
        () =>
          windowManager.showSaveDialog({
            title,
            defaultPath,
            filters: [{ name, extensions }],
            properties: ["createDirectory"],
          }),
        appDirPath,
      );
      if (result.canceled) {
        return undefined;
      }
      return result.filePath;
    },

    IS_AVAILABLE_GPU_MODE: () => {
      return hasSupportedGpu(process.platform);
    },

    IS_MAXIMIZED_WINDOW: () => {
      return windowManager.isMaximized();
    },

    CLOSE_WINDOW: () => {
      const appState = appStateGetter();
      appState.willQuit = true;
      windowManager.destroyWindow();
    },

    MINIMIZE_WINDOW: () => {
      windowManager.minimize();
    },

    TOGGLE_MAXIMIZE_WINDOW: () => {
      windowManager.toggleMaximizeWindow();
    },

    TOGGLE_FULLSCREEN: () => {
      windowManager.toggleFullScreen();
    },

    /** UIの拡大 */
    ZOOM_IN: () => {
      windowManager.zoomIn();
    },

    /** UIの縮小 */
    ZOOM_OUT: () => {
      windowManager.zoomOut();
    },

    /** UIの拡大率リセット */
    ZOOM_RESET: () => {
      windowManager.zoomReset();
    },

    OPEN_LOG_DIRECTORY: () => {
      void shell.openPath(app.getPath("logs"));
    },

    OPEN_DEFAULT_ENGINE_LOG_DIRECTORY: () => {
      // AivisSpeech Engine のログ保存先ディレクトリを OS ごとに取得
      let logPath = "";
      switch (process.platform) {
        case "win32":
          logPath = path.join(app.getPath("appData"), "AivisSpeech-Engine", "Logs");
          break;
        case "darwin":
          logPath = path.join(app.getPath("appData"), "AivisSpeech-Engine", "Logs");
          break;
        case "linux":
          logPath = path.join(app.getPath("home"), ".local", "share", "AivisSpeech-Engine", "Logs");
          break;
        default:
          return;
      }
      // ログディレクトリを開く
      void shell.openPath(logPath);
    },

    ENGINE_INFOS: () => {
      // エンジン情報を設定ファイルに保存しないためにelectron-storeは使わない
      return engineInfoManager.fetchEngineInfos();
    },

    RESTART_ENGINE: async (_, { engineId }) => {
      return engineProcessManager.restartEngine(engineId);
    },

    OPEN_ENGINE_DIRECTORY: async (_, { engineId }) => {
      openEngineDirectory(engineId);
    },

    HOTKEY_SETTINGS: (_, { newData }) => {
      if (newData != undefined) {
        const hotkeySettings = configManager.get("hotkeySettings");
        const hotkeySetting = hotkeySettings.find(
          (hotkey) => hotkey.action == newData.action,
        );
        if (hotkeySetting != undefined) {
          hotkeySetting.combination = newData.combination;
        }
        configManager.set("hotkeySettings", hotkeySettings);
      }
      return configManager.get("hotkeySettings");
    },

    ON_VUEX_READY: () => {
      windowManager.show();
    },

    CHECK_FILE_EXISTS: (_, { file }) => {
      return fs.existsSync(file);
    },

    CHANGE_PIN_WINDOW: () => {
      windowManager.togglePinWindow();
    },

    GET_DEFAULT_TOOLBAR_SETTING: () => {
      return defaultToolbarButtonSetting;
    },

    GET_SETTING: (_, key) => {
      return configManager.get(key);
    },

    SET_SETTING: (_, key, newValue) => {
      configManager.set(key, newValue);
      return configManager.get(key);
    },

    SET_ENGINE_SETTING: async (_, engineId, engineSetting) => {
      engineAndVvppController.updateEngineSetting(engineId, engineSetting);
    },

    SET_NATIVE_THEME: (_, source) => {
      nativeTheme.themeSource = source;
    },

    INSTALL_VVPP_ENGINE: async (_, path: string) => {
      return await engineAndVvppController.installVvppEngine(path);
    },

    UNINSTALL_VVPP_ENGINE: async (_, engineId: EngineId) => {
      return await engineAndVvppController.uninstallVvppEngine(engineId);
    },

    VALIDATE_ENGINE_DIR: (_, { engineDir }) => {
      return engineInfoManager.validateEngineDir(engineDir);
    },

    RELOAD_APP: async (_, { isMultiEngineOffMode }) => {
      await windowManager.reload(isMultiEngineOffMode);
    },

    WRITE_FILE: (_, { filePath, buffer }) => {
      try {
        writeFileSafely(
          filePath,
          new DataView(buffer instanceof Uint8Array ? buffer.buffer : buffer),
        );
        return success(undefined);
      } catch (e) {
        // throwだと`.code`の情報が消えるのでreturn
        const a = e as SystemError;
        return failure(a.code, a);
      }
    },

    READ_FILE: async (_, { filePath }) => {
      try {
        const result = await fs.promises.readFile(filePath);
        return success(new Uint8Array(result.buffer));
      } catch (e) {
        // throwだと`.code`の情報が消えるのでreturn
        const a = e as SystemError;
        return failure(a.code, a);
      }
    },

    /** アップデート情報 JSON の URL を取得する */
    GET_UPDATE_INFOS_URL: () => {
      if (!import.meta.env.VITE_LATEST_UPDATE_INFOS_URL) {
        throw new Error(
          "環境変数 VITE_LATEST_UPDATE_INFOS_URL が設定されていません。.env に記載してください。",
        );
      }

      return resolveUpdateInfosUrl(import.meta.env.VITE_LATEST_UPDATE_INFOS_URL);
    },

    /**
     * アップデート用インストーラーをダウンロードする。
     * レンダラーからはバージョン番号のみ受け取り、URL 構築はメインプロセス側で行う。
     * ダウンロード中は UPDATE_DOWNLOAD_PROGRESS イベントでレンダラーに進捗を通知する。
     */
    DOWNLOAD_UPDATE: async (event, { version }) => {
      // 現在のプラットフォームに対応するインストーラー種別を判定
      const platform = getCurrentUpdatePlatform();
      if (platform == null) {
        return failure(
          "unsupportedPlatform",
          new Error("Current platform is not supported for auto-update"),
        );
      }

      // プラットフォームとバージョンからダウンロード URL を構築
      const { fileName, url } = resolveUpdateInstallerDownload(
        platform,
        version,
      );

      // ダウンロード進捗をレンダラーに通知するための BrowserWindow を取得
      const browserWindow = BrowserWindow.fromWebContents(event.sender);
      return await updateManager.downloadUpdate({
        url,
        fileName,
        onProgress: (downloadedBytes, totalBytes) => {
          // IPC send/on パターンでレンダラーに進捗を通知
          if (browserWindow != null) {
            ipcMainSendProxy.UPDATE_DOWNLOAD_PROGRESS(browserWindow, {
              downloadedBytes,
              totalBytes,
            });
          }
        },
      });
    },

    /**
     * ダウンロード済みインストーラーを起動する。
     * Windows: NSIS インストーラーを detached プロセスとして起動し、app.quit() でアプリを終了する。
     *   NSIS のデフォルト動作で既存の AivisSpeech プロセスを検知・終了するため、
     *   --updated フラグは付けず、app.quit() が間に合わなくてもダイアログで確認される。
     * macOS: DMG ファイルを Finder で開く。ユーザーが手動で /Applications にドラッグ＆ドロップする。
     *   アプリは終了しない（macOS はアプリ実行中でも .app バンドルを置換可能）。
     */
    LAUNCH_UPDATE_INSTALLER: async (_, { installerPath }) => {
      // UpdateManager が直前にダウンロードしたパスと一致するか検証し、
      // レンダラーから渡された任意パスの実行を防ぐ
      const lastDownloadedPath =
        updateManager.getLastDownloadedInstallerPath();
      if (
        lastDownloadedPath == null ||
        path.resolve(installerPath) !== path.resolve(lastDownloadedPath)
      ) {
        throw new Error(
          "Invalid installer path: does not match the last downloaded installer",
        );
      }

      // Windows: NSIS インストーラーを起動してアプリを終了
      if (process.platform === "win32") {
        // detached: true で親プロセス（AivisSpeech）が終了してもインストーラーは動き続ける
        const childProcess = spawn(installerPath, [], {
          detached: true,
          stdio: "ignore",
        });
        log.info(
          `Launched update installer. path: ${installerPath}, pid: ${childProcess.pid}`,
        );
        childProcess.on("error", (error) => {
          log.error("Failed to launch update installer:", error);
        });
        // 親プロセスの終了を待たないように参照を切る
        childProcess.unref();
        // アプリを終了（NSIS が既存プロセスの終了を処理する）
        app.quit();
        return;
      }

      // macOS: DMG ファイルを Finder で開く
      // shell.openPath() は失敗時に非空のエラーメッセージ文字列を返す
      if (process.platform === "darwin") {
        const errorMessage = await shell.openPath(installerPath);
        if (errorMessage !== "") {
          throw new Error(`Failed to open installer: ${errorMessage}`);
        }
      }
    },

    /** 進行中のアップデートダウンロードをキャンセルする */
    CANCEL_UPDATE_DOWNLOAD: () => {
      updateManager.cancelDownload();
    },
  };
}
