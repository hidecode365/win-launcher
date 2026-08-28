# クリップボード履歴・OCR

→ 詳細: [clipboard-and-ocr.md](../../../../../docs/internal-design/clipboard-and-ocr.md)

- クリップボード画像を扱う処理は画像本体を JS 側へ渡さず Rust 側で完結させる（IPC 越しの重量データ転送を避ける）。 → 詳細: [clipboard-and-ocr.md](../../../../../docs/internal-design/clipboard-and-ocr.md#clipboard-history)
- `clipboardPaneWidthRef`（mouseup用）と `clipboardPaneWidth` state（props用）は必ず同時に更新する。ref のみ更新すると、パネル再マウント時に古い幅が渡されるバグになる。 → 詳細: [clipboard-and-ocr.md](../../../../../docs/internal-design/clipboard-and-ocr.md#clipboard-history)
- 左右ペインは共有`ResizableSplitPane`を使い、分割線の見た目・pointer操作・幅制約・親リサイズ追従を画面側で再実装しない。各画面は内容と幅の永続化要否だけを持つ。 → 詳細: [clipboard-and-ocr.md](../../../../../docs/internal-design/clipboard-and-ocr.md#resizable-split-pane)
- OCR画面のヘッダーは共有`SearchBox`を流用せず専用実装にする（戻るボタンの差し込み口が無いため）。「閉じる」はヘッダーの戻るボタン、「コピーして閉じる」は本文直上の情報・操作行に配置し、メモ画面と同じ配置パターンに揃える。 → 詳細: [clipboard-and-ocr.md](../../../../../docs/internal-design/clipboard-and-ocr.md#ocr-feature)
- OCR前処理（拡大・グレースケール化・コントラスト補正）による精度改善は検証済みで却下・見送り確定。同じアプローチを再検証しない。改善が必要な場合はWindows OCRエンジン自体の限界を前提に別モデルの導入を検討する。 → 詳細: [clipboard-and-ocr.md](../../../../../docs/internal-design/clipboard-and-ocr.md#ocr-preprocessing-rejected)
- `ResizableSplitPane`の`initialLeftWidth`は絶対px値であり比率ではない。コンテナ幅に対する比率（50%等）で初期化したい場合、固定pxを渡さず呼び出し側で実測してから換算する。 → 詳細: [clipboard-and-ocr.md](../../../../../docs/internal-design/clipboard-and-ocr.md#ocr-initial-width-not-proportional)
- ウィンドウを閉じる新しい演出（フェードアウト等）を追加する場合、`closeWindow()` の「隠れるまで state を変更しない」原則の例外にするかどうかを明確に判断し、例外にする場合は理由を明記する。OCR固有のフェードアウトはissue 0024で廃止済みで、現時点で該当する例外は無い。 → 詳細: [clipboard-and-ocr.md](../../../../../docs/internal-design/clipboard-and-ocr.md#ocr-fade-removed)
