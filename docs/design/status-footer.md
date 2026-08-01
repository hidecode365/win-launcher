# フッター表示の実装マップ

対象コード: `src/components/StatusFooter.tsx`（検索画面・クリップボード履歴モード・パス貼り付けウィザード・`/favorite` ブラウジングを1つに束ねた汎用フッター）、`src/components/FavoriteEditFooter.tsx`（お気に入り編集ビュー専用）、`src/components/SettingsPanel.tsx`（設定画面フッター、バージョン表示のみ）。

フッターに何を表示すべきかという規約自体は REQUIREMENTS.md「フッター表示規約（全画面共通）」節（「キー操作」節配下）を参照する。**規約本文の正本はそちらであり、本ファイルには複製しない。** 本ファイルは、その規約が現在どの画面にどう実装されているかの一覧（実装マップ）のみを記す。

<a id="footer-implementation-map"></a>

## 各画面のフッター表示内容

| 画面／モード | 実装コンポーネント | 表示内容 |
| --- | --- | --- |
| 検索画面（通常モード） | `StatusFooter.tsx`（既定分岐） | ↑↓ 選択／Enter（文言は選択中の行種別・モードにより分岐：Web検索行選択時「ブラウザで開く」、計算結果/URLエンコード・デコード結果「コピー」、パス貼り付け候補「選択」、それ以外「起動」）／Shift+Enter フォルダを開く（ピン止め・ファイル検索結果選択時のみ）／Ctrl+D クリア／Esc 閉じる |
| システムコマンド確認モーダル | `StatusFooter.tsx`（`pendingCommand` 分岐） | Enter 実行／Esc キャンセル |
| クリップボード履歴モード | `StatusFooter.tsx`（`clipboardMode` 分岐、既定分岐の枠組みを共有） | ↑↓ 選択／Enter クリップボードにセット／Ctrl+D クリア／Esc 閉じる |
| パス貼り付けウィザード | `StatusFooter.tsx`（`pathPasteWizardStep` 分岐） | （フォルダ選択ステップのみ）↑↓ 選択／Enter（フォルダ選択ステップは「次へ」、名前編集ステップは「保存」）／Esc 戻る |
| `/favorite` ブラウジング | `StatusFooter.tsx`（`favoriteSelectedKind` 分岐、既定分岐の枠組みを共有） | ↑↓ 選択／Enter（フォルダ見出し行選択時は「開閉」、アイテム行選択時は「起動」）／Shift+Enter フォルダを開く（アイテム行選択時のみ）／Ctrl+D クリア／Esc 閉じる |
| お気に入り編集ビュー | `FavoriteEditFooter.tsx`（専用コンポーネント） | ↑↓ 選択／（フォルダ選択時）Enter 開閉／Ctrl+Shift+N フォルダ作成／（フォルダ選択時）Delete 削除／（アイテム選択時）Delete ★解除／（フォルダ・アイテム選択時）F2 リネーム・Alt+↑↓ 並び替え・Alt+←→ 再親化／Esc 戻る |
| 設定画面 | `SettingsPanel.tsx`（インライン実装） | バージョン番号（例「v0.3.4」）のみ。フッター表示規約の対象外（REQUIREMENTS.md「フッター表示規約（全画面共通）」節を参照） |

## 今後の指針

- 新しい画面・モードを追加する場合、この表に1行追記する（表示内容の文言そのものはコードから読み取れる派生情報のため正本はコードであり、この表はあくまで現状把握用のスナップショットである。CLAUDE.md「変更時の同期チェックリスト」節の「派生情報の同期漏れ」原則を参照）
- `StatusFooter.tsx` は複数モードを1つのコンポーネントに束ねた汎用フッターである。お気に入り編集ビューのように操作体系（キー割当）が大きく異なる画面は、`FavoriteEditFooter.tsx` のように専用コンポーネントへ分離してよい（`StatusFooter.tsx` 側の条件分岐がこれ以上複雑化するのを避けるため。詳細は `FavoriteEditFooter.tsx` 冒頭のコメントを参照）
