# ファイル検索・frecency・検索フォルダ詳細設定

→ 詳細: [file-search-and-frecency.md](../../../../../docs/internal-design/file-search-and-frecency.md)

- 拡張子フィルタリングを持つ設定を新設する場合、ブラックリスト用・ホワイトリスト用は必ず独立フィールドとして持たせる（共有フィールドにしない。モード切替で入力内容が意図せず流用される事故を防ぐため）。 → 詳細: [file-search-and-frecency.md](../../../../../docs/internal-design/file-search-and-frecency.md#folder-detail-settings)
- frecencyスコアは `count * decay(lastUsed)`。この仕組み（decay係数・二次キー）はプレフィックスコマンド候補（`docs/internal-design/calc-and-prefix-commands.md`）でもキーを `path` から `keyword` に変えて再利用する。 → 詳細: [file-search-and-frecency.md](../../../../../docs/internal-design/file-search-and-frecency.md#frecency)
- ファイル起動は `ShellExecuteW` を直接呼ぶ（`cmd /C start` はコマンドインジェクションのリスクがあるため使わない）。 → 詳細: [file-search-and-frecency.md](../../../../../docs/internal-design/file-search-and-frecency.md#file-launch)
- 拡張子タグ編集 UI は `ExtensionFilterEditor.tsx` を再利用し、個別実装を増やさない。 → 詳細: [file-search-and-frecency.md](../../../../../docs/internal-design/file-search-and-frecency.md#extension-filter-editor-extraction)
