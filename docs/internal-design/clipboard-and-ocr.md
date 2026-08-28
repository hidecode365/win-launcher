# クリップボード履歴・OCR機能

対象コード: `src-tauri/src/main.rs`（`handle_clipboard_change`／`ocr_from_clipboard`／`ClipboardImageCache`）、`src/hooks/useClipboard.ts`／`useOcr.ts`、`src/components/ClipboardEditView.tsx`／`ClipboardEditFooter.tsx`／`ClipboardPanel.tsx`／`OcrEditView.tsx`／`OcrEditFooter.tsx`／`OcrPreview.tsx`／`ResizableSplitPane.tsx`。

どちらもクリップボードの画像を扱う点で実装上の関心が近いため1ファイルにまとめている。

## 現在の設計

<a id="clipboard-history"></a>

### クリップボード履歴（Rust / フロントエンド）

**「重量データ（クリップボード画像）を IPC に通さず Rust 側で完結させる」という方針とその理由**は、外部設計書 `external-design/04-platform-policies.md#heavy-data-ipc-policy` へ移設した。本節には実装の詳細のみを記す。

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

**呼び出し・画面構成（issue 0024でL1画面化）**：明示プレフィックスは「`/`（固定） + `appSettings.clipboardPrefix`（呼び出しキーワード。デフォルト `"cb"`）」の2部構成。検索ボックスの入力がこのプレフィックスに前方一致した時点（`hasPrefixMatch`。真偽値のみを返す。旧`clipboardModeFilter`は続く文字列の抽出も兼ねていたが役割を分離した）で、検索画面の子状態ではなく`App.tsx`の`view`が`"clipboardEdit"`へ即座に昇格し、専用コンポーネント`ClipboardEditView.tsx`（ヘッダー：戻るボタン＋ローカル絞り込み入力欄＋[SettingsButton](shared-ui-system.md#settings-button)、本体：`ClipboardPanel`、フッター：`ClipboardEditFooter.tsx`）へ遷移する。後続文字列は使用せず、画面上部のローカル絞り込み入力欄（`clipboardEditFilterText`。`useSearch.ts`内の独立した`useState`）は常に空から開始する。判定用の呼び出しクエリ（`search.query`）自体はL1滞在中変更せず凍結したまま維持する設計パターンの詳細は[window-lifecycle.md](window-lifecycle.md#prefix-mode-l1-promotion)を参照。画像エントリはテキストを持たないため、フィルタ文字列が空でない間は一覧から除外する。

- `set_clipboard_prefix(prefix)`（Rust コマンド）は保存時、`validate_unique_keyword(settings, "clipboard", trimmed)` を呼ぶ（詳細は [calc-and-prefix-commands.md](calc-and-prefix-commands.md#system-command-feature) を参照）
- Escapeはフォーカス位置に依存せず画面を閉じ通常の検索画面へ戻る（`App.tsx`のwindowレベルリスナー）。空のローカル絞り込み入力欄での無修飾Backspaceも同じ復帰を行う（[window-lifecycle.md](window-lifecycle.md#empty-filter-backspace-return)）

**一覧表示・確定クローズ**：左リストは新しい順。テキストは先頭数十文字、画像はサムネイルアイコン＋コピー日時を表示する。↑↓ で選択、Enter／クリックで選択中のエントリをクリップボードへ書き戻してウィンドウを閉じる（[window-lifecycle.md](window-lifecycle.md#close-window-common-design) の `closeWindow` を経由）。**確定クローズ時は`clearQuery`をプレフィックス保持ではなく既定（`"full"`）のまま使い、`closeWindow()`の`cleanup`内で`resetToSearchView`（[window-lifecycle.md](window-lifecycle.md#l1-confirm-close-view-reset)）を呼んで`view`も明示的に検索画面へ戻す**。これにより次回ウィンドウ表示時は必ず通常の検索画面から始まる（お気に入り・メモの「確定後も同じL1画面に留まる」既存挙動とは意図的に非対称。詳細は前掲の`window-lifecycle.md`アンカーを参照）。フォーカスアウトによる一時的な自動非表示は画面離脱ではないため、この`view`リセットは行わず、次回フォーカス回復時もクリップボード履歴画面を維持する。

- テキストの書き戻しは既存の `copy_to_clipboard`（Rust コマンド）を再利用する
- 画像の書き戻しは `paste_clipboard_image(id)` を呼ぶだけ。Rust 側は `ClipboardImageCache` から `id` に対応する PNG バイナリを取得し、`image::load_from_memory` で RGBA にデコードしたうえで Win32 API（`OpenClipboard` → `EmptyClipboard` → `SetClipboardData(CF_DIB, ...)` → `CloseClipboard`）を直接呼んでクリップボードへ書き込む（`GlobalAlloc`/`GlobalLock`/`GlobalUnlock` で確保した `GMEM_MOVEABLE` メモリに BITMAPINFOHEADER ＋ ボトムアップ BGRA ピクセル列を書き込み、`SetClipboardData` に渡す。渡したメモリの所有権は OS に移るため明示的な解放は行わない）

**分割線リサイズ**：実装は後述の共有 `ResizableSplitPane` を使用する。クリップボード固有なのは幅の保存責務だけで、幅確定時に `onWidthChange` を通じて App.tsx が `settings.json` の `"clipboardPaneWidth"` を即時保存する。フォーカスアウト（blur）時にも `clipboardPaneWidthRef` を使って同キーへ保存する。**`clipboardPaneWidthRef`（保存用）と `clipboardPaneWidth` state（ClipboardPanel への props 用）は必ず同時に更新する。ref のみ更新して state を更新しないと、パネル再マウント時に古い幅が渡されるバグになる**

**右パネル**：クリップボード履歴画面は常に左リストの右側に詳細パネルを表示する2カラムレイアウト（フォルダを持たないメモ画面相当の構成）。選択中のエントリがテキストなら本文（折り返し表示）とコピー日時・文字数、画像ならサムネイルとコピー日時・画像サイズを、いずれも読み取り専用で常時表示する。

**必要な権限**：`clipboard-manager:allow-read-text`（テキスト取得用。画像の読み書きは Rust 内部で直接呼ぶため JS 側のコマンド許可は不要）。

<a id="resizable-split-pane"></a>

### 左右ペインの共有リサイズ実装

`ClipboardPanel`／`OcrPreview`／`MemoPanel` は、左右ペインの骨格と分割線を `ResizableSplitPane` で共有する。各画面は `left`／`right` と初期幅、必要なら幅確定時の `onResizeEnd` だけを渡し、ドラッグ追従や境界線の見た目を再実装しない。

- 分割線は幅4px、左右borderと背景色を持ち、hover時に青く変化する。操作領域と視覚上の境界を同じ要素で表す
- `pointerdown` で開始し、documentレベルの `pointermove`／`pointerup`／`pointercancel` で追従・終了する。ドラッグ中はbodyのcursorと文字選択を抑止し、終了・アンマウントのどちらでも必ず復元する
- 左幅は150px以上・コンテナ幅の60%以下に丸める。`ResizeObserver` で親サイズ変更後も同じ制約へ戻す
- クリップボードは初期224pxで `clipboardPaneWidth`、メモは初期280pxで `memoPaneWidth` に確定幅を保存する。OCRは再表示時の幅を永続化しない
- `initialLeftWidth` は実装上**絶対px値**であり比率（%）ではない。真に「コンテナ幅の50%」等の比率で初期化したい場合、呼び出し側が事前にコンテナの実測幅を取得してからpx値へ換算して渡す必要がある（OCRの実装例は[ocr-feature](#ocr-feature)を参照。経緯は「経緯」節の[ocr-initial-width-not-proportional](#ocr-initial-width-not-proportional)を参照）

この共通化はレイアウト機構だけを対象とする。選択、本文、保存など各画面固有の状態は `ResizableSplitPane` に持ち込まない。

<a id="ocr-feature"></a>

### OCR機能（Rust / フロントエンド）

Windows OCR API（`Windows.Media.Ocr`）でクリップボード画像からテキストを抽出する。`tauri::async_runtime::spawn_blocking` で別スレッドに逃がし COM を初期化して実行。日本語言語パック優先・英語フォールバック。

- テキスト取得は `OcrLine.Words` を個別に取得し、直前と現在の単語が両方とも ASCII 英数字のみ（`chars().all(|c| c.is_ascii_alphanumeric())`）の場合のみスペースを挿入、それ以外はスペースなしで結合（CJK 文字への不要な空白挿入を防ぐ）
- 行のソートは先頭ワードの `BoundingRect.Y`（`Windows.Foundation.Rect`、`"Foundation"` feature 必要）を基準に昇順ソートしてから改行結合する
- 前処理（拡大・グレースケール化・コントラスト補正）は行わない。検証結果は「経緯」節を参照

**フロントエンド：L1画面としての構成（issue 0024。旧Fullscreen Overlayから再構成）**：`ocrActive`（`ocrLoading || ocrText !== null || ocrError !== null`）が真になると、検索画面の上に重ねるOverlayではなく`App.tsx`の`view`が`"ocrEdit"`へ即座に昇格し、専用コンポーネント`OcrEditView.tsx`へ遷移する（他のL1画面と同格。下層の検索画面は描画されない）。

- **ヘッダー**：他のL1画面（戻るボタン＋検索アイコン＋入力欄＋[SettingsButton](shared-ui-system.md#settings-button)）と同じ視覚パターンだが、`OcrEditView.tsx`独自の実装で組む（共有`SearchBox.tsx`コンポーネントには戻るボタンの差し込み口が無く、そこへ新設すると通常検索画面という「戻る」概念を持たない呼び出し元にまで影響するため）。入力欄は常に空文字・`readOnly`・`tabIndex={-1}`で、クリック・キー入力とも何も起こさない「検索欄と同じ形の非活性表示」。**「閉じる」はこのヘッダーの戻るボタンに配置し、検索画面へ戻る他画面の「戻る」操作と統一する**（400_テスト・バグ修正でPOの指摘を受け、`OcrPreview.tsx`側の独自ボタンから移設した）
- **本体（`OcrPreview.tsx`）**：`flex-1`でウィンドウ残高を占有する2ペイン（左：画像、右：ローディング/エラー/編集可能な結果テキスト）。結果表示時は、**「コピーして閉じる」ボタンをテキストエリアの直上**（メモ画面の右ペインが情報・操作行を本文textareaの直上に置くのと同じ構造。400_テスト・バグ修正でPOの指摘を受け下から上へ移設した）に配置し、テキストエリア自体は`flex-1 min-h-0 overflow-y-auto`で内部スクロール可能にする。`OcrPreview`自身は「閉じる」ボタンを持たない（`onCopyAndClose`のみを受け取る）
- <a id="ocr-initial-width-fix"></a>**初期分割幅の50:50**：`ResizableSplitPane`の`initialLeftWidth`は絶対px値であり比率ではないため（[resizable-split-pane](#resizable-split-pane)を参照）、`OcrPreview.tsx`はラッパー要素に`useLayoutEffect`を仕込み、マウント直後に実測したコンテナ幅の50%を`initialLeftWidth`として渡す。`useLayoutEffect`はブラウザの描画（paint）前に同期実行されるため、幅確定前の中間状態が見えることはない。新しい画像が貼り付けられるたびに`OcrEditView.tsx`側の`key={ocr.ocrRunId}`で`OcrPreview`自体が再マウントされ、実測・50%算出も再実行される（分割幅の非永続化という既存仕様は維持）
- 「閉じる」（`handleOcrClose`）：`ocr.clearOcr()`でOCR stateをリセットし、`view`を明示的に`"search"`へ戻したうえで、`requestAnimationFrame`経由で`inputRef.current?.focus()`を呼び検索ボックスへフォーカスを戻す（ウィンドウは隠さない）
- 「コピーして閉じる」（`handleOcrCopyAndClose`）：`copy_to_clipboard`をfire-and-forgetで発火 → 他のL1画面と同じ`search.closeWindow()`（[window-lifecycle.md](window-lifecycle.md#close-window-common-design)）を呼び、`cleanup`内で`ocr.clearOcr()`と`view`の`"search"`への明示リセットを行う。**OCR固有の180msフェードアウト演出は廃止済み**（400_テスト・バグ修正で撤去。経緯は[ocr-fade-removed](#ocr-fade-removed)を参照）
- Ctrl+Dは画面全体で常に無効（[window-lifecycle.md](window-lifecycle.md#local-query-clear-dispatch)の「画面全体でCtrl+Dを一律無効化する場合」を参照）。いずれの閉じ方でも`ocr.clearOcr()`と`view`のリセットを通るため、次回ウィンドウ表示時は必ず通常の検索画面から始まる

## 経緯

<a id="ocr-preprocessing-rejected"></a>

### 前処理による精度改善の検証結果（却下・見送り確定）

クリップボード画像に対する2〜3倍拡大＋グレースケール化＋コントラスト補正の前処理を追加すれば OCR 精度が上がるのではという仮説を、検証用テストバイナリ（`ocr_tune`。使い捨ての検証用コードでありリポジトリには残していない）を使って比較実験した。

- 結果：濁点/半濁点の誤認識、英数字の誤認識（`l` と `1` の混同等）は、どの前処理パターンでも改善しなかった。3倍拡大＋グレースケール＋コントラスト補正の組み合わせでは、パターンによっては素の状態より悪化する結果も観測された
- 原因：検証に使った画像の解像度は元々 Windows OCR エンジンにとって十分であり、誤認識は前処理不足ではなく Windows OCR エンジン自体の認識能力の限界に起因すると判明した
- 結論：前処理による精度改善は見送りとし、実装は前処理なし（クリップボード画像をそのまま `Windows.Media.Ocr` に渡す）の状態を維持する。今後の精度向上手段として現実的なのは PP-OCR 系モデルのオプトイン導入（任意ダウンロード方式）のみと判断している

<a id="ocr-initial-width-not-proportional"></a>

### OCR初期分割幅が真の50:50になっていなかった不具合

**症状**：issue 0024でOCRをL1画面へ再構成した際の実装（`OcrPreview.tsx`）は、新しい画像を貼り付けるたびに`ResizableSplitPane`へ`initialLeftWidth={320}`という固定px値を渡していた。PO確認で「毎回同じ比率にはなるが50:50ではない」と指摘された。

**直接原因**：`ResizableSplitPane`の`initialLeftWidth`は実装上絶対px値であり、比率（%）を意味しない（[resizable-split-pane](#resizable-split-pane)参照）。320pxは画面幅が変わっても常に同じ絶対値のため、ウィンドウ幅（ユーザーがリサイズ可能・`windowSize`として永続化される）次第で50:50からずれる。`key={ocr.ocrRunId}`による再マウントのおかげで「毎回同じ320px」にはなるが、それは「毎回そのウィンドウ幅における同じ比率」を意味しなかった。

**対応**：`OcrPreview.tsx`にラッパー要素を追加し、`useLayoutEffect`でマウント直後に実測したコンテナ幅の50%を`initialLeftWidth`として渡すよう変更した（詳細は[ocr-initial-width-fix](#ocr-initial-width-fix)を参照）。`useLayoutEffect`は描画（paint）前に同期実行されるため、幅確定前の中間状態が見えることはない。

**教訓**：`ResizableSplitPane`のような「初期値をpxで受け取るコンポーネント」に対して「コンテナ幅に対する比率」を実現したい場合、固定pxを渡すだけでは達成できない。呼び出し側で実測してから換算する必要がある。

<a id="ocr-fade-removed"></a>

### OCR固有のフェードアウト演出の廃止

issue 0024のL1再構成に伴い、「コピーして閉じる」が独自に持っていた180msのフェードアウト演出（`ocrClosing` state、`closeWindow()`を経由しない例外）を廃止し、他のL1画面と同じ`search.closeWindow()`経由のクローズに統一した。ウィンドウが可視のまま意図的に見せる演出という位置づけ自体が、OCRをFullscreen OverlayからL1画面へ位置づけ直したこと（下層の検索画面がもはや存在しない）と整合しなくなったための整理。

## 今後の指針

- クリップボード画像を扱う処理（クリップボード履歴・OCR）を新設・変更する場合、画像本体を JS 側へ渡さず Rust 側で完結させる既存方針（IPC 越しの重量データ転送を避ける）を踏襲する
- OCR 精度改善を再検討する際は、まず [ocr-preprocessing-rejected](#ocr-preprocessing-rejected) の検証結果を確認し、同じ前処理アプローチを再検証しない。改善が必要な場合は Windows OCR エンジン自体の限界を前提に、別モデルの導入を検討する
- ウィンドウを閉じる新しい演出（フェードアウト等）を追加する場合、`closeWindow()` の「隠れるまで state を変更しない」原則の例外にするかどうかを明確に判断し、例外にする場合はその理由をこのファイルのような形で明記する（OCR固有のフェードアウトは[ocr-fade-removed](#ocr-fade-removed)の通り既に廃止済みで、現時点で該当する例外は存在しない）
- `ResizableSplitPane`等、初期値をpx単位で受け取るコンポーネントに対して「コンテナ幅に対する比率」で初期化したい場合は、固定pxを渡さず呼び出し側で実測してから換算する（[ocr-initial-width-not-proportional](#ocr-initial-width-not-proportional)を参照）
