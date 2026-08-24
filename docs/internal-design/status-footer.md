# フッター表示の実装マップ

対象コード: `src/components/StatusFooter.tsx`（検索画面・クリップボード履歴モード・パス貼り付けウィザードを1つに束ねた汎用フッター）、`src/components/FavoriteEditFooter.tsx`（お気に入り編集ビュー専用）、`src/components/MemoManageFooter.tsx`（メモ管理画面専用）、`src/components/SettingsPanel.tsx`（設定画面フッター）、`src/components/KeyHint.tsx`（キー操作ヒントのチップ表示。全フッター共通）、`src/components/FooterBar.tsx`（フッター外枠。左側にキー操作チップ群、右端にバージョン番号を表示するレイアウトを共通化）。

フッターに何を表示すべきかという規約自体は 00-requirements.md「フッター表示規約（全画面共通）」節（「キー操作」節配下）を参照する。**規約本文の正本はそちらであり、本ファイルには複製しない。** 本ファイルは、その規約が現在どの画面にどう実装されているかの一覧（実装マップ）のみを記す。

<a id="footer-implementation-map"></a>

## 各画面のフッター表示内容

全画面共通で、`FooterBar`（左：`KeyHint` チップ群、右端：バージョン番号）を外枠として使う。バージョン番号は App.tsx が一度だけ `getVersion()` を取得し、各フッターへ props として配る。

| 画面／モード | 実装コンポーネント | キー操作チップの内容 |
| --- | --- | --- |
| 検索画面（通常モード） | `StatusFooter.tsx`（既定分岐） | ↑↓ 選択／Enter（文言は選択中の行種別・モードにより分岐：Web検索行選択時「ブラウザで開く」、計算結果/URLエンコード・デコード結果「コピー」、パス貼り付け候補「選択」、それ以外「起動」）／Shift+Enter フォルダを開く（ピン止め・ファイル検索結果選択時のみ）／Ctrl+D クリア／Esc 閉じる |
| システムコマンド確認モーダル | `StatusFooter.tsx`（`pendingCommand` 分岐） | Enter 実行／Esc キャンセル |
| クリップボード履歴モード | `StatusFooter.tsx`（`clipboardMode` 分岐、既定分岐の枠組みを共有） | ↑↓ 選択／Enter クリップボードにセット／Ctrl+D クリア／Esc 閉じる |
| パス貼り付けウィザード | `StatusFooter.tsx`（`pathPasteWizardStep` 分岐） | （フォルダ選択ステップのみ）↑↓ 選択／Enter（フォルダ選択ステップは「次へ」、名前編集ステップは「保存」）／Esc 戻る |
| お気に入り画面 | `FavoriteEditFooter.tsx`（専用コンポーネント） | ↑↓ 選択／（フォルダ選択時）Enter 開閉／（アイテム選択時）Enter 起動・Shift+Enter フォルダを開く／Ctrl+Shift+N フォルダ作成／（フォルダ・アイテム選択時）F2 リネーム・Ctrl+Shift+↑↓ 並び替え・Ctrl+Shift+←→ 再親化／Ctrl+D クリア／Esc 戻る（絞り込み中はEnter 開閉・並び替え・再親化のチップを非表示にする。リネーム中はEnter 確定／Esc キャンセルへ切り替える。削除・★解除はマウス操作のみのため表示しない） |
| メモ画面 | `MemoManageFooter.tsx`（専用コンポーネント） | 一覧側では↑↓ 選択／（メモ行選択時・ゴミ箱外）Enter クリップボードにセット・Ctrl+E 本文を編集／（フォルダ・ゴミ箱選択時）Enter 開閉／（ゴミ箱外のメモ・フォルダ選択時）Ctrl+Shift+N フォルダ作成・F2 リネーム・Ctrl+Shift+↑↓ 並び替え／（ゴミ箱外のメモ・フォルダ選択時）Ctrl+Shift+←→ 再親化、（ゴミ箱配下のメモ・フォルダ選択時）Ctrl+Shift+← 復元／Ctrl+D クリア／Esc 戻る。本文編集エリアでは（下書きがある場合のみ活性化）Ctrl+S 保存／Esc 一覧へ戻る（本文編集中はCtrl+Dのフッター表示・実行を抑止する。06-keyboard-interactions.md表9「本文編集エリア｜Ctrl+D｜無効」）。リネーム中はEnter 確定／Esc キャンセルへ切り替える（絞り込み中はEnter 開閉・並び替え・再親化・復元のチップを非表示にする。ゴミ箱への移動・完全削除はマウス操作のみのため表示しない） |
| 設定画面 | `SettingsPanel.tsx`（`FooterBar`/`KeyHint` を使用） | Esc 閉じる（Ctrl+,は設定画面表示中は無効なため表示しない） |

## 今後の指針

- 新しい画面・モードを追加する場合、この表に1行追記する（表示内容の文言そのものはコードから読み取れる派生情報のため正本はコードであり、この表はあくまで現状把握用のスナップショットである。CLAUDE.md「変更時の同期チェックリスト」節の「派生情報の同期漏れ」原則を参照）
- `StatusFooter.tsx` は複数モードを1つのコンポーネントに束ねた汎用フッターである。お気に入り編集ビューのように操作体系（キー割当）が大きく異なる画面は、`FavoriteEditFooter.tsx` のように専用コンポーネントへ分離してよい（`StatusFooter.tsx` 側の条件分岐がこれ以上複雑化するのを避けるため。詳細は `FavoriteEditFooter.tsx` 冒頭のコメントを参照）
- 新しいキー操作ヒントを追加する場合は、素の `<span>` ではなく必ず `KeyHint`（`keys`/`label` の2 prop）を使い、チップの配色・形状を個別に実装しない
- フッターに右端のバージョン番号を表示する新しい画面を追加する場合、`getVersion()` を個別に呼ばず、App.tsx が保持する値を props で受け取る（`FooterBar` の `version` prop に渡すだけでよい）
