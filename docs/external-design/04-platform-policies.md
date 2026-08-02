# 04 技術方針

外部設計書。**PO が承認すべき設計事項**のうち、プラットフォーム・依存ライブラリの選定方針など、プロジェクト全体に効く技術判断を扱う。

- 「何ができるか」（機能要件）は [REQUIREMENTS.md](../../REQUIREMENTS.md) を参照する
- 「どう作られているか」（実装パターン・コード上の規約）は [docs/internal-design/](../internal-design/) を参照する
- 本書の変更は 200_設計 工程で行い、PO 承認を得る（[WORKFLOW.md](../../WORKFLOW.md) を参照）

> **本ファイルは現時点では器のみである。** 内部設計書からの該当節の移設は次回作業で行う。器と中身を分けているのは、移設そのものを独立した差分として検証できるようにするため。

## 移設予定の節（次回作業の対象）

以下は移設候補として洗い出したものであり、**実際に移設するかどうかは移設作業時に節単位で再判断する**。

### `docs/internal-design/dependencies.md` から

- `#windows-api-first-policy` — サードパーティクレートより Windows 標準 API（Win32／WinRT／COM）を優先する方針
- `#dialog-plugin-parent-window` — `alwaysOnTop` ウィンドウとの重なりを避けるため、ダイアログ系プラグインは Rust 側の Tauri コマンドとして実装する方針

### `docs/internal-design/window-and-hotkey.md` から

- `#transparency-and-shadow` — 透過・角丸・シャドウの3点セットを常にセットで扱う方針
- `#resizing-and-size-persistence` — ウィンドウ位置は永続化せずサイズのみ永続化するという意図的な非対称

### `docs/internal-design/clipboard-and-ocr.md` から

- `#clipboard-history` の冒頭部 — クリップボード画像を IPC 越しに JS 側へ渡さず Rust 側で完結させる方針

### `docs/internal-design/calc-and-prefix-commands.md` から

- `#calc-feature` — 計算結果をファイル検索結果と排他にせず共存させる方針と、表示順序のルール
- `#prefix-command-candidates` — 新しい "/" プレフィックス機能の拡張ポイントの定義

### `docs/internal-design/path-paste.md` から

- `#paste-detection` — OS のクリップボードから実ファイルパス（`CF_HDROP`）を読む必要がある場合、Rust 側で直接読み直す方針
