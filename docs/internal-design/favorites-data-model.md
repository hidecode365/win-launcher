# ピン止め・お気に入り・メモ機能のデータ構造

対象コード: `src-tauri/src/main.rs`（`FavoriteNode`／`enforce_reserved_folders`／`is_descendant_of`／`add_favorite_folder`／`move_favorite_node`／`remove_favorite_folder`）、`src/types.ts`（`FavoriteNode`／`PINNED_FOLDER_ID`）、`src/hooks/useSearch.ts`（ピン止め・お気に入りの state・アクション）、`src/lib/nodeTree.ts`、`src/hooks/useFavoriteEditSelection.ts`（お気に入り編集ビュー専用の選択ドメイン・仮想固定行）。

要件・仕様の詳細は REQUIREMENTS.md「ピン止め・お気に入り・メモ機能」節を参照。本ファイルは実装上の設計判断・注意点のみを記す。段階1・段階1.5（v0.10.0〜v0.10.2）で「ピン止め」を、段階2で「お気に入り」（★登録 + `/favorite` 呼び出し）を実装済み。「メモ」は予約フォルダ（器）のみを生成し、機能自体は未実装。

アイコンの意匠・視認性・ツールチップは [favorites-ui-iconography.md](favorites-ui-iconography.md) を、選択状態の維持・結果行のDOM構造は [result-list-and-selection.md](result-list-and-selection.md) を参照。

## 現在の設計

<a id="favorite-node-structure"></a>

### データ構造（`FavoriteNode`）の実装

**データ構造の定義そのもの**（隣接リスト方式の採用理由・永続化方式・全量置き換え方式）は、外部設計書 `external-design/03-data-model.md#favorite-node-structure` へ移設した。本節には実装上の対応のみを記す。

- 型定義の実体：Rust は `main.rs` の `struct FavoriteNode`、フロントエンドは `src/types.ts` の `FavoriteNode` interface
- 永続化キーは `FAVORITES_STORE_KEY`（`"favorites"`）。保存コマンドは `set_favorites(favorites: Vec<FavoriteNode>)`
- 後方互換のため、Rust 側の全フィールドに `#[serde(default)]` を付与済み

<a id="reserved-folders"></a>

### 予約フォルダ（固定ID）の実装

**固定IDを採用する方針とその理由、Rust 側での二重バリデーション方針**は、外部設計書 `external-design/03-data-model.md#reserved-folders` へ移設した。本節には実装上の対応と注意点のみを記す。

- 定数の実体：`main.rs` の `PINNED_FOLDER_ID`（`"__pinned__"`）／`FAVORITES_FOLDER_ID`（`"__favorites__"`）／`MEMO_FOLDER_ID`（`"__memo__"`）
- **Rust 側の定数値を変更する場合、フロントエンド側（`src/types.ts` の `PINNED_FOLDER_ID`）の定数も必ず同時に更新すること。** 両者は文字列リテラルの一致だけで結び付いており、型システムによる自動追従はない
- 整合性の是正は `enforce_reserved_folders`（`main.rs`）が担う。起動時（`setup()` の `ensure_reserved_folders`）に加え、`set_favorites` コマンド内でも毎回呼ぶ

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

### お気に入り機能：ピン止めとの違い（実装）

**構造上の違いそのもの**（ピン止めは実質1階層、お気に入りは実際に木を組む）と、そこから導かれる**メモ機能実装時の判断基準**は、外部設計書 `external-design/03-data-model.md#favorites-tree` へ移設した。本節には、外部設計書が挙げる3概念の実装上の実体のみを記す。

- **祖先チェーンをたどる子孫判定**：`is_descendant_of(favorites, parent_id, ancestor_id)`（Rust, `main.rs`）とそのフロントエンド鏡 `isDescendantOfFolder`（`useSearch.ts`）。フォルダ削除時の子孫巻き込み判定・重複登録判定（`/favorite` からの★追加時、既に同じ実体が `FAVORITES_FOLDER_ID` の子孫に存在するか）の両方で使う。任意の深さを想定するため、無限ループ防止の深さ上限ガード（64）を持たせている（ピン止めは常に深さ1のため元々この種のガードが不要だった）
- **ツリーの平坦化**：`src/lib/nodeTree.ts` の `groupNodesByParent`/`walkGroupedTree`。`parentId` でグルーピングしてから深さ優先で辿る
- **登録時の配置先フォルダ選択**：登録ダイアログ（`RegisterEntryDialog.tsx`）の配置先プルダウン

<a id="duplicate-folder-name-validation"></a>

### 同一階層内の同名フォルダ作成を禁止するバリデーション（実装）

**バリデーションの仕様と設ける理由**は、外部設計書 `external-design/03-data-model.md#duplicate-folder-name-validation` へ移設した。

実装は `add_favorite_folder`（Rust）。判定の作法は `validate_unique_keyword`（システムコマンド機能のキーワード重複チェック。詳細は [calc-and-prefix-commands.md](calc-and-prefix-commands.md) を参照）と同じ「トリム＋小文字化して比較」の慣習にそのまま合わせている。導入の経緯は「経緯」節を参照。

<a id="favorite-mode-ordering"></a>

### `/favorite` モードの並び順（実装）

**並び順を再整列しないという方針とその理由**は、外部設計書 `external-design/03-data-model.md#favorite-mode-ordering` へ移設した。

実装上は `order` フィールドの昇順でそのまま並べるだけで、ソート・グルーピングの処理を一切持たない。視覚的な区別（フォルダ見出し行とアイテム行）の意匠は [favorites-ui-iconography.md](favorites-ui-iconography.md) を参照。

<a id="favorite-mode-provisional-features"></a>

### `/favorite` モードに前倒し実装した「上下移動」「フォルダ削除」は撤去済み（暫定実装の記録）

`move_favorite_node(id, direction)`・`remove_favorite_folder(id)`（いずれも Rust コマンド）と、`/favorite` 一覧内の上下移動ボタン・削除アイコンは、当初お気に入り編集ビュー（ドラッグ&ドロップによるツリー編集 UI）が完成する**前**に、動作確認・実運用を進めるための最小限の暫定実装として前倒しで追加したものだった。

編集ビュー（フォルダ作成・削除・リネーム・D&D並び替え。段階3 軸4a〜4e）が完成した時点で、`/favorite` モード内のこれら暫定機能（上下移動ボタン・削除アイコン・関連する確認モーダル）は**撤去済み**（`FavoriteListPanel.tsx`）。`/favorite` モードは当初の設計意図通り、`/recent` と同様に「見る・呼び出す・★解除のみ」の一覧に戻した。

`remove_favorite_folder`（削除確認モーダル `FavoriteFolderDeleteModal.tsx` 含む）は編集ビュー側の削除機能がそのまま再利用しているため存続する。一方 `move_favorite_node`（隣接スワップ専用の up/down 方式）は、編集ビューが D&D 専用の新規コマンド `move_favorite_node_to` を使うようになったことで呼び出し元が無くなったため、Rust コマンド自体も削除した（他に呼び出し箇所が無いことを確認済み）。

<a id="favorite-edit-virtual-root-row"></a>

### お気に入り編集ビューの仮想固定行（実装。内部識別子は `top`）

**仮想固定行の定義・目的・制約**（実体を持たない／リネーム・削除・★解除の対象外／絞り込み中も表示を維持／既存センチネル値 `FAVORITES_FOLDER_ID` を流用する方針／共有データを汚染しない方針）は、外部設計書 `external-design/03-data-model.md#favorite-edit-virtual-root-row` へ移設した。本節には実装上の対応と注意点のみを記す。

実装箇所は `FavoriteEditTree.tsx`／`useFavoriteEditSelection.ts`。

**⚠️ 表示名と内部識別子が一致していない**：実装時点（段階3・軸4f）では英語表記「Top」で仮実装し、`kind: "top"`／`FAVORITE_TOP_ROW_KEY`（`"favoriteTop"`）という内部識別子で管理していた。その後の手動GUIテストの指摘を受け、**表示文言のみ**を「お気に入り」へ変更した（コミット `65db645`）。**内部識別子（`kind: "top"`／`FAVORITE_TOP_ROW_KEY`／`useFavoriteEditSelection.ts` 内の `TOP_ROW` 変数名）はコード全体で変更していない。** この行に関わるコードを読む際は、表示上「お気に入り」でも内部的には `top` という名前で扱われている点に注意すること。表示名の変更に合わせてコード上の識別子名まで機械的に追従させる必要はない、という前例でもある。

**`resolveSelected` の `{type:"top"}` と自然に一致**：編集ビューの選択状態は [result-list-and-selection.md](result-list-and-selection.md#selection-is-derived) と同じ `resolveSelected` の実装をそのまま再利用している。`{type:"top"}` intent が常にインデックス0を返す既存仕様と、仮想固定行をツリー配列の先頭に合成する設計が一致したため、`resolveSelected` 自体の実装変更は不要だった。

**合成の実装**：`useFavoriteEditSelection.ts` が `FavoriteEditTreeRow[]` として `[仮想固定行, ...favoriteTree]` を都度合成する（`useSearch.ts` の共有 `favoriteTree` 自体は変更しない）。

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

> 外部設計相当の指針（予約フォルダの固定ID・Rust 側での二重バリデーション・同名フォルダ禁止の理由・メモ機能実装時の再利用判断）は、外部設計書 `external-design/03-data-model.md` へ移設した。以下には実装上の指針のみを残す。

- 予約フォルダの固定IDをRust側で変更する場合は、フロントエンド側の定数も必ず同時に更新する（型システムによる自動追従はない）
- 可視性判定（「このUI要素は表示されるか」）とバックエンドの除外・フィルタ条件は、同じブール式を1箇所にまとめて両方から参照する。片方だけ個別に再実装しない
- 新しい行の種類（★お気に入り・メモ等）を追加する場合、個別のオフセット変数は新設しない（詳細は [result-list-and-selection.md](result-list-and-selection.md#adding-a-row-kind) を参照）
- メモ機能でフォルダ分類（ツリー構造）を持たせる場合、再利用する実装は `is_descendant_of`／`groupNodesByParent`+`walkGroupedTree`／配置先選択 UI の3点（判断基準は外部設計書側を参照）
