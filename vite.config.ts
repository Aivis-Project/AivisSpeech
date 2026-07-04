/// <reference types="vitest" />
import path from "path";
import { rm } from "fs/promises";

import electron from "vite-plugin-electron/simple";
import tsconfigPaths from "vite-tsconfig-paths";
import vue from "@vitejs/plugin-vue";
import checker from "vite-plugin-checker";
import { BuildOptions, defineConfig, loadEnv, Plugin } from "vite";
import { quasar } from "@quasar/vite-plugin";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import { z } from "zod";

import {
  checkSuspiciousImports,
  CheckSuspiciousImportsOptions,
} from "./tools/checkSuspiciousImports.js";

const isElectron = process.env.VITE_TARGET === "electron";
const isBrowser = process.env.VITE_TARGET === "browser";
const isProduction = process.env.NODE_ENV === "production";
const shouldUploadSentrySourcemaps =
  isProduction &&
  process.env.SENTRY_AUTH_TOKEN != undefined &&
  process.env.SENTRY_AUTH_TOKEN !== "";

export default defineConfig((options) => {
  const mode = z
    .enum(["development", "test", "production"])
    .parse(options.mode);

  const packageName = process.env.npm_package_name;
  const env = loadEnv(mode, import.meta.dirname);
  if (!packageName?.startsWith(env.VITE_APP_NAME)) {
    throw new Error(
      `"package.json"の"name":"${packageName}"は"VITE_APP_NAME":"${env.VITE_APP_NAME}"から始まっている必要があります`,
    );
  }

  // 型を曖昧にして下の[process.platform]のエラーを回避する
  const sevenZipBinNames: Record<string, string> = {
    win32: "7za.exe",
    linux: "7zzs",
    darwin: "7zz",
  };
  const sevenZipBinName = sevenZipBinNames[process.platform];
  if (!sevenZipBinName) {
    throw new Error(`Unsupported platform: ${process.platform}`);
  }
  process.env.VITE_7Z_BIN_NAME =
    (mode !== "production"
      ? path.join(import.meta.dirname, "vendored", "7z") + path.sep
      : "") + sevenZipBinName;
  process.env.VITE_APP_VERSION = process.env.npm_package_version;

  const shouldEmitSourcemap = ["development", "test"].includes(mode);
  const sourcemap: BuildOptions["sourcemap"] = shouldEmitSourcemap
    ? "inline"  // 開発時はインライン
    : true;  // 本番時は別ファイル

  // ref: electronの起動をスキップしてデバッグ起動を軽くする
  const skipLaunchElectron =
    mode === "test" || process.env.SKIP_LAUNCH_ELECTRON === "1";

  return {
    root: path.resolve(import.meta.dirname, "src"),
    envDir: import.meta.dirname,
    build: {
      outDir: path.resolve(import.meta.dirname, "dist"),
      chunkSizeWarningLimit: 10000,
      sourcemap,
    },
    publicDir: path.resolve(import.meta.dirname, "public"),
    css: {
      preprocessorOptions: {
        scss: {
          api: "modern",
          includePaths: [path.resolve(import.meta.dirname, "node_modules")],
        },
      },
    },
    resolve: {
      alias: {
        "@": path.resolve(import.meta.dirname, "src/"),
        // package.json の module が存在しない minify 版を指しているため、実在する ESM 版へ向ける
        "@analytics-debugger/ga4mp": path.resolve(
          import.meta.dirname,
          "node_modules/@analytics-debugger/ga4mp/dist/ga4mp.esm.js",
        ),
      },
    },
    plugins: [
      vue(),
      quasar({ autoImportComponentCase: "pascal" }),
      mode !== "test" &&
        checker({
          overlay: false,
          vueTsc: true,
        }),
      isElectron && [
        cleanDistPlugin(),
        // TODO: 関数で切り出して共通化できる部分はまとめる
        electron({
          main: {
            entry: "./backend/electron/main.ts",

            // ref: https://github.com/electron-vite/vite-plugin-electron/pull/122
            onstart: ({ startup }) => {
              console.log("main process build is complete.");
              if (!skipLaunchElectron) {
                // ここのprocess.argvは以下のような形で渡ってくる：
                // ["node", ".../vite.js", (...vite用の引数...), "--", その他引数...]
                const args: string[] = [".", "--no-sandbox"];
                const doubleDashIndex = process.argv.indexOf("--");
                if (doubleDashIndex !== -1) {
                  args.push("--", ...process.argv.slice(doubleDashIndex + 1));
                }
                void startup(args);
              }
            },
            vite: {
              plugins: [
                tsconfigPaths({ root: import.meta.dirname }),
                isProduction &&
                  checkSuspiciousImportsPlugin({
                    allowedModules: [
                      // systeminformationのoptionalな依存。try-catch内なので許可。
                      "osx-temperature-sensor",
                    ],
                  }),
                shouldUploadSentrySourcemaps && createSentryVitePlugin(),
              ],
              build: {
                outDir: path.resolve(import.meta.dirname, "dist"),
                sourcemap,
              },
            },
          },
          preload: {
            input: "./src/backend/electron/renderer/preload.ts",
            onstart({ reload }) {
              if (!skipLaunchElectron) {
                reload();
              }
            },
            vite: {
              plugins: [
                tsconfigPaths({ root: import.meta.dirname }),
                isProduction && checkSuspiciousImportsPlugin({}),
                shouldUploadSentrySourcemaps && createSentryVitePlugin(),
              ],
              build: {
                outDir: path.resolve(import.meta.dirname, "dist"),
                sourcemap,
              },
            },
          },
        }),
        shouldUploadSentrySourcemaps && createSentryVitePlugin(),
      ],
      isBrowser && injectBrowserPreloadPlugin(),
    ],
  };
});

const createSentryVitePlugin = (): Plugin => {
  // renderer / main / preload は別々の Vite ビルドなので、各出力ファイルへ同じ release の Debug ID を注入する
  return sentryVitePlugin({
    authToken: process.env.SENTRY_AUTH_TOKEN,
    org: "aivis-project",
    project: "aivisspeech",
    telemetry: false,
    release: {
      name: process.env.RELEASE_VERSION
        ? `AivisSpeech@${process.env.RELEASE_VERSION}`
        : undefined,
      setCommits: {
        auto: true,
        ignoreMissing: true,
      },
    },
  }) as unknown as Plugin;
};

const cleanDistPlugin = (): Plugin => {
  return {
    name: "clean-dist",
    apply: "build",
    enforce: "pre",
    async buildStart() {
      await rm(path.resolve(import.meta.dirname, "dist"), {
        recursive: true,
        force: true,
      });
    },
  };
};

const injectBrowserPreloadPlugin = (): Plugin => {
  return {
    name: "inject-browser-preload",
    transformIndexHtml: {
      order: "pre",
      handler: (html: string) =>
        html.replace(
          "<!-- %BROWSER_PRELOAD% -->",
          "<script type=\"module\" src=\"./backend/browser/preload.ts\"></script>",
        ),
    },
  };
};

const checkSuspiciousImportsPlugin = (
  options: CheckSuspiciousImportsOptions,
): Plugin => {
  return {
    name: "check-suspicious-imports",
    enforce: "post",
    apply: "build",
    writeBundle(_options, bundle) {
      for (const [file, chunk] of Object.entries(bundle)) {
        if (chunk.type === "chunk") {
          checkSuspiciousImports(file, chunk.code, options);
        }
      }
    },
  };
};
