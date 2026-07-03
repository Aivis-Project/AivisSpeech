---
name: aivisspeech-sentry-triage
description: AivisSpeech エディタの Sentry issue を調査し、修正すべき Electron / Vue 側の不具合と、ローカル環境・ブラウザ実装・外部通信由来のノイズを切り分けるためのスキルです。Sentry 側で既知ノイズを整理する作業や、src/domain/sentryEventFilter.ts と関連テストを更新して既知ノイズを送信前に破棄する作業で使用します。
---

# AivisSpeech Sentry トリアージ

## 作業手順

このスキルは、AivisSpeech エディタで今後も繰り返す Sentry ノイズ処理の流れで使用します。

1. Sentry の90日 issue 一覧と最新イベントを確認します
2. 各 issue を「修正対象」「ローカル環境ノイズ」「Electron / Chromium ノイズ」「外部通信ノイズ」「性能イベントノイズ」「保留」に分類します
3. ユーザーが Sentry 側の整理を依頼した場合だけ、確定ノイズの issue を永続アーカイブします
4. 同じノイズを送信前に破棄するため、`src/domain/sentryEventFilter.ts` を更新します
5. `tracesSampleRate` や Replay など、エラー以外の送信量を増やす設定が残っていないか確認します
6. `tests/unit/domain/sentryEventFilter.spec.ts` に絞り込みテストを追加します
7. 修正すべきエラーは、エディタ側で安全に直せるかを確認してから実装します
8. リポジトリルートから `pnpm` の検証コマンドを実行します

フィルタを変更する前に、必ず Sentry の実 issue / イベントを確認します。  
イベント詳細が取得できる場合は、タイトルだけで分類しないでください。

## 修正判断

AivisSpeech エディタ側で完結する問題は、ユーザーの追加承認を待たずに修正します。  
たとえば設定値の読み込み補正、未処理 Promise、renderer / main の例外処理、Sentry フィルタ漏れ、通常操作で発生するブラウザ API 例外の握りつぶしは、このリポジトリで実装とテストまで進めます。

Electron / Chromium のネイティブクラッシュ、GPU プロセスの停止、OS のメモリ不足、ディスク容量不足、ウイルス対策ソフトや同期ソフトによるファイルロックは、エディタ側から根本的に直せるとは限りません。  
Sentry issue、最新イベント、該当スタック、発生条件、送信前フィルタの根拠を短くまとめて、送信前破棄対象として扱います。

AivisSpeech Engine 側と同じく、ローカルアプリではエラー以外の利用状況まで収集しません。  
renderer / main process のどちらでも、トレースや Replay が有効化されている場合は、Sentry の送信量とクォータ消費を増やす設定として見直します。

Engine API の `ResponseError` や `Failed to fetch` は広すぎるため、型名だけでは破棄しません。  
更新確認 URL、`initialize_speaker` の既知 500、ローカル Engine の性能イベントのように、URL・HTTP ステータス・スタック・パンくずから既知ノイズだと確認できた場合だけ破棄します。

修正先が曖昧な場合は、renderer、preload、main process、OpenAPI クライアント、ローカル Engine のどこで壊れているかを先に確認します。  
Editor 側で壊れた設定値や未処理例外を止められるなら Editor 側で直し、Engine の入力検証やモデル処理に修正が必要な場合は、このリポジトリだけで直せるように見せません。

## 必読資料

作業前に以下を読みます。

- `references/sentry-workflow.md`: Sentry API の使い分け、90日 issue 一覧、アーカイブ時の注意
- `references/classification.md`: 既存調査に基づく「破棄」「残す」「保留」の分類ルール
- `references/filter-implementation.md`: このリポジトリでの実装・テスト方針

タイトルベースの粗い確認だけでよい場面では、`scripts/probe_sentry_filter.mjs` を使えます。

```bash
pnpm exec node .codex/skills/aivisspeech-sentry-triage/scripts/probe_sentry_filter.mjs \
  --query "is:ignored" \
  --stats-period 90d
```

このスクリプトは読み取り専用です。  
最終的な「残す / 破棄する」判断の前にはイベント詳細を確認してください。

## リポジトリ前提

コマンドは AivisSpeech のリポジトリルートから実行します。

パッケージマネージャーには `pnpm` を使います。  
`npm` や `yarn` でスクリプトを実行しません。

Sentry のバンドル済み helper で取得できる内容は、まず helper を使います。  
helper で90日一覧を取得できない場合は、Sentry の組織別 issue API を読み取り専用で直接叩きます。

`SENTRY_AUTH_TOKEN` は絶対に出力しません。

ユーザーが明示しない限り、ステージング、ステージング解除、コミット、リセット、クリーンアップ、ファイル削除は行いません。
