# パス貼り付けによる検索フォルダ管理

対象コード: `src-tauri/src/path_paste.rs`（`read_pasted_hdrop_path`／`judge_pasted_path`／`write_shortcut_file`）、`src/hooks/useSearch.ts`（`detectPastedPath`／`wizardStep`）、`src/components/PathPasteWizard.tsx`。

Explorer でファイル/フォルダをコピー（Ctrl+C）した状態で検索ボックスに貼り付ける（Ctrl+V）と、数式計算・URLエンコード/デコードと同じ「暗黙判定」方式で、検索フォルダへの追加（機能1・フォルダ限定）／検索フォルダへのショートカット配置（機能2・フォルダ/ファイル両方）を行える。詳細な表示順序・共存/排他関係は REQUIREMENTS.md の同名節・[外部設計書「モード共存・排他一覧」](../external-design/01-screen-transitions.md#mode-coexistence-table)を参照。

## 現在の設計

<a id="paste-detection"></a>

### 貼り付け判定（Rust、`path_paste.rs`）

CF_HDROP の確認と、パスの実在判定（テキスト解釈）は、別々の2つのコマンド・別々のタイミングで行う1経路に統一している（統一前の経緯は「経緯」節を参照）。

- `SearchBox.tsx` の `onPaste` は画像ペースト（OCR）以外のすべての貼り付けで `onPathPaste`（`detectPastedPath`）を呼ぶ。画像判定と異なり `e.preventDefault()` はしない（通常のテキスト貼り付け動作を妨げない）
  - CF_HDROP はブラウザ／WebView2 の `clipboardData` に実ファイルパスとして現れない（`items`/`getData` 経由では取得できない）ため、確認は常に Rust 側（`read_pasted_hdrop_path` コマンド）で実クリップボードを直接読み直す方式にしている
- `read_pasted_hdrop_path`（Rust）：`clipboard-win` クレート（`Clipboard::new_attempts` でクリップボードを開き、`formats::FileList` の `Getter::read_clipboard` で読む）で `CF_HDROP` の有無のみを確認する。パスが単一の場合はそのパス文字列をそのまま返し（クォート等の加工はしない）、複数パスの場合・`CF_HDROP` 自体が存在しない場合はいずれも `None` を返す。実在確認・フォルダ/ファイル判定はここでは行わない
  - `clipboard-win` は既存のクリップボード履歴機能（`tauri-plugin-clipboard-manager` が内部で使う `arboard` の間接依存）として既に依存関係ツリーに含まれていたクレートを、`Cargo.toml` に直接依存として追加して使う
- フロントエンド（`detectPastedPath`）：`read_pasted_hdrop_path` が `Some(path)` を返した場合のみ `setQuery(path)` で検索ボックスへそのまま流し込む（複数パス・CF_HDROP なしの場合は何もしない＝ OS 標準の Ctrl+V にそのまま委ねる）
- `judge_pasted_path`（Rust）：検索ボックスの文字列（上記の流し込み・通常のテキスト貼り付け・手入力のいずれも区別しない）を受け取り、`parse_text_path`（前後のダブルクォートのみを取り除く）→ `Path::exists()`/`Path::is_dir()` で実在確認・フォルダ/ファイル判定、の順に処理する（実在しない場合は `None`）
  - メインの検索 `useEffect`（`query` 変更のたび発火）から `calculate`/`search_files` と同様に毎回呼ぶ。呼び出し自体はフロントエンド側の `appSettings.pathPasteEnabled` で制御するため、この Rust コマンド自体は設定値を確認しない（`read_pasted_hdrop_path` は貼り付けイベント起点のため Rust 側でも `path_paste_enabled` を確認する。2つのコマンドでこの点が異なるのは、呼び出しの起点（イベント駆動 vs. クエリ変更のたび）が異なるため）
  - `pathPasteCandidate` は `query` から直接導出される値であり、貼り付け時点の `query` を記録する鏡 ref は不要（CF_HDROP 経由の貼り付けも検索ボックスの `query` を経由するため、候補と `query` が構造的に常に同期する）

`appSettings.pathPasteEnabled`（デフォルト `true`）が `false` の場合、判定自体を行わない（`set_path_paste_enabled` コマンド）。

<a id="feature1-add-folder"></a>

### 機能1: 検索フォルダとして追加（Rust、`add_search_folder_from_paste` コマンド）

判定したパスがフォルダの場合のみ候補行に表示する。Enter／クリックで確定すると `closeWindow()`（[window-lifecycle.md](window-lifecycle.md#close-window-common-design) を参照）経由で実行する。

既存の検索フォルダ一覧に同じパスが既に存在する場合は追加処理をスキップし、トースト通知「既に登録済みです」を表示する（エラー扱いにはしない）。新規追加時は「検索フォルダに追加しました: `<フォルダ名>`」を表示する。

<a id="feature2-shortcut"></a>

### 機能2: 検索フォルダにショートカットとして追加（Rust / フロントエンド）

判定したパスがフォルダ・ファイルいずれの場合も候補行に表示する。Enter／クリックで、3ステップのミニウィザード（`useSearch.ts` の `wizardStep`: `"idle"` → `"folderSelect"` → `"nameEdit"`、`PathPasteWizard.tsx` が `"folderSelect"`/`"nameEdit"` の描画を担当）に遷移する。これは既存の暗黙判定・プレフィックスコマンドが採る「Enter一発で確定」パターンとは異なる新しいインタラクションパターン。

- `"folderSelect"`：`get_folders` で登録済み検索フォルダ一覧を取得し、プレフィックスコマンド候補と同様のリストUIで選択させる
- `"nameEdit"`：選択したフォルダを配置先として、デフォルト値が元のファイル/フォルダ名の編集可能な名前入力欄（`PathPasteWizard.tsx` 内の専用 `<input>`。メインの検索ボックスはウィザード中 `readOnly` になるため、マウント時に明示的に `focus()` する）を表示する

ウィザード進行中（`wizardStep !== "idle"`）は `pathPasteWizardMode` として公開され、ファイル検索・数式計算・URLエンコード/デコード・プレフィックスコマンド候補と排他になる（メインの検索効果（`useEffect`）は早期 return し、`search_files`/`calculate` を呼ばない）。

**ウィザード中のキー操作（↑↓・Enter・Escape）は、`"folderSelect"`／`"nameEdit"` いずれのステップも `App.tsx` の window レベル `keydown` リスナー（Ctrl+S/Ctrl+D と同じもの）が一括して処理する。`SearchBox`・各ステップの入力要素側にはローカルの `onKeyDown` を持たせない**（経緯は「経緯」節を参照）。

Escape は `wizardBack()` でステップを1つ戻す（名前編集→フォルダ選択、フォルダ選択→候補行表示 or 通常のファイル検索結果表示）。これは Esc＝ウィンドウ非表示という基本挙動の例外。

保存（ステップ3の Enter）も `closeWindow()` 経由で実行し、`.lnk` ファイルの作成自体（`create_shortcut` コマンド）は非表示解決後に裏で行う。

- `.lnk` の作成には Windows COM の `IShellLinkW`／`IPersistFile` インターフェースを `windows-rs` 経由で直接呼び出す（`path_paste::write_shortcut_file`）。読み取り専用の `lnk` クレート（[recent-files.md](recent-files.md) でリンク先解決に使用）とは書き込み/読み取りで役割が異なる別物であり、置き換えではない
  - 実装：`CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER)` で `IShellLinkW` を生成し、`SetPath`（リンク先）・`SetWorkingDirectory`（対象の親フォルダ）を設定した後、`.cast::<IPersistFile>()` で `IPersistFile` を取得して `Save(lnk_path, true)` で書き出す。`CoInitializeEx(None, COINIT_MULTITHREADED)` の RAII ラッパー（`ComInit`）は `ocr` モジュールの同名パターンと同じ考え方だが、モジュールが異なるため個別に定義している
- 同名の `.lnk` が既に存在する場合は Explorer 標準の挙動に倣い「名前 (2)」のように連番を付与する（`path_paste::unique_lnk_name`。上書きしない）
- 保存成功時、トースト通知「ショートカットを配置しました: `<名前>`」を表示する

<a id="toast-notification"></a>

### トースト通知（Rust、`show_toast` 関数）

Windows のトースト通知には `tauri-plugin-notification`（Tauri 公式プラグイン）を使う。サーバーレス・無料方針に合致し、`AppHandle` の `NotificationExt` トレイト経由でアプリ内から直接呼び出せるため、外部サービス連携や追加のランタイム依存なしに導入できる標準的な選択肢として採用した。

`show_toast(app, message)` が `app.notification().builder().title("WinLauncher").body(message).show()` を呼ぶだけの薄いヘルパー。失敗（通知権限なし等）は無視する（トーストはあくまで補助的なフィードバックであり、失敗してもフォルダ追加・ショートカット作成自体は成功しているため）。`capabilities/default.json` に `notification:default` permission が必要。

<a id="path-paste-candidate-and-recent-mode"></a>

### `pathPasteCandidate` と `recentMode` の関係（検証済み・追加対応不要）

`useSearch.ts` のメイン検索effect内の `recentMode` 分岐は `clipboardMode`／`prefixCommandMode` の各分岐と同様に `setPathPasteCandidate(null)` を呼んでおり、`/recent` へ切り替わる際に `pathPasteCandidate` が残り続けることはない。`pathPasteWizardMode` の分岐のみ、ウィザード中に機能1/機能2のアクションが `pathPasteCandidate` を引き続き参照する必要があるため、意図的にクリアしていない（この1点のみが例外である旨は当該分岐のコメントに明記済み）。

## 経緯

<a id="paste-detection-unification-history"></a>

### CF_HDROP とテキスト貼り付けの判定経路を1つに統一した経緯

以前は CF_HDROP を検知した場合にバックエンド側で直接パスを判定して候補を生成する経路と、テキスト貼り付けを検索ボックス経由で判定する経路の2つが並存していたが、CF_HDROP も最終的に検索ボックスへ流し込むことで両者を1つの判定経路へ統一した。

<a id="wizard-keydown-unification-history"></a>

### ウィザード中のキー操作を window レベルへ統一した経緯

当初 `"folderSelect"` ステップの候補行（`SearchBox` とは別の `<button>` 要素）は Enter 確定直後や行のクリックでフォーカスが `SearchBox` から外れることがあり、フォーカス先の行がステップ遷移で DOM から消えると `document.body` にフォーカスが戻って `SearchBox` の React `onKeyDown` に keydown が届かなくなる（＝ Escape 等が効かない）不具合があった。Ctrl+S/Ctrl+D と同じ理由（フォーカス状態に依存しないよう window レベルに統一する）で `"folderSelect"` のみを window リスナーに移した際、`"nameEdit"` ステップ側は専用入力欄のローカル `onKeyDown`（Enter＝保存／Escape＝1ステップ戻る）に残したままにしたところ、window リスナー・ローカル `onKeyDown` の双方が同一の Escape キー押下に反応しうる状態になり、「名前編集ステップの Escape が1ステップ（フォルダ選択に戻る）ではなく2ステップ分（通常の検索状態まで）戻ってしまう」というリグレッションが発生した。これを踏まえ、`"nameEdit"` 側のローカル `onKeyDown` を撤去し、`"folderSelect"` と同じ window リスナーに一本化することで、二重ハンドラの併存自体を構造的に無くした。

<a id="mslnk-to-shell-link-history"></a>

### サードパーティクレート `mslnk` からの切り替え

当初は `mslnk`（`ShellLink::new(target).create_lnk(path)` の2手順のみのシンプルな API）を採用していたが、実運用でフォルダを対象にショートカットを作成すると「リンク先」「作業フォルダー」が空欄になり機能しない不具合が発覚した。

`mslnk` 0.1.8 のソース（`ShellLink::new()`）を確認したところ、対象が `fs::metadata().is_dir()` の場合はリンク先情報（相対パス文字列・作業フォルダー文字列・LinkTargetIDList）を一切設定せず `FILE_ATTRIBUTE_DIRECTORY` を立てるだけで終わる実装になっており、ファイル向けの else 分岐でしか実際のリンク先が書き込まれないことが原因と判明した。さらに `LinkTargetIdList::set_linktarget()` 内部のロジックも、パスの終端セグメントを常に「ファイル」として分類する作りで、仮に呼び出し側でフラグ・パス情報を手動補完してもフォルダの終端アイテムが誤ってファイル種別としてマークされてしまう、という2つ目の潜在的な仕様違反も確認した。上流リポジトリ（`dobefore/mslnk`）の Issue #6「Empty lnk with directory target」（2025-03-28 起票）で同一事象が既に報告されているが、直近のマージ済み PR が2022年で止まっており未対応のまま放置されている状況だった。

これらを踏まえ、外部クレートのパッチ的回避（public API 経由でのフラグ手動補完）ではなく、本プロジェクトが `ShellExecuteW`・`SHGetFileInfoW`・クリップボードの Win32 API 直接操作・OCR の WinRT 直呼び出しなど随所で採用している「サードパーティ再実装に頼らず Windows 標準 API を直接呼ぶ」方針との一貫性を優先し、`IShellLinkW`/`IPersistFile` を直接使う実装に切り替えた。標準 API は PIDL（ITEMIDLIST）の構築を内部で行うため、対象がファイルかディレクトリかで呼び出し側の処理を分岐する必要が原理的にない。

## 今後の指針

- OSのクリップボードから実ファイルパスを読む必要が生じた場合、CF_HDROP はブラウザ/WebView2 の `clipboardData` 経由では取得できないことを前提に、Rust 側で直接クリップボードを読み直す設計にする
- 新しいウィザード形式のインタラクション（Enter一発で確定しない複数ステップの操作）を追加する場合、キー操作は window レベルのリスナーに一本化し、個別ステップのローカル `onKeyDown` を併存させない（二重ハンドラによるリグレッションの再発を防ぐため）
- サードパーティクレートで Windows のファイルシステム／シェル関連の機能に不具合が疑われた場合、まず本プロジェクトが一貫して採っている「Windows 標準 API を直接呼ぶ」方針への切り替えを検討する。パッチ的な回避を重ねるより、標準 API の直接呼び出しの方が長期的に安定する
