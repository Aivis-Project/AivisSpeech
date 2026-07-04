import { createApp } from "vue";
// import { createGtm } from "@gtm-support/vue-gtm";
import { Quasar, Dialog, Loading, Notify } from "quasar";
import iconSet from "quasar/icon-set/material-symbols-rounded";
import * as Sentry from "@sentry/electron/renderer";  // eslint-disable-line
import * as SentryVue from "@sentry/vue";
import { store, storeKey } from "./store";
import { ipcMessageReceiver } from "./plugins/ipcMessageReceiverPlugin";
import { hotkeyPlugin } from "./plugins/hotkeyPlugin";
import App from "@/components/App.vue";
import { markdownItPlugin } from "@/plugins/markdownItPlugin";
import { isProduction } from "@/helpers/platform";
import {
  filterSentryErrorEvent,
  filterSentryTransactionEvent,
} from "@/domain/sentryEventFilter";

import "@quasar/extras/material-symbols-rounded/material-symbols-rounded.css";
import "quasar/dist/quasar.sass";
import "./styles/_index.scss";

// NOTE: 起動後、設定を読み込んでからvue-gtmを有効化する関係上、dataLayerの用意が間に合わず、値が欠落してしまう箇所が存在する
//       ため、それを防止するため自前でdataLayerをあらかじめ用意する
// window.dataLayer = [];

// Sentry によるエラートラッキングを開始 (production 環境のみ有効)
// ref: https://docs.sentry.io/platforms/javascript/guides/electron/
if (isProduction) {
  Sentry.init(
    {
      // ローカルアプリではエラー以外の利用状況まで収集しない
      // AivisSpeech Engine 側と同じく、トレースは送信量に対して得られる情報が少ないため明示的に無効化する
      tracesSampleRate: 0.0,
      // ローカル環境や Chromium 側の既知ノイズは、Sentry のクォータを消費する前に止める
      beforeSend: filterSentryErrorEvent,
      beforeSendTransaction: filterSentryTransactionEvent,
    },
    SentryVue.init,
  );
}

createApp(App)
  .use(store, storeKey)
  // Google Tag Manager (2024年末現在の公式 GA4 実装では動作しないため常に無効化)
  /*
  .use(
    createGtm({
      id: import.meta.env.VITE_GTM_CONTAINER_ID ?? "GTM-DUMMY",
      // NOTE: 最初はgtm.jsを読まず、プライバシーポリシーに同意後に読み込む
      enabled: false,
    }),
  )
  */
  .use(Quasar, {
    config: {
      brand: {
        primary: "#41A2EC",
        secondary: "#41A2EC",
        negative: "var(--color-warning)",
      },
    },
    iconSet,
    plugins: {
      Dialog,
      Loading,
      Notify,
    },
  })
  .use(hotkeyPlugin)
  .use(ipcMessageReceiver, { store })
  .use(markdownItPlugin)
  .mount("#app");
