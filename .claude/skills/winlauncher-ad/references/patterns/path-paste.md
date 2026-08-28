# パス貼り付けによる検索フォルダ管理

→ 詳細: [path-paste.md](../../../../../docs/internal-design/path-paste.md)

- OSのクリップボードから実ファイルパス（CF_HDROP）を読む必要が生じた場合、WebView2の `clipboardData` 経由では取得できないことを前提に、Rust側で直接クリップボードを読み直す設計にする。 → 詳細: [path-paste.md](../../../../../docs/internal-design/path-paste.md#paste-detection)
- パス貼り付け候補に新しい操作を追加する場合は、通常モードの `ResultRow` に行種別として統合し、独立した選択state・オフセット計算・別のアイコンアセットを新設しない。候補の状態アイコンは既存の `PinIcon`／`FavoriteIcon` 等を再利用し、輪郭／塗りつぶしで状態を表す。 → 詳細: [path-paste.md](../../../../../docs/internal-design/path-paste.md#paste-action-rows)
- パス貼り付け候補で1操作を確定する経路は、`closeWindow()` の `cleanup` 内で非同期書き込みを開始する。候補表示とは別ドメインの `pathPasteWizardMode` は、表示中に非同期一覧差し替えを行わない限り生インデックス選択を維持する。 → 詳細: [path-paste.md](../../../../../docs/internal-design/path-paste.md#paste-action-close-order)
- 1つの共有コマンドを、完了フィードバック（トースト通知等）の要否が異なる複数の呼び出し元から使う場合、作成・実行処理そのものを呼び出し元ごとに複製せず、コマンドへ `notify: bool` のような1パラメータを追加して入口側で使い分ける。 → 詳細: [path-paste.md](../../../../../docs/internal-design/path-paste.md#entry-point-notify-flag)
- 複数ステップのウィザード形式インタラクションを追加する場合、キー操作は window レベルのリスナーに一本化し、個別ステップのローカル `onKeyDown` を併存させない（二重ハンドラによるリグレッションの再発を防ぐため）。 → 詳細: [path-paste.md](../../../../../docs/internal-design/path-paste.md#wizard-keydown-unification-history)
- Windowsのファイルシステム／シェル関連の機能でサードパーティクレートに不具合が疑われた場合、まず本プロジェクトが一貫して採る「Windows標準API直接呼び出し」への切り替えを検討する。 → 詳細: [path-paste.md](../../../../../docs/internal-design/path-paste.md#mslnk-to-shell-link-history)
