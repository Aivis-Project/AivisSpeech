# フィルタ実装

## コード方針

`src/domain/sentryEventFilter.ts` を編集します。

広い例外型チェックより、署名ベースの正規表現グループを優先します。  
目的は、エディタ側の不具合候補を残しつつ、既知ノイズだけを破棄することです。

パスを照合するときは、`C:\Users\user` のようなユーザーホーム固定パスを直書きしません。  
環境ごとに変わる部分はワイルドカードにし、複数レイアウトで発生しうるエラーでは Windows / POSIX の両方のパス区切りを許容します。

パス断片には以下のような形を使います。

```typescript
const PATH_SEPARATOR_PATTERN = String.raw`[\\/]`;
```

例外型だけで判定する範囲は狭くします。  
汎用的な `TypeError`、`Error`、`ResponseError`、`FetchError` は、型だけで破棄してはいけません。

`Failed to fetch` は特に範囲が広いため、更新確認 URL、ローカル Engine の既知 API、HTTP ステータス、OpenAPI クライアントの関数名を組み合わせて判定します。  
`https://example.com` のような未知の外部 URL や、AivisSpeech 本体側の通信バグ候補は残します。

native crash の minidump 由来イベントでは、Sentry の実イベントに `frame.package` が入る場合があります。  
TypeScript の SDK 型に存在しないフィールドを読む場合は、`unknown` を経由する補助型を用意し、型チェックを通したうえで実イベントの署名を拾います。

Sentry 初期化もフィルタ実装の一部として扱います。  
`src/main.ts` と `src/backend/electron/main.ts` の両方を確認し、renderer と main process のどちらにも送信前フィルタが入っているかを見ます。  
エラー以外の送信量を増やす `browserTracingIntegration()`、`replayIntegration()`、`tracesSampleRate`、Replay のサンプル率は、AivisSpeech Engine 側の判断に合わせて無効化します。

コメントを追加する場合は、そのパターンがなぜ必要かを日本語で書きます。  
正規表現の文字列を文章で繰り返すだけのコメントは避けます。

## テスト

`tests/unit/domain/sentryEventFilter.spec.ts` に代表ケースを追加します。

新しく破棄する Sentry 署名には、`filterSentryErrorEvent` または `filterSentryTransactionEvent` の破棄側テストを少なくとも1つ追加します。

Vue / Vuex / OpenAPI / IPC 境界の疑いがある例は、残す側のテストに置きます。  
残す分類から破棄分類へ移す場合は、分類を変えた理由を最終報告で説明します。

エディタ側で修正した場合は、Sentry フィルタテストだけで終わらせません。  
設定読み込みを補正したなら設定 schema や `ConfigManager` のテストを追加し、例外処理を直したなら該当経路のユニットテストを追加します。

テストパスでは、`user` のような固定ユーザー名を避けます。  
Windows のユーザーデータには `C:\Users\Taro\AppData\Roaming\AivisSpeech` のような現実的な場所を使います。  
POSIX 風パスは、本番エラーが macOS / Linux / AppImage 環境から発生しうる場合だけ追加します。

ローカル Engine 通信断のテストでは、`127.0.0.1` / `localhost` と既知 API パスを組み合わせます。  
未知 URL の `Failed to fetch` を残すテストも必ず置き、広すぎるフィルタになっていないことを確認します。

native crash のテストでは、Sentry SDK 型にないフィールドを含む実イベントを `unknown` 経由で `Event` として扱います。  
これは実イベントの `package` を再現するためのテストデータに限って使い、アプリ本体の型安全性を緩めるためには使いません。

## 検証

リポジトリルートから以下を実行します。

```bash
pnpm exec eslint src/domain/sentryEventFilter.ts tests/unit/domain/sentryEventFilter.spec.ts src/main.ts src/backend/electron/main.ts src/type/preload.ts tests/unit/backend/common/configManager.spec.ts
npm_package_name=AivisSpeech npm_package_version=999.999.999 VITE_TARGET=browser pnpm exec vitest --run --project unit tests/unit/domain/sentryEventFilter.spec.ts
npm_package_name=AivisSpeech npm_package_version=999.999.999 VITE_TARGET=browser pnpm exec vitest --run --project unit tests/unit/backend/common/configManager.spec.ts -t "壊れた分割ペイン位置"
pnpm run typecheck
```

lint 対象が増えた場合は、変更したファイルを明示して `pnpm exec eslint <files>` を先に実行します。

既存テストに unrelated failure がある場合は、失敗したコマンドと失敗理由を報告します。  
ただし、新規追加したフィルタと修正対象の絞り込みテストは必ず通します。
