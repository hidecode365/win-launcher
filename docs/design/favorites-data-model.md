# ピン止め・お気に入り・メモ機能のデータ構造

対象コード: `src-tauri/src/main.rs`（`FavoriteNode`／`enforce_reserved_folders`／`is_descendant_of`／`add_favorite_folder`／`move_favorite_node`／`remove_favorite_folder`）、`src/types.ts`（`FavoriteNode`／`PINNED_FOLDER_ID`）、`src/hooks/useSearch.ts`（ピン止め・お気に入りの state・アクション）、`src/lib/nodeTree.ts`。

要件・仕様の詳細は REQUIREMENTS.md「ピン止め・お気に入り・メモ機能」節を参照。本ファイルは実装上の設計判断・注意点のみを記す。段階1・段階1.5（v0.10.0〜v0.10.2）で「ピン止め」を、段階2で「お気に入り」（★登録 + `/favorite` 呼び出し）を実装済み。「メモ」は予約フォルダ（器）のみを生成し、機能自体は未実装。

アイコンの意匠・視認性・ツールチップは [favorites-ui-iconography.md](favorites-ui-iconography.md) を、選択状態の維持・結果行のDOM構造は [result-list-and-selection.md](result-list-and-selection.md) を参照。

## 現在の設計

<a id="favorite-node-structure"></a>

### データ構造（`FavoriteNode`）

ピン止め・お気に入り・メモの3機能を、単一の型 `FavoriteNode`（Rust: `main.rs` の `struct FavoriteNode`、フロントエンド: `src/types.ts` の `FavoriteNode` interface）で管理する。フィールドは `{ id, parentId, type, name, value, order }`。

**`children` を持つ入れ子構造ではなく `parentId` を持つフラットな配列（隣接リスト方式）を採用した理由**：既存の `FolderEntry`（`folders: FolderEntry[]`）と同じく `Vec<T>`／配列としてそのまま扱えるため、Rust 側に再帰的な型定義（`Box<FavoriteNode>` を含む木構造）を導入する必要がない。将来「お気に入り」でツリー表示・ドラッグ&ドロップによる階層移動を実装する場合も、ノードの `parentId` を書き換えるだけで「別の親へ移動」を表現できる（再帰構造だと移動のたびに元の親の `children` から取り除いて新しい親の `children` へ挿入する、というツリー操作が必要になるのに対し、フラット配列なら1フィールドの更新で済む）。

永続化：`settings.json` の新規キー `"favorites"`（`FAVORITES_STORE_KEY`）に `Vec<FavoriteNode>` をそのまま保存する。既存の `folders`/`appSettings` と同じストア・同じ「Rust コマンド経由で読み書きする」方式に統一しており、frecency・clipboardHistory のようなフロントエンドから JS の `@tauri-apps/plugin-store` API で直接読み書きする方式は**採用していない**（将来 `clipboard`/`command` 型のフィールドを追加する際、Rust 側の型定義に `#[serde(default)]` を付与するだけで後方互換を保証できるようにするため。全フィールドに `#[serde(default)]` を付与済み）。

保存は全量置き換え方式（`set_favorites(favorites: Vec<FavoriteNode>)`）のみで、部分更新用のコマンド（例:「1件だけ追加」）は設けていない。書き込み頻度が低い（ユーザーがピン止め操作をするたびの低頻度な操作）ため、フロントエンド側で配列を組み立ててから丸ごと送る方式で十分と判断した。

<a id="reserved-folders"></a>

### 予約フォルダ（固定ID）

ルート直下の「ピン止め」「お気に入り」「メモ」の3ノードは、`main.rs` の定数 `PINNED_FOLDER_ID`（`"__pinned__"`）／`FAVORITES_FOLDER_ID`（`"__favorites__"`）／`MEMO_FOLDER_ID`（`"__memo__"`）という固定文字列IDを持つ。フロントエンド側も `src/types.ts` の `PINNED_FOLDER_ID` 定数で同じ値を持つ（**Rust側の定数値を変更する場合、フロントエンド側の定数も必ず同時に更新すること**。両者は文字列リテラルの一致だけで結び付いており、型システムによる自動追従はない）。

固定IDを採用した理由：表示名（`name`。ユーザーが変更可能）で予約フォルダを参照すると、名前変更や多言語化時に参照が壊れる。IDで参照すれば `name` は自由に変更できる。

`enforce_reserved_folders`（`main.rs`）が予約フォルダの整合性を保証する。起動時（`setup()` の `ensure_reserved_folders`）に加え、`set_favorites` コマンド内でも毎回呼ぶことで、フロントエンドから送られてきた配列に予約フォルダの改変（削除・リネーム・親付け替え）が含まれていても、保存直前に正しい値へ強制的に是正する。**UI側で編集不可にするだけでなく、Rust側でも防御する**という、本プロジェクトが `set_folder_settings` の `max_depth` 範囲チェック等で一貫して採っている「バリデーションはフロントエンドだけでなくRust側でも行う」方針を踏襲したもの。

<a id="search-exclusion"></a>

### 検索結果からの除外（`search_files`）

ピン止め済みファイルを検索ボックスが空のときの通常一覧から除外する処理は、**フロントエンド側でのフィルタではなく Rust 側の `search_files` に `exclude_paths: Vec<String>` 引数を追加して行っている**。

理由：`search_files` は `MAX_SEARCH_RESULTS`（50件）に達した時点で走査を打ち切る。フロントエンド側で受け取った50件からピン止め済み分を差し引く方式だと、ピン止め件数が多いほど「一覧に表示できる固有ファイル数」がその分減ってしまう。Rust側の候補生成ループ内（アイコン取得より前、`continue` で早期スキップ）で除外すれば、50件の枠はピン止め対象外のファイルだけで満たされる。

`exclude_paths` に何を渡すかはフロントエンド（`useSearch.ts`）の責務：クエリが空文字のときのみピン止め済みパス一覧（`pinnedPathSet`）を渡し、クエリに文字が入力されている間は空配列を渡す（＝除外しない）。Rust側の `search_files` 自体はこの「クエリが空かどうか」の判定を一切知らず、渡された `exclude_paths` をそのまま使うだけの単純な実装にとどめている（判定ロジックをRust・フロントエンドの両方に分散させないため）。除外の可視性判定（`pinnedVisible`）を巡る不具合は「経緯」節を参照。

<a id="dnd-reordering"></a>

### ドラッグ&ドロップによる並び替え

ピン止めブロックの並び替えは新規ライブラリ（`@dnd-kit` 等）を追加せず、素の HTML5 Drag and Drop API（`draggable` 属性 + `onDragStart`/`onDragOver`/`onDrop`）で実装している（`ResultList.tsx`）。ウィンドウ移動用のドラッグ（`data-tauri-drag-region`）とは干渉しない（`data-tauri-drag-region` は `SearchBox.tsx` と `SettingsPanel.tsx` の2箇所にのみ付与されており、`ResultList.tsx` の行要素はドラッグ領域に含まれない）。

**今後 `ResultList.tsx` 配下に新たな D&D 機能を追加する場合も、この前提（検索結果一覧はドラッグ領域の外）が成り立つ限り同様に素の HTML5 D&D で実装でき、ライブラリ追加の要否を毎回再検証する必要はない**。ただし `data-tauri-drag-region` の付与箇所自体を変更した場合はこの前提が崩れるため、その際は改めて競合を確認すること。

`tauri.conf.json` のウィンドウ設定で `"dragDropEnabled": false` にしている（Windows 上で WebView2 が OS レベルのネイティブファイルドラッグ&ドロップを処理する設定。有効なままだと HTML5 の `dragover`/`drop` イベントが機能しない。経緯は「経緯」節を参照）。本アプリはOSからファイルをウィンドウへドラッグ&ドロップして受け取る機能を持たないため、無効化しても失われる機能はない。

`onDragStart` に `e.dataTransfer.effectAllowed = "move"` と `e.dataTransfer.setData(...)`、`onDragOver` に `e.dataTransfer.dropEffect = "move"` を設定している（環境差異による同種の症状の再発を防ぐ一般的なベストプラクティスとして）。

**トレードオフとして記録しておくべき制約**：`dragDropEnabled: false` にした結果、**HTML5 D&D による並び替えと、OSからのファイルドロップ受け入れは、現状の実装では二者択一の関係にある**。将来「Explorer からファイルをウィンドウへドラッグ&ドロップして検索フォルダに追加する」「Explorer からファイルをドラッグしてピン止め／お気に入りに直接追加する」といった、OS側のドラッグ操作を起点とする機能を追加したくなった場合、この設定が障害になる。その場合は `dragDropEnabled` を `true` に戻したうえで、ページ内 HTML5 D&D との共存方法を別途検討する必要がある（両者を同時に成立させる具体的な設計は未検討・今後の課題）。

<a id="frontend-implementation"></a>

### フロントエンド実装（`useSearch.ts`）

ピン止めに関する state・ロジックは、`/recent`・パス貼り付けウィザードと同様に `useSearch.ts` 自身に実装している（`useClipboard.ts` のような別フックへの切り出しは行っていない）。

- **世代ID管理**：`get_pinned_files`→`check_paths_exist` の一連の非同期呼び出しに `asyncCallIdRef` の新規キー `"pinned"` を割り当てている（詳細は [window-lifecycle.md](window-lifecycle.md#prefix-mode-architecture) を参照）
- **フォーカス回復時再取得テーブル**：`focusRegainTableRef.current` に `pinned: { active: pinnedVisible, refetch: () => fetchPinnedFiles("focus-regain") }` を追加している
- `pinnedVisible`（ピン止めブロックを表示すべきか）は `appSettings.pinEnabled && query === "" && !clipboardMode && !recentMode` で判定する。`calcMode`／`prefixCommandMode`／`pathPasteWizardMode` を明示的に除外していないのは、これらがいずれも非空クエリを前提とする構造上、`query === ""` の時点で自動的に成立しなくなるため
- `favorites`（生ノード配列、`get_favorites` で取得）と `pinnedFiles`（表示用・シェルアイコン付き、`get_pinned_files` で取得）を別の state として持つ。前者はピン止めの追加・解除・並び替えの判断材料（`order`・`id` を持つ）、後者は描画専用（アイコンは Rust 側でしか取得できないため）
- `togglePin`/`reorderPinned` はいずれも `favoritesRef.current`（最新の生配列）を元に更新後の配列を組み立て、`set_favorites` へ送ってから、その戻り値（Rust側で予約フォルダ是正・保存済みの配列）を新しい真実として `favoritesRef`/`favorites` に反映する。`reorderPinned` は保存の完了を待たず `pinnedFiles`（表示用配列）を先に楽観的に並び替える（体感速度を優先。保存自体は fire-and-forget）

<a id="pinning-from-recent"></a>

### `/recent` からのピン止め（段階1.5）

`rows` 構築ロジック自体は元から由来を区別していなかった：`useSearch.ts` の `rows` は `results`（`recentMode` 中は `recentResults` がコピーされたもの）を単純にループして `kind: "file"` の行を組み立てるだけで、ファイルの由来（通常のファイル検索結果か `/recent` か）を一切見ていない。`row.pinned: isPinned(file.path)` も同様に由来を問わず算出される。そのため段階1.5の変更は **`App.tsx` の `pinIconVisible` から `&& !search.recentMode` を削除しただけ**で、`ResultList.tsx`・`useSearch.ts` の `rows` 構築・`togglePin` 本体の分岐追加は不要だった。

**保存するパスの名寄せをしない方針**：`/recent` の行は取得時点で解決済みのローカル実パス（`RecentFile.path`）を持ち、通常のファイル検索結果は検索フォルダ配下の実ファイルパス（ショートカット自体が検索対象になっている場合は `.lnk` のパス）を持つ。`togglePin` は呼び出し元による違いを一切意識せず、常に `file.path` をそのまま `FavoriteNode.value` に保存する。結果として同一の実体ファイルを指していても `/recent` 由来と通常検索由来とでパス文字列が異なれば別エントリとして登録される。これは意図した仕様であり（REQUIREMENTS.md「/recent からのピン止め」節を参照）、名寄せ・正規化のロジックは実装しない。

**今後の指針**：`/recent` に対して★（お気に入り）・ノート（メモ）等の同種の行アクションを追加する場合も、`rows` 構築ロジック・行アクションのハンドラ側では `recentMode` を理由にした除外分岐を新設しないこと。表示可否を切り替える必要がある場合は、既存の合成フラグ（`pinnedVisible` のような「複数モードを包含した1つの真実」）を機械的に再利用し、`recentMode` 単体を条件式に個別に書き足さない。

<a id="favorites-tree"></a>

### お気に入り機能：ピン止めとの違い（実際にツリーを組む）

ピン止めは `PINNED_FOLDER_ID` の直下にしかノードを追加しない運用のため、データ構造上は隣接リストだが実質的にはフラットな1階層リストとして機能してきた。お気に入りは `FAVORITES_FOLDER_ID` 配下に `type: "folder"` のノードを中間ノードとして自由に作成・ネストできる、初めて「実際に木を組む」機能である。この違いにより、以下の3つはお気に入り実装で新規に必要になったもので、ピン止めには存在しない：

- `is_descendant_of(favorites, parent_id, ancestor_id)`（Rust, `main.rs`）とそのフロントエンド鏡 `isDescendantOfFolder`（`useSearch.ts`）：あるノードが特定の祖先の子孫かどうかを祖先チェーンをたどって判定する。フォルダ削除時の子孫巻き込み判定・重複登録判定（`/favorite` からの★追加時、既に同じ実体が `FAVORITES_FOLDER_ID` の子孫に存在するか）の両方で使う。任意の深さを想定するため、無限ループ防止の深さ上限ガード（64）を持たせている（ピン止めは常に深さ1のため元々この種のガードが不要だった）
- `src/lib/nodeTree.ts` の `groupNodesByParent`/`walkGroupedTree`：`parentId` でグルーピングしてから深さ優先で辿る、ツリーの平坦化ロジック共通部分
- 登録ダイアログ（`RegisterEntryDialog.tsx`）の配置先フォルダ選択：ピン止めには「配置先を選ぶ」という概念自体が存在しない（常に `PINNED_FOLDER_ID` 直下に追加するだけ）のに対し、お気に入りは登録の都度どのフォルダ配下に置くかをユーザーが選択する

今後「メモ」機能を実装する場合も、メモを単純な一覧（ピン止め型）にするか、フォルダ分類を持つツリー（お気に入り型）にするかで、上記のうちどれが必要になるかが変わる。フォルダ分類を持たせるなら、この3つはそのまま再利用できる設計にしてある。

<a id="duplicate-folder-name-validation"></a>

### 同一階層内の同名フォルダ作成を禁止するバリデーション

`add_favorite_folder`（Rust）に、同一の親フォルダ配下で同名（トリム後・大小文字区別なし）のフォルダを重複作成できないバリデーションを追加した。判定の作法は `validate_unique_keyword`（システムコマンド機能のキーワード重複チェック。詳細は [calc-and-prefix-commands.md](calc-and-prefix-commands.md) を参照）と同じ「トリム＋小文字化して比較」の慣習にそのまま合わせている。経緯は「経緯」節を参照。

<a id="favorite-mode-ordering"></a>

### `/favorite` モードの並び順方針（フォルダ/ファイルの混在を許可）

`/favorite` の一覧はファイル検索結果のような機械的な並び替え（frecency・アルファベット順等）を一切行わず、`order` フィールドが示す通りの並び順をそのまま表示する。**フォルダとファイルを種別ごとにグルーピングせず、同一階層内で自由に混在・入れ替え可能な設計を意図的に採用した。**

理由：お気に入りは「少数を厳選して登録する」用途であることを前提にすると、機械的な整列（種別ごとにまとめる等）はユーザーが意図して行った手動の並び替え（上下移動）を無意味化してしまう。ファイル検索結果のような「大量の項目から目的のものを見つける」用途とは異なり、お気に入りではユーザー自身が並び順そのものに意味を持たせたいはずだという判断から、システム側で並び順を再解釈・再整列しない方針にした。

視覚的な区別（フォルダ見出し行とアイテム行）の意匠は [favorites-ui-iconography.md](favorites-ui-iconography.md) を参照。

<a id="favorite-mode-provisional-features"></a>

### `/favorite` モードに前倒し実装した「上下移動」「フォルダ削除」は暫定実装

`move_favorite_node(id, direction)`・`remove_favorite_folder(id)`（いずれも Rust コマンド）と、`/favorite` 一覧内の上下移動ボタン・削除アイコンは、段階3で予定している設定画面側のドラッグ&ドロップによるツリー編集 UI が完成する**前**に、動作確認・実運用を進めるための最小限の暫定実装として前倒しで追加したものである。

**設計意図（今後の作業者が必ず踏まえること）**：段階3で設定画面のツリー編集 UI（並び替え・リネーム・削除・フォルダ作成をまとめて扱う想定）が完成した時点で、`/favorite` モード内のこれら暫定機能（上下移動ボタン・削除アイコン・関連する確認モーダル）は**撤去**し、メンテナンス系操作（並び替え・リネーム・削除・フォルダ作成）は設定画面側に一本化する方針である。`/favorite` モードは本来、`/recent` と同様に「呼び出して選ぶだけ」の一覧に留める想定であり、今回の上下移動・削除はそのための恒久機能ではない。

`move_favorite_node`/`remove_favorite_folder` の Rust コマンド自体（予約フォルダの保護ガード・`order` の部分更新等のロジック）は、設定画面のツリー編集 UI からも同じ操作の裏側として再利用できる可能性が高いため、コマンド自体を段階3実装時に無条件で削除してよいわけではない。**撤去対象は `/favorite` モード側の呼び出し口（UI）であり、Rust コマンドの要否は段階3の設計時に改めて判断すること。**

## 経緯

<a id="index-calc-impact-history"></a>

### ピン止めブロック導入によるインデックス計算への影響（現在はR-1で解消済み）

ピン止めブロックを導入した当初、`App.tsx` には `pathPasteLength`／`calcLength`／`urlConvertLength` など複数の候補群を合算した選択インデックス計算が複数箇所に分散しており、`pinnedLength`（`pinnedVisible` のときのみ `pinnedFiles.length`）を既存の全オフセット計算の先頭に追加する必要があった。影響箇所は `baseLength` の算出式、`handleKeyDown` 内の選択ファイル算出、`StatusFooter` への各 `is*Selected` 判定式、`ResultList.tsx` 内の絶対インデックス計算の4箇所に及んだ。

この「新しい候補群を1つ追加するたびに複数箇所のオフセット計算を同期しなければならない」という構造そのものが、後に選択状態のリセット不具合を繰り返し引き起こす根本原因となり、結果行のフラット配列化（R-1）に至った。現在はこのオフセット計算自体が撤廃されているため、新しい行種別の追加方法は [result-list-and-selection.md](result-list-and-selection.md#adding-a-row-kind) を参照すること。

<a id="dragdrop-enabled-conflict-history"></a>

### Tauri の `dragDropEnabled` と HTML5 Drag and Drop の競合

**症状**：ピン止めブロックの行をドラッグすると、ドラッグ中は（CSS の `cursor-grab` による）手のひらカーソルになるが、実際にドロップしようとすると禁止マークのカーソルに変わり `drop` イベントが発火しない。

**直接原因**：`ResultList.tsx` 側の `onDragOver={(e) => e.preventDefault()}` は実装として正しく、JS コードの不備ではなかった。真因は Tauri v2 の `tauri.conf.json` のウィンドウ設定 `dragDropEnabled`（デフォルト `true`）。この設定は Windows 上で WebView2 が **OS レベルのネイティブファイルドラッグ&ドロップ**（Explorer 等からファイルをウィンドウへドラッグして受け取る機能）を処理するためのものだが、有効な間はページ内（HTML5）の `dragover`/`drop` イベントに対してブラウザ側の判定が割り込み、`preventDefault()` を呼んでいても禁止カーソルのまま `drop` が成立しなくなる（`tauri-utils` クレートの `WindowConfig::drag_drop_enabled` のドキュメントコメントにも "Disabling it is required to use HTML5 drag and drop on the frontend on Windows." と明記されている、既知の仕様）。

この原因は「ドラッグ&ドロップとウィンドウドラッグ領域の非競合」の調査（`data-tauri-drag-region` の確認）だけでは見つからなかった。あの調査は「ウィンドウ移動ドラッグとの競合」という1つの競合要因を確認・除外したに過ぎず、`dragDropEnabled` というより下層（WebView2 の OS 統合レベル）の別の競合要因は実装を進めてドラッグを実際に試すまで判明しなかった。**「特定の競合要因を1つ確認して問題ないと判断する」ことと「あらゆる競合要因が存在しない」ことは同じではない**、という教訓として記録する。

**横並び調査**：本アプリはOSからファイルをウィンドウへドラッグ&ドロップして受け取る機能を持たない（「パス貼り付けによる検索フォルダ管理」は Ctrl+C/Ctrl+V のクリップボード経由であり、OSのネイティブドラッグ&ドロップは使用していない）。そのため `dragDropEnabled` を無効化しても失われる機能はない。

**対応**：`tauri.conf.json` のウィンドウ設定に `"dragDropEnabled": false` を追加した。

<a id="pin-enabled-off-exclusion-bug"></a>

### `pinEnabled` OFF 時に通常検索結果からもピン止めファイルが消える

**症状**：設定画面で `pinEnabled` を OFF にすると、ピン止めブロックが非表示になるだけでなく、ピン止めしていたファイルが通常のファイル検索結果からも消えてしまっていた（ON に戻すと復活する）。

**直接原因**：`useSearch.ts` の `search_files` 呼び出し箇所で、除外パスの算出条件が `query === ""` のみになっており、`appSettings.pinEnabled` を見ていなかった。`favorites`（ピン止めの生ノード配列）はアプリ起動時に無条件で取得するため、`pinEnabled` の ON/OFF に関わらず `pinnedPathSet` は常に中身を持ち、結果として `pinEnabled` が OFF でも除外され続けていた。

**教訓（設計原則）**：「ある UI 要素が表示されているかどうか」の判定条件（ここでは `pinnedVisible`）と、「その UI 要素に関連するデータをバックエンド側の処理にどう反映するか」の判定条件は、本来1つの真実（同じブール式）であるべきで、片方だけを実装すると今回のように機能 OFF 時の除外解除漏れが起こる。`pinnedVisible` は既に `appSettings.pinEnabled && query === "" && !clipboardMode && !recentMode` を正しく判定していたにもかかわらず、`search_files` の除外条件だけがこれを再利用せず `query === ""` を独自に再実装してしまっていたことが根本原因。**同じ可視性判定が複数箇所で必要になる場合は、判定ロジックを1箇所（`pinnedVisible`）にまとめ、他の箇所はそれを参照するだけにすること。**

**対応**：`excludePaths` の算出を `query === "" ? ... : []` から `pinnedVisible ? ... : []` に変更した。

<a id="duplicate-folder-validation-history"></a>

### 同名フォルダ禁止バリデーションの経緯

`/favorite` モードでの表示順序が意図と異なるという不具合報告を受けて調査した。

まずツリー平坦化アルゴリズム自体（`favoriteTree` の構築ロジック）を、実際の `order` 値を使った複数パターンのスタンドアロン検証スクリプトで確認したところ、アルゴリズム自体は変更前後どちらの実装（重複前の実装・`nodeTree.ts` へ切り出した後の実装）でも一貫して正しく、`order` 値が示す通りの順序をそのまま再現していた。合わせて、この調査の過程で無関係の実在バグ（`createFavoriteFolder` がフォルダ作成後に `rawFavoriteNodes` を再取得しておらず、直後の表示が古いままになる）を1件発見し修正した。

アルゴリズム自体に不整合は見つからなかった一方、**同一階層に同名フォルダが複数存在すると、ユーザーが登録ダイアログのフォルダ選択プルダウンで区別がつかず、意図と異なる方のフォルダを選んでしまう**（結果として「順序がおかしい」ように見える）ことが、表示上の不整合の実態として説明のつく原因だった。アルゴリズムのバグとして再現・特定するよりも、そもそも同名フォルダが作成できてしまうこと自体を防ぐ方が、再発防止として確実かつシンプルと判断し、[duplicate-folder-name-validation](#duplicate-folder-name-validation) のバリデーションを追加した。

## 今後の指針

- 予約フォルダの固定IDをRust側で変更する場合は、フロントエンド側の定数も必ず同時に更新する（型システムによる自動追従はない）
- バリデーションはフロントエンド側だけでなく、Rust側（保存直前）でも必ず行う（`enforce_reserved_folders` と同じ二重防御の考え方）
- 可視性判定（「このUI要素は表示されるか」）とバックエンドの除外・フィルタ条件は、同じブール式を1箇所にまとめて両方から参照する。片方だけ個別に再実装しない
- ツリー構造を持つ一覧（お気に入り、将来のメモ機能等）で「順序がおかしい」「意図した項目と違うものが選ばれる」といった報告を受けた場合、まずアルゴリズム（平坦化・ソート）自体を疑う前に、**同名・同一表示内容のノードが複数存在してユーザーが取り違えていないか**を先に確認すること。表示上の識別性（一意な名前）が担保されていないツリーは、アルゴリズムが正しくてもユーザー体感としての「順序の不整合」を生む
- 新しい行の種類（★お気に入り・メモ等）を追加する場合、個別のオフセット変数は新設しない（詳細は [result-list-and-selection.md](result-list-and-selection.md#adding-a-row-kind) を参照）
- メモ機能を実装する際、フォルダ分類（ツリー構造）を持たせるなら `is_descendant_of`／`groupNodesByParent`+`walkGroupedTree`／配置先選択 UI の3点をそのまま再利用する
