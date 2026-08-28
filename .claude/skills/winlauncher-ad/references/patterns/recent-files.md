# 最近使ったファイル一覧

→ 詳細: [recent-files.md](../../../../../docs/internal-design/recent-files.md)

- `/recent` はフォーカス復帰のたびに再取得する（プッシュ通知を持たないため、モード遷移時の1回きりの取得だと非表示中の変化が反映されない）。検索画面の子状態からL1画面へ昇格した後もこの機構は変更していない（判定用の呼び出しクエリを凍結したまま維持するパターンに乗せたため）。 → 詳細: [recent-files.md](../../../../../docs/internal-design/recent-files.md#recent-mode-and-fetch)
- `webSearchVisible`のような「クエリが非空なら成立する」形の判定式に、新設した"/" プレフィックスモードの除外を追加し忘れていないか確認する（`/recent`表示中に無意味なWeb検索行が選択可能になっていた実例）。 → 詳細: [recent-files.md](../../../../../docs/internal-design/recent-files.md#recent-web-search-exclusion-bug)
- OneDriveのURL→ローカルパス変換ロジックに手を入れる場合、`FullRemotePath`/`UrlNamespace` の使い分けとパーセントエンコーディングの正規化の両方を必ず踏まえる。個人OneDriveのテストだけではTeamsサイト・SharePoint固有の不具合を再現できない。 → 詳細: [recent-files.md](../../../../../docs/internal-design/recent-files.md#onedrive-double-folder-bug)
- 「軽い判定→重い処理」の順で処理できる項目（`.url`の表示対象設定等）は、軽い判定を先に行って対象外を早期リターンする最適化を検討する。 → 詳細: [recent-files.md](../../../../../docs/internal-design/recent-files.md#url-filter-order-optimization)
