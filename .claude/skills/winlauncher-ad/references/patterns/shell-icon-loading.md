# Shellアイコンの表示範囲優先取得

→ 詳細: [shell-icon-loading.md](../../../../../docs/internal-design/shell-icon-loading.md)

- 通常検索・ピン止め・お気に入り・`/recent` の4経路は候補（`icon: None`）だけを返す。Shellアイコン取得は`get_icons_for_paths`1箇所に統合済み。新しい画面を追加する場合も専用のアイコン取得コマンド・専用キャッシュ state を新設しない。 → 詳細: [shell-icon-loading.md](../../../../../docs/internal-design/shell-icon-loading.md#candidate-icon-separation)
- Shellアイコンは表示中の行＋直後`SHELL_ICON_LOOKAHEAD`（8）行だけを`useShellIconCache`／`useVisibleRangeIconFetch`で優先取得する。キャッシュはパスキーで画面横断共有してよい（`resolve_icon`の結果はパスのみに依存するため）。 → 詳細: [shell-icon-loading.md](../../../../../docs/internal-design/shell-icon-loading.md#visible-range-icon-fetch)
- `SHGetFileInfoW`の複数スレッド同時呼び出しの安全性は未検証。同時実行数を1より大きくする変更は、安全性を別途検証してから行う。 → 詳細: [shell-icon-loading.md](../../../../../docs/internal-design/shell-icon-loading.md#single-fetch-concurrency)
