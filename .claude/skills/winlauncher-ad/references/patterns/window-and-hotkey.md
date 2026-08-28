# ウィンドウ・ホットキー

→ 詳細: [window-and-hotkey.md](../../../../../docs/internal-design/window-and-hotkey.md)

- ウィンドウは常に画面中央に表示し、位置は永続化しない。ウィンドウを表示するすべての箇所（グローバルホットキー／トレイ）で `show()` 直前に `window.center()` を呼ぶ。 → 詳細: [window-and-hotkey.md](../../../../../docs/internal-design/window-and-hotkey.md#frameless-and-centering)
- 透過・角丸・シャドウ（`backgroundColor` alpha 0／DOM側 `background: transparent`／`tauri.conf.json` の `shadow: false`）の3点セットは個別に変更せず、常にセットで扱う。1つだけ変更すると角のアーティファクトが再発する。 → 詳細: [window-and-hotkey.md](../../../../../docs/internal-design/window-and-hotkey.md#transparency-and-shadow)
- 新しいドラッグ可能領域を追加する場合は必ず `data-tauri-drag-region="deep"` を使う（値なしの bare 指定は子要素で発火しないため避ける）。 → 詳細: [window-and-hotkey.md](../../../../../docs/internal-design/window-and-hotkey.md#basic-window-config)
- ウィンドウの位置は永続化しないが、サイズは永続化する（この非対称は意図的な仕様であり矛盾ではない）。 → 詳細: [window-and-hotkey.md](../../../../../docs/internal-design/window-and-hotkey.md#resizing-and-size-persistence)
- ホットキー変更（`set_hotkey`）は unregister → register の順で行い、新ホットキーの register が失敗したら旧ホットキーを再登録して維持する。フロントエンドはライブキーキャプチャを行わず、修飾キーのチェックボックス＋通常キーのプルダウンからアクセラレータ文字列を直接組み立てる。 → 詳細: [window-and-hotkey.md](../../../../../docs/internal-design/window-and-hotkey.md#hotkey-registration)
