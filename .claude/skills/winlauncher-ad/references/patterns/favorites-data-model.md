# ピン止め・お気に入り・メモのデータ構造

→ 詳細: [favorites-data-model.md](../../../../../docs/internal-design/favorites-data-model.md)

- `FavoriteNode` は `parentId` を持つフラットな配列（隣接リスト）で管理する。再帰的な木構造にせず、ノードの移動は1フィールドの更新で表現する。 → 詳細: [favorites-data-model.md](../../../../../docs/internal-design/favorites-data-model.md#favorite-node-structure)
- 予約フォルダ（ピン止め／お気に入り／メモ／メモのゴミ箱）は固定IDで参照する。Rust側の定数値を変更する場合、フロントエンド側の定数も必ず同時に更新する（型システムによる自動追従はない）。バリデーションはフロントエンドだけでなくRust側（保存直前）でも必ず行う。 → 詳細: [favorites-data-model.md](../../../../../docs/internal-design/favorites-data-model.md#reserved-folders)
- メモ本文は`MemoDocument`としてツリーとは別に保存し、フロントエンドからstoreへ直接書き込まない。保存はRustコマンドへ一本化し、`expectedRevision`で競合を検出する。お気に入り配列と本文マップを同時に扱う場合のロック順はFavoriteNodes → MemoDocumentsに固定する。 → 詳細: [favorites-data-model.md](../../../../../docs/internal-design/favorites-data-model.md#memo-document-persistence)
- メモ削除は通常ルートではゴミ箱への論理削除、ゴミ箱内では子孫本文を含む完全削除とする。予約ルート自身は移動・リネーム・削除・ドラッグ対象にしない。ゴミ箱内メモは閲覧可・編集不可という非対称要件のため、読み取り用（`is_readable_memo_node`）と書き込み用（`is_memo_node`）の判定関数を分離する。 → 詳細: [favorites-data-model.md](../../../../../docs/internal-design/favorites-data-model.md#memo-trash-lifecycle)
- お気に入り管理とメモ管理は`nodeTree`／`useTreeEditSelection`／入力部品に加え、キー伝播・drop位置・循環移動・移動先計算を`treeEditUtils`で共有する。固定行モデルと更新契約が異なるため、行描画・D&Dイベント・更新コマンド、および単一クリック／ダブルクリックの判別タイマーは、数値の慣習（約220ms）だけ揃えて専用実装を保ち、共有層へ機能固有条件を持ち込まない。 → 詳細: [favorites-data-model.md](../../../../../docs/internal-design/favorites-data-model.md#memo-edit-tree-boundary)
- 設定画面と往復してもコンポーネントがアンマウントされる管理画面では、絞り込み文字列・選択・作成/リネーム中状態を、その管理画面を呼び出す側（`App.tsx` レベルのstate、または `App.tsx` から呼ぶフック）で保持する。管理画面コンポーネント自身のローカルstateにすると、設定往復のたびに失われる。 → 詳細: [favorites-data-model.md](../../../../../docs/internal-design/favorites-data-model.md#screen-scoped-state-persistence)
- 可視性判定（「このUI要素は表示されるか」）とバックエンドの除外・フィルタ条件は、同じブール式を1箇所にまとめて両方から参照する。片方だけ個別に再実装しない。 → 詳細: [favorites-data-model.md](../../../../../docs/internal-design/favorites-data-model.md#search-exclusion)
- `dragDropEnabled: false` によりOSネイティブD&Dは無効化済み。HTML5 D&Dによる並び替えとOSからのファイルドロップ受け入れは現状の実装では二者択一の関係にある。 → 詳細: [favorites-data-model.md](../../../../../docs/internal-design/favorites-data-model.md#dnd-reordering)
- `/recent` 等の一覧に新しい行アクション（★・メモ等）を追加する場合、`recentMode` を理由にした除外分岐を新設しない。表示可否を切り替える必要がある場合は既存の合成フラグ（`pinnedVisible` のような「複数モードを包含した1つの真実」）を再利用する。 → 詳細: [favorites-data-model.md](../../../../../docs/internal-design/favorites-data-model.md#pinning-from-recent)
- ツリー構造を持つ一覧（お気に入り・メモ等）で「順序がおかしい」「意図した項目と違うものが選ばれる」報告を受けた場合、まずアルゴリズム（平坦化・ソート）自体を疑う前に、同名・同一表示内容のノードが複数存在してユーザーが取り違えていないかを確認する。 → 詳細: [favorites-data-model.md](../../../../../docs/internal-design/favorites-data-model.md#duplicate-folder-name-validation)
- `/favorite` モードに前倒し実装していた上下移動ボタン・フォルダ削除アイコンは、お気に入り管理画面の完成時に撤去済みである。一覧閲覧とツリー管理の責務を再び混在させない。 → 詳細: [favorites-data-model.md](../../../../../docs/internal-design/favorites-data-model.md#favorite-mode-provisional-features)
- 複数の予約ルートを1つのコマンドで扱う場合、単一ルートへの所属を先に要求しない。許可するルート集合への所属を検証してから、所属ルート別の処理を選ぶ。 → 詳細: [favorites-data-model.md](../../../../../docs/internal-design/favorites-data-model.md#multi-root-command-validation)
- 一覧の先頭に「ルート自体を表す」表示専用の仮想行を追加する設計は避ける。ルートに対する操作（新規フォルダ作成等）は、絞り込みバー常設アイコン＋行内アイコンの2系統に一本化し、実体を持たない特別な行を選択状態・intentの対象に含めない。 → 詳細: [favorites-data-model.md](../../../../../docs/internal-design/favorites-data-model.md#favorite-edit-virtual-root-row-removed)
