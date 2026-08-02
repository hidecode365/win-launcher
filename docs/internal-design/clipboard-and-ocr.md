# クリップボード履歴・OCR機能

対象コード: `src-tauri/src/main.rs`（`handle_clipboard_change`／`ocr_from_clipboard`／`ClipboardImageCache`）、`src/hooks/useClipboard.ts`／`useOcr.ts`、`src/components/ClipboardPanel.tsx`／`OcrPreview.tsx`。

どちらもクリップボードの画像を扱う点で実装上の関心が近いため1ファイルにまとめている。

## 現在の設計

<a id="clipboard-history"></a>

### クリップボード履歴（Rust / フロントエンド）

**「重量データ（クリップボード画像）を IPC に通さず Rust 側で完結させる」という方針とその理由**は、外部設計書 [04-platform-policies.md#heavy-data-ipc-policy](../external-design/04-platform-policies.md#heavy-data-ipc-policy) へ移設した。本節には実装の詳細のみを記す。

**検出（Rust）**：メインウィンドウの HWND を `SetWindowSubclass`（`windows-rs` の `Win32_UI_Shell`）でサブクラス化し、`AddClipboardFormatListener`（`Win32_System_DataExchange` feature）でクリップボード変更通知の受信者として登録する。

- ウィンドウが `hide()` で非表示の間もメッセージループは稼働しているため、バックグラウンドでも `WM_CLIPBOARDUPDATE` を受信できる
- サブクラスプロシージャは `WM_CLIPBOARDUPDATE` を受信すると、即座に `std::thread::spawn` で別スレッドへ処理を逃がし、ウィンドウのメッセージループ（メインスレッド）をブロックしない
- `extern "system"` のサブクラスプロシージャはクロージャで `AppHandle` を捕捉できないため、`static APP_HANDLE: OnceLock<AppHandle>` を `setup()` で一度だけ設定し、プロシージャ内ではそこから取得して spawn したスレッドに `clone()` で渡す

**画像の取得・キャッシュ（Rust、`handle_clipboard_change` 関数。spawn したスレッド上で実行）**：

- `appSettings.clipboardEnabled` が `false` の場合は何もせず即 return する
- `app.clipboard().read_image()`（`tauri-plugin-clipboard-manager` の Rust API。`arboard` 経由でクリップボードの画像を直接読む。JS の `readImage()` 経由ではなく Rust から直接呼ぶため、画像データが IPC を一度も通過しない）が成功した場合のみ画像として処理する
- 取得した RGBA を `image` クレートで PNG にエンコードし、そのバイナリをアプリ内メモリのキャッシュ（`ClipboardImageCache`。`tauri::State` で管理する `Mutex<HashMap<id, Vec<u8>>>` ＋挿入順管理用 `VecDeque<id>`）にユニーク ID をキーとして保存する
- 同時に `image::imageops::resize`（幅 320px 以下、高さはアスペクト比維持）でサムネイルを生成し、PNG → Base64 化した `data:image/png;base64,...` 文字列を作る
- フロントエンドへは `"clipboard-changed"` イベントで `{ type: "image", id, thumbnailDataUrl, width, height, timestamp }` のみを emit する。画像本体（PNG バイナリ・RGBA）は一切 JS 側へ渡さない
- `read_image()` が失敗した場合（クリップボードに画像形式がない）は `{ type: "text" }` を emit するだけで終える。テキストの実際の取得は従来通りフロントエンドの責務とする
- キャッシュは `appSettings.clipboardMaxItems` を超えたら挿入順の古いものから削除する（`VecDeque` の先頭から `pop_front` し、対応する `HashMap` エントリも削除）

**テキストの取得・記録（フロントエンド）**：`"clipboard-changed"` イベントの payload が `{ type: "text" }` の場合のみ `@tauri-apps/plugin-clipboard-manager` の `readText()` を呼び、成功したらテキストエントリとして記録する。

- `appSettings.clipboardEnabled` が `false` の間は payload の種類に関わらず無視する（記録しない）。ネイティブの監視（`AddClipboardFormatListener`）自体は ON/OFF に関わらず常時有効のままにし、Rust 側を動的に着脱しない
- テキストエントリ：`{ type: "text", id, text, timestamp }`（`id` はフロントエンドで生成するランダム文字列）
- 画像エントリ：`{ type: "image", id, thumbnailDataUrl, width, height, timestamp }`。`id` は Rust 側のキャッシュキーをそのまま使う
- 重複排除：テキストは文字列の完全一致、画像は受信した `thumbnailDataUrl` の完全一致で既存エントリを検出し、見つかった場合は既存エントリを削除してから最新の内容として先頭に再挿入する
- 最大件数（`appSettings.clipboardMaxItems`、デフォルト `50`）を超えた古いエントリは配列末尾から削除する

**永続化**：テキストエントリのみ `@tauri-apps/plugin-store` の JS API で `settings.json` の `"clipboardHistory"` キーへ永続化する（frecency と同じ方式。Rust コマンドは追加しない）。画像エントリ（サムネイルや ID）は永続化対象外（メモリ上のみ。アプリ再起動で失われる）。

**呼び出し（モード切替）**：明示プレフィックスは「`/`（固定） + `appSettings.clipboardPrefix`（呼び出しキーワード。デフォルト `"cb"`）」の2部構成。検索クエリが `/` + `clipboardPrefix`（大小文字区別なし）に前方一致する場合にクリップボード履歴モードへ切り替える（`clipboardModeFilter`）。画像エントリはテキストを持たないため、フィルタ文字列が空でない間は一覧から除外する。

- `set_clipboard_prefix(prefix)`（Rust コマンド）は保存時、`validate_unique_keyword(settings, "clipboard", trimmed)` を呼ぶ（詳細は [calc-and-prefix-commands.md](calc-and-prefix-commands.md#system-command-feature) を参照）

**一覧表示**：左リストは新しい順。テキストは先頭数十文字、画像はサムネイルアイコン＋コピー日時を表示する。↑↓ で選択、Enter／クリックで選択中のエントリをクリップボードへ書き戻してウィンドウを閉じる（[window-lifecycle.md](window-lifecycle.md#close-window-common-design) の `closeWindow` を経由）。

- テキストの書き戻しは既存の `copy_to_clipboard`（Rust コマンド）を再利用する
- 画像の書き戻しは `paste_clipboard_image(id)` を呼ぶだけ。Rust 側は `ClipboardImageCache` から `id` に対応する PNG バイナリを取得し、`image::load_from_memory` で RGBA にデコードしたうえで Win32 API（`OpenClipboard` → `EmptyClipboard` → `SetClipboardData(CF_DIB, ...)` → `CloseClipboard`）を直接呼んでクリップボードへ書き込む（`GlobalAlloc`/`GlobalLock`/`GlobalUnlock` で確保した `GMEM_MOVEABLE` メモリに BITMAPINFOHEADER ＋ ボトムアップ BGRA ピクセル列を書き込み、`SetClipboardData` に渡す。渡したメモリの所有権は OS に移るため明示的な解放は行わない）

**分割線リサイズ**：`ClipboardPanel` コンポーネントが左右ペイン間に分割線要素（幅 4px）を描画し、`onMouseDown` でドラッグ開始を検出する。

- 左ペイン幅を `useState` でコンポーネント内部管理し、`initialLeftWidth` props（App.tsx が store から読み込んで渡す）で初期値を設定する（デフォルト 224px）
- ドラッグ中は `document` レベルの `mousemove`/`mouseup` を `useEffect` で登録して追従し、`useEffect` のクリーンアップで解除する。`isDragging`（ref）と `leftWidthRef`（現在幅を mouseup コールバックに伝えるための ref）の 2 本を使って実装する
- 左ペインの最小幅 150px、最大幅はパネル全体の 60%
- 幅確定（mouseup）時に `onWidthChange` コールバックを呼び、App.tsx が `settings.json` の `"clipboardPaneWidth"` を即時保存する。フォーカスアウト（blur）時にも `clipboardPaneWidthRef` を使って同キーへ保存する。**`clipboardPaneWidthRef`（mouseup コールバック用）と `clipboardPaneWidth` state（ClipboardPanel への props 用）は必ず同時に更新する。ref のみ更新して state を更新しないと、パネル再マウント時に古い幅が渡されるバグになる**

**右パネル**：クリップボード履歴モードのときのみ、左リストの右側に詳細パネルを表示する2カラムレイアウトに切り替える。選択中のエントリがテキストなら本文（折り返し表示）とコピー日時・文字数、画像ならサムネイルとコピー日時・画像サイズを表示する。

**必要な権限**：`clipboard-manager:allow-read-text`（テキスト取得用。画像の読み書きは Rust 内部で直接呼ぶため JS 側のコマンド許可は不要）。

<a id="ocr-feature"></a>

### OCR機能（Rust / フロントエンド）

Windows OCR API（`Windows.Media.Ocr`）でクリップボード画像からテキストを抽出する。`tauri::async_runtime::spawn_blocking` で別スレッドに逃がし COM を初期化して実行。日本語言語パック優先・英語フォールバック。

- テキスト取得は `OcrLine.Words` を個別に取得し、直前と現在の単語が両方とも ASCII 英数字のみ（`chars().all(|c| c.is_ascii_alphanumeric())`）の場合のみスペースを挿入、それ以外はスペースなしで結合（CJK 文字への不要な空白挿入を防ぐ）
- 行のソートは先頭ワードの `BoundingRect.Y`（`Windows.Foundation.Rect`、`"Foundation"` feature 必要）を基準に昇順ソートしてから改行結合する
- 前処理（拡大・グレースケール化・コントラスト補正）は行わない。検証結果は「経緯」節を参照

**フロントエンド（`App.tsx`）**：OCR プレビュー表示中（`ocrLoading || ocrText !== null || ocrError !== null`）は検索結果エリア（`ResultList` / `ClipboardPanel`）と `StatusFooter` を非表示にする。検索ロジック自体は動作し続け、クエリや内部 state には影響しない。

- `OcrPreview` は `flex-1` でウィンドウ残高を占有する。テキスト表示時はテキストエリアを `flex-1 min-h-0 overflow-y-auto` にして内部スクロール可能にし、ボタン行は `flex-shrink-0` で下端に固定する
- `OcrPreview` の「閉じる」「コピーして閉じる」ボタンはそれぞれ独立したコールバック（`onClose` / `onCopyAndClose`）を `App.tsx` から受け取り、ボタン内部では invoke やウィンドウ制御を行わない（表示専用コンポーネントの原則を維持するため）
  - 「閉じる」（`handleOcrClose`）：`ocr.clearOcr()` で OCR state をリセットしたうえで、`requestAnimationFrame` 経由で `inputRef.current?.focus()` を呼び検索ボックスへフォーカスを戻す
  - 「コピーして閉じる」（`handleOcrCopyAndClose`）：`copy_to_clipboard` invoke → ルートコンテナに `ocrClosing` state で opacity 0 へのフェードアウト（Tailwind `transition-opacity duration-[180ms]`）を適用 → 180ms 待機後に `hideWindow()` → `ocrClosing` を戻しつつ `ocr.clearOcr()` で state をリセットする。**これは [window-lifecycle.md](window-lifecycle.md#close-window-common-design) の `closeWindow()` を経由しない唯一の例外**（ウィンドウが可視のまま意図的に見せる演出であり、「隠れるまで state を変更しない」という `closeWindow()` の原則とは目的が異なるため）。ホットキー再表示やフォーカスアウトによる非表示にはこのフェードは適用しない（既存の即時 `hide()` のまま）
  - いずれの経路でも `ocr.clearOcr()` を通るため、次回ウィンドウ表示時は `ocrActive` が `false`（通常の検索画面）に戻っている

## 経緯

<a id="ocr-preprocessing-rejected"></a>

### 前処理による精度改善の検証結果（却下・見送り確定）

クリップボード画像に対する2〜3倍拡大＋グレースケール化＋コントラスト補正の前処理を追加すれば OCR 精度が上がるのではという仮説を、検証用テストバイナリ（`ocr_tune`。使い捨ての検証用コードでありリポジトリには残していない）を使って比較実験した。

- 結果：濁点/半濁点の誤認識、英数字の誤認識（`l` と `1` の混同等）は、どの前処理パターンでも改善しなかった。3倍拡大＋グレースケール＋コントラスト補正の組み合わせでは、パターンによっては素の状態より悪化する結果も観測された
- 原因：検証に使った画像の解像度は元々 Windows OCR エンジンにとって十分であり、誤認識は前処理不足ではなく Windows OCR エンジン自体の認識能力の限界に起因すると判明した
- 結論：前処理による精度改善は見送りとし、実装は前処理なし（クリップボード画像をそのまま `Windows.Media.Ocr` に渡す）の状態を維持する。今後の精度向上手段として現実的なのは PP-OCR 系モデルのオプトイン導入（任意ダウンロード方式）のみと判断している

## 今後の指針

- クリップボード画像を扱う処理（クリップボード履歴・OCR）を新設・変更する場合、画像本体を JS 側へ渡さず Rust 側で完結させる既存方針（IPC 越しの重量データ転送を避ける）を踏襲する
- OCR 精度改善を再検討する際は、まず [ocr-preprocessing-rejected](#ocr-preprocessing-rejected) の検証結果を確認し、同じ前処理アプローチを再検証しない。改善が必要な場合は Windows OCR エンジン自体の限界を前提に、別モデルの導入を検討する
- ウィンドウを閉じる新しい演出（フェードアウト等）を追加する場合、`closeWindow()` の「隠れるまで state を変更しない」原則の例外にするかどうかを明確に判断し、例外にする場合はその理由をこのファイルのような形で明記する
