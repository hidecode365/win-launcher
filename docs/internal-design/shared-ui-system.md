# 共有UI・デザインシステム

対象コード: `tailwind.config.js`、`src/ui/sharedStyles.ts`、`src/components/ActionButton.tsx`、`src/components/MemoNodeRenameInput.tsx`、`src/components/SettingsButton.tsx`。アイコン専用の共有設計は [favorites-ui-iconography.md](favorites-ui-iconography.md) を参照。

本ファイルは、新しい画面やUI要素を実装するときの共有UIの入口である。具体的な値の正本はコードとし、本書は「どの共有定義を、どの意味で使うか」を索引として管理する。

<a id="shared-ui-entry-point"></a>

## 共有UIを選ぶ順序

1. 構造・振る舞いまで同じなら、既存の共有コンポーネントを使う。
2. 見た目だけが同じなら、`src/ui/sharedStyles.ts`の共有スタイルと`tailwind.config.js`のsemantic tokenを使う。
3. 既存定義で意味を表現できない場合だけ、新しいvariantまたはtokenを追加する。

画面固有のrawな色・余白・文字サイズを先に書き、後から目視で別画面へ合わせる手順は採らない。共有対象は「複数画面で同じ意味を持つ値」に限定し、単一画面の例外値まで網羅的にtoken化しない。

<a id="semantic-tokens"></a>

## Semantic token

`tailwind.config.js`の`theme.extend`が値の正本である。現在は次の意味だけを共有する。

- 色: 主要・強調・補助テキスト、選択背景、標準／控えめhover、surface、border、focus、primary action、disabled
- spacing: 管理ツリー行の左右・縦余白、primary actionの左右・縦余白
- typography: 本文相当の`text-ui-body`、補助／見出し相当の`text-ui-meta`

token名は色相や画面名ではなく役割で付ける。新しい色を追加する前に、既存の`ui-*`が同じ意味を表していないか確認する。

<a id="manage-tree-row-variants"></a>

## 管理ツリー行のvariant

`src/ui/sharedStyles.ts`の`manageTreeRowClass`と`MANAGE_TREE_ROW_LABEL`が、お気に入り画面・メモ画面（いずれも管理画面ベースの単一画面。issue 0026で統合）の共通定義である。

issue 0026で「閲覧専用パネル」（旧`FavoriteListPanel.tsx`／`MemoPanel.tsx`）を撤去し、`/favorite`・`/memo`とも管理画面へ統合したことに伴い、閲覧ツリー行専用だった`browseTreeRowClass`（旧`folder`/`item`の2variant）は削除した。現在は閲覧・管理の両方をこの`manageTreeRowClass`（`fixed`/`folder`/`item`の3variant）1本で表現する。

- `fixed`: 「お気に入り」「メモ」「ゴミ箱」のような管理用固定行。固定の行高と補助文字階層を持つ
- `folder`: 開閉可能なフォルダ行。標準縦余白と補助文字階層を持つ
- `item`: ファイル・メモ等の内容行。folderより広い縦余白と本文文字階層を持つ

状態は`selected`と`muted`を引数で表す。`selected`は全variantで選択背景＋白文字、`muted`はゴミ箱配下等の控えめなsurface／hoverを表す。D&Dのbefore／after／into表示は操作固有の状態なので、共有行classの外側で追加する。

`FavoriteEditTree.tsx`自身もこの定義を参照する。値を変える場合はお気に入り・メモ双方へ波及する変更として扱い、片方だけをraw classで上書きしない。

<a id="memo-inline-rename"></a>

## メモノードのインラインリネーム

`src/components/MemoNodeRenameInput.tsx`が、メモ画面とメモ管理画面に共通するリネーム処理の入口である。入力UIとEnter確定・Escキャンセル・エラー表示は既存の`RenameInput`を合成し、保存は両画面ともRustの`rename_favorite_node`を呼ぶ。同一階層内の重複・空文字・予約フォルダ等の最終的な検証はRust側を正本とし、画面別の検証処理を追加しない。

画面側は、リネーム可能な行かどうかの判定、成功後の一覧再取得、フォーカス復帰だけを担当する。メモ画面には作成・削除・並び替え・再親化の導線を追加せず、閲覧側の例外的な構造操作をこのコンポーネントへ限定する。

`RenameInput`は、EnterとEscを入力欄内で完結させ、一覧側へ伝播させない。IME変換中のEnterはリネーム確定を行わないが、伝播停止は必ず行う。window captureで一覧キーを処理する画面は、入力欄より先にイベントを受け取るため、React stateの「リネーム中」フラグではなく、実際の`event.target`に付けた`data-inline-rename-input`で除外する。state更新後のeffect再登録を待つ判定は、入力欄が既に表示された直後にも古いクロージャを参照しうるため使わない。

メモ管理画面の新規メモ作成は、既存ノード用の`MemoNodeRenameInput`を経由しない。作成専用の`MemoCreateRow`でタイトルを確定した時点に限って`add_memo`を呼び、トリム済みタイトルを`name`と`content`の両方へ渡す。Rust側の`add_memo`はその内容で`revision: 1`の`MemoDocument`を直接作るため、「新規作成直後」を示す一時フラグや、v2へ進める追加保存は不要である。空入力では両値を空文字のまま渡し、表示だけを`memoNodeDisplayName`で「無題のメモ」へフォールバックする。通常リネームは引き続き`rename_favorite_node`だけを呼び、本文へ触れない。

<a id="action-button"></a>

## ActionButton

`src/components/ActionButton.tsx`は、ユーザーの現在の作業を確定するactionを表す共有ボタンである。

- `primary`: メモ本文の保存、OCRの「コピーして閉じる」、設定の保存
- `secondary`: OCRの「閉じる」、メモの「下書きを破棄」等、確定actionと並ぶ低優先度の補助操作。不透明なsurfaceと補助文字色由来のoutlineでクリック可能性を示しつつ、塗りつぶしのprimaryより視覚的な優先度を下げる
- `compact`／`standard`: semantic roleではなく配置密度の違い。色・hover・disabledの意味はsizeに関係なく共通。同じsizeのvariantは固定heightを共有し、outlineの有無によらず同じ外形にする

画面側で独自のheight・padding・outlineを追加せず、sizeとvariantの状態表現を使う。

破壊的操作はprimaryへ流用しない。将来共有が必要になった時点で`destructive`の追加を検討する。

<a id="editor-surface"></a>

## 編集エリアのsurface

`src/ui/sharedStyles.ts`の`EDITOR_SURFACE_CLASS`が、本文を直接編集するtextareaの表面色・文字色・border・focus・disabledを管理する。

メモ本文とOCRテキストは、値の所有者、autoFocus、キーボード処理、スクロール構造が異なるため、Reactコンポーネントには統合しない。各画面はflex・overflow・イベント等の構造と振る舞いを保持し、見た目だけを`EDITOR_SURFACE_CLASS`へ接続する。

<a id="settings-button"></a>

## 設定ボタン

`src/components/SettingsButton.tsx`は、設定画面を開く歯車アイコン＋Tooltip「設定」を1コンポーネントへ共通化したもの。issue 0024の400_テスト・バグ修正（PO指摘）で、検索画面（`SearchBox.tsx`）とOCR画面にしか無かったこのボタンを、お気に入り・メモ・クリップボード履歴・最近使ったファイルの各L1画面ヘッダーにも追加した際に、6箇所へSVGを複製する代わりに切り出した。

クリックで`onOpenSettings`を呼ぶだけの表示専用コンポーネントで、設定を開く／閉じて元のL1画面へ戻る経路自体（`App.tsx`の`openSettings`/`closeSettings`/`previousViewRef`。詳細は[window-lifecycle.md](window-lifecycle.md#settings-return-view)）には関与しない。新しいL1画面を追加する場合はヘッダー右端でこのコンポーネントをそのまま使い、個別にSVGを複製しない。設定画面自身（`SettingsPanel.tsx`）はこのボタンを表示しない（表示先そのものを持たないため自動的に満たされる）。

## 状態確認の範囲

- 閲覧ツリー行: 通常、hover、selected、folder／itemの実高
- 管理ツリー行: 通常、hover、selected、muted、D&D drop
- ActionButton: 通常、hover、focus、disabled
- 編集エリア: 通常、focus、disabled

新しいvariantを追加する場合も、通常時だけでなく上記に対応する状態を同時に定義する。
