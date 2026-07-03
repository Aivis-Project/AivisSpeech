# 分類ルール

## 破棄するもの

AivisSpeech エディタのデバッグに使えないと実データから確認できた署名だけを破棄します。

既知の破棄分類は以下です。

- 設定値破損: `splitterPosition.audioInfoPaneWidth` が `NaN` の `ZodError`
- 設定保存のファイルロック: `config.json-*.tmp` から `config.json` への rename 時の `EPERM`
- ローカルストレージ不足: `ENOSPC: no space left on device`
- パイプ切断: `EPIPE: broken pipe, write`
- プロセス起動環境: `spawn UNKNOWN`
- メモリ・文字列長・WebAssembly メモリ: `Out of Memory`、`RtlAllocateHeap`、`Invalid string length`、`memory access out of bounds`
- ブラウザ再生中断: `HTMLMediaElement.play()` の `AbortError`
- 音声出力デバイス欠損: `AudioContext.setSinkId()` の `NotFoundError`、`Requested device not found`
- 更新確認の通信失敗: `useFetchNewUpdateInfos.ts` または `updateInfos.json` 取得時の `Failed to fetch` / `Network response was not ok`
- ローカル Engine 通信断: `127.0.0.1` / `localhost` の既知 Engine API で発生する `Failed to fetch` / `FetchError`
- GPU / Utility / Crashpad / Chromium ネイティブクラッシュ: `EXCEPTION_BREAKPOINT`、`EXCEPTION_ACCESS_VIOLATION_READ` + GPU ドライバ、`Simulated Exception`、`DumpWithoutCrashing`、`GPU process exited`、`Utility process exited`、`SIGSEGV / SEGV_MAPERR`、`D3DCompiler_47.dll`
- ローカル Engine の性能 issue: `speaker_info`、`engine_manifest`、`aivm_models` の `Large HTTP payload` / `N+1 API Call`

## 残すもの

AivisSpeech エディタ側の不具合を示す可能性がある issue は残します。

既知の残す分類は以下です。

- 汎用的な `TypeError`
- 汎用的な `ResponseError`
- `audioQuery is not defined for audioItem`
- `Cannot read properties of undefined`
- `assert characterInfo !== undefined`
- `話者の変更に失敗しました`
- `Cannot read properties of null (reading 'filePath')`
- `supportedFeatures` 参照失敗

これらは件数が少なくても、プロジェクト方針としては残します。  
実データで「特定署名が環境ノイズ」と確認できた場合だけ、個別に破棄分類へ移します。

## 修正対象の扱い

残す issue は、さらに修正先で分けます。

- AivisSpeech エディタ内で完結する場合: このリポジトリで修正し、絞り込みテストまたは既存テストを追加・更新します
- 設定値や保存済みデータの補正で止められる場合: Zod schema、設定読み込み、保存前の境界で補正します
- AivisSpeech Engine 側の実装が必要な場合: このリポジトリだけで直せるように見せず、スタック・入力・再現条件・修正候補をユーザーへ報告します
- Electron / Chromium 側の問題が濃い場合: 送信前フィルタを優先し、アプリ側で安全に回避できる場合だけ実装します

修正先を判断できない場合は、Sentry のタイトルだけで決めません。  
イベント詳細、スタック、パンくず、現在の実装を確認してから、実装するか報告に留めるかを決めます。

## 保留するもの

タイトルだけを根拠に、以下の汎用例外へフィルタを追加しません。

- 汎用的な `TypeError`
- 汎用的な `Error`
- 汎用的な `ResponseError`
- 汎用的な `FetchError`
- 汎用的な `Failed to fetch`

先にイベント詳細、スタック、リクエスト context を確認します。  
それでも確定できない場合は、黙ってフィルタせず、残した理由を報告します。
