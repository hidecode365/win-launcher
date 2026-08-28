# 共有UI・デザインシステム

→ 詳細: [shared-ui-system.md](../../../../../docs/internal-design/shared-ui-system.md)

- 新しいUIは、共有コンポーネント → 共有スタイル／semantic token → 新しい共有定義、の順で検討し、画面固有のraw値を先に追加しない。 → 詳細: [shared-ui-system.md](../../../../../docs/internal-design/shared-ui-system.md#shared-ui-entry-point)
- 複数画面で同じ意味を持つ色・spacing・文字階層だけを`tailwind.config.js`の`ui-*` tokenへ追加し、単一画面の例外値まで網羅的にtoken化しない。 → 詳細: [shared-ui-system.md](../../../../../docs/internal-design/shared-ui-system.md#semantic-tokens)
- お気に入り画面・メモ画面（統合後は管理画面ベースの単一画面）の固定行／フォルダ行／内容行は、`manageTreeRowClass`と`MANAGE_TREE_ROW_LABEL`を使い、片方だけraw classで上書きしない。 → 詳細: [shared-ui-system.md](../../../../../docs/internal-design/shared-ui-system.md#manage-tree-row-variants)
- インラインリネームのEnter／Escは共有`RenameInput`内で完結させる。IME変換中のEnterも伝播は止め、window capture側の除外はReact stateではなく実際の入力DOMを判定する。 → 詳細: [shared-ui-system.md](../../../../../docs/internal-design/shared-ui-system.md#memo-inline-rename)
- 作業を確定する主要ボタンと、それに並ぶ低優先度の補助ボタンは`ActionButton`のsemantic variantを使い、配置密度と固定heightの違いはsizeで表す。画面側で独自のheight・padding・outlineを追加しない。 → 詳細: [shared-ui-system.md](../../../../../docs/internal-design/shared-ui-system.md#action-button)
- 本文textareaは挙動を無理に共通化せず、`EDITOR_SURFACE_CLASS`で表面だけを共有する。 → 詳細: [shared-ui-system.md](../../../../../docs/internal-design/shared-ui-system.md#editor-surface)
- 各L1画面のヘッダーで設定を開くボタンを追加する場合、共有コンポーネント`SettingsButton`をそのまま使い、個別にSVGを複製しない。 → 詳細: [shared-ui-system.md](../../../../../docs/internal-design/shared-ui-system.md#settings-button)
