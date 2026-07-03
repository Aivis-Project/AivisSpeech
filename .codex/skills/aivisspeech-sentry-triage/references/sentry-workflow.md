# Sentry 作業手順

## API の使い分け

まずバンドル済みの Sentry helper を使います。

```bash
SENTRY_API="${SENTRY_API:?Set SENTRY_API to the installed sentry_api.py path}"
python3 "$SENTRY_API" \
  --org aivis-project \
  --project aivisspeech \
  list-issues \
  --query "is:unresolved" \
  --limit 50 \
  --time-range 14d
```

helper の `list-issues` コマンドはプロジェクト別 issue API を使います。  
この API の `statsPeriod` は `""`、`24h`、`14d` だけを受け付けることがあります。

Sentry の UI に近い90日 issue 一覧が必要な場合は、組織別 issue API を使います。  
以下の `curl` は先頭100件だけを取得する例です。  
90日分を漏れなく見る場合は、レスポンスの `Link` ヘッダーに含まれる `rel="next"` の URL を、`results="true"` である限り追跡します。

```bash
curl -sS \
  -H "Authorization: Bearer $SENTRY_AUTH_TOKEN" \
  "https://sentry.io/api/0/organizations/aivis-project/issues/?project=4508555292901376&query=is%3Aunresolved&limit=100&statsPeriod=90d"
```

未解決 issue だけを見ると、すでに ignored に入っている大量ノイズの署名を見落とします。  
送信前フィルタを作るときは、少なくとも `is:unresolved`、`is:ignored`、`is:resolved` を同じ `statsPeriod=90d` で確認します。
ページングの扱いも3状態で同じにします。

```bash
curl -sS \
  -H "Authorization: Bearer $SENTRY_AUTH_TOKEN" \
  "https://sentry.io/api/0/organizations/aivis-project/issues/?project=4508555292901376&query=is%3Aignored&limit=100&statsPeriod=90d"
```

トークンは出力しません。  
環境変数の確認が必要な場合も、トークンが設定されているかどうかだけを表示します。

## イベント詳細の確認

Sentry の issue タイトルは、省略されたり正規化されたりします。  
フィルタ漏れを判断する前に、少なくとも最新イベントを取得します。

1. 組織別 API から issue 一覧を取得します
2. `/api/0/organizations/aivis-project/issues/{issue_id}/events/` から最新イベントを取得します
3. `/api/0/projects/aivis-project/aivisspeech/events/{event_id}/` からイベント詳細を取得します
4. `metadata`、`entries[type=exception]`、`breadcrumbs`、`culprit`、`request.url`、`spans`、`tags` を確認します

イベント詳細から設定値破損・メモリ・GPU・ローカルファイル・更新確認・ブラウザ再生中断ノイズだと確認できた場合は、フィルタとテストを追加します。  
Vue コンポーネント、Vuex store、OpenAPI クライアント、IPC 境界の不具合である可能性が残る場合は、ユーザーが方針変更を明示しない限り残します。

native crash は `entries[type=exception]` の stack frame に、JavaScript SDK の型定義にない `package` が入ることがあります。  
GPU ドライバ、Chromium、Crashpad、V8 由来かを判断する場合は、関数名だけでなく `package` の DLL / dylib / Linux mount path も見ます。

renderer の `Failed to fetch` は、タイトルだけでは更新確認・ローカル Engine 通信断・本体側の通信バグを区別できません。  
パンくずの URL、OpenAPI クライアントの呼び出し元、HTTP ステータスが取れる場合はそれらを見て、既知ノイズに限定できる場合だけ破棄します。

## 送信量設定の確認

Sentry のエラー quota を守る作業では、イベントの破棄条件だけでなく、エラー以外の送信量を増やす設定も確認します。

AivisSpeech Engine 側は、ローカルアプリではエラー以外の利用状況まで収集しない方針で `traces_sample_rate=0.0` を明示しています。  
AivisSpeech エディタ側でも、renderer / main process の `Sentry.init()` に以下が残っていないか確認します。

- `tracesSampleRate` が 0 以外になっていないか確認します
- `browserTracingIntegration()` が有効になっていないか確認します
- `replayIntegration()` が有効になっていないか確認します
- `replaysSessionSampleRate` と `replaysOnErrorSampleRate` が残っていないか確認します

これらが残っている場合は、エラー調査に必要な根拠があるかを確認します。  
根拠がない場合は、AivisSpeech Engine 側と同じ方針で無効化します。

## Issue のアーカイブ

ユーザーが Sentry issue 状態の更新を依頼した場合だけ、issue をアーカイブします。

削除は使わず、`ignored / archived forever` を使います。  
削除すると、同じグループが後から新規 issue として再登場する可能性があります。

確定ノイズに使う更新本文は以下です。

```json
{"status":"ignored","substatus":"archived_forever","statusDetails":{}}
```

まず1件だけで書き込みテストを行い、その後で確定グループだけを一括処理します。

## プロジェクト値

- 組織: `aivis-project`
- プロジェクト slug: `aivisspeech`
- 調査時に確認したプロジェクト ID: `4508555292901376`
- Sentry フィルタ実装: `src/domain/sentryEventFilter.ts`
- Sentry フィルタテスト: `tests/unit/domain/sentryEventFilter.spec.ts`
