# WinLauncher — 設計方針

## 開発フロー

要件を変更する場合は、以下の順序で進めること。

1. **`REQUIREMENTS.md` の修正**（基本的にユーザが行う）
2. **本ファイル（`CLAUDE.md`）の設計方針の修正**（要件変更を踏まえてアーキテクチャ・技術選定・挙動仕様を更新）
3. **ソースコードの改修**（更新後の設計方針に基づいて実装）

ソースを直接変更する前に、変更内容が要件・設計方針と矛盾しないか確認し、矛盾があれば先に `CLAUDE.md` を更新してから着手する。

## 言語方針

- ユーザーへの応答・進捗報告・要約・提案は、常に日本語で行うこと
- コード自体のコメントや変数名、コミットメッセージ等、英語であるべき箇所は従来通り英語のままでよい
- リポジトリ内の各種ドキュメント（README・リリースノート等）をどちらの言語で書くかは、個別の慣習ではなく「ドキュメント言語方針」節の表に従う

## ドキュメント言語方針

リポジトリ内の各ドキュメント・告知文が英語／日本語のどちらで書かれるべきかを以下に一覧化する。新規ドキュメントを追加する場合もこの方針に従うこと。

| ドキュメント | 言語 | 備考 |
| --- | --- | --- |
| README.md | 英語のみ | 見出し・本文とも英語で統一。日本語混在不可 |
| GitHub Releases 本文 | 英語 | `gh release create` の本文 |
| アプリ内更新ダイアログ（latest.json） | 日本語 | last-release-notes.md の内容を反映 |
| last-release-notes.md | 日本語 | latest.json 用の一時保存ファイル |
| REQUIREMENTS.md | 日本語 | 仕様書 |
| CLAUDE.md | 日本語 | CC向けコンテキストファイル自体 |
| X（@hidecode365）告知文 | 日本語 | 140字以内 |
| GitHub Issueテンプレート | 英日併記 | 項目名は英語+日本語併記 |

## テストに関する制約

- `npm run tauri dev` でアプリを起動した後、PowerShell やスクリーンキャプチャ等を用いた自動GUIテストは一切実施しないこと
- 動作確認は `cargo build` や `tsc` などの静的なビルド検証までとし、実際のGUI操作・画面キャプチャ・自動操作によるテストはユーザーが手動で行う
- ビルドが通り、アプリが起動できることを確認した時点で、ユーザーに動作確認を依頼して終了すること
- 実装作業において、`npm run tauri dev` の起動自体を行わない（既存プロセスの Kill 承認が発生し手間になるため）。ビルド確認は `cargo build` までとし、アプリの起動・動作確認はユーザー自身が行う
  - 実装プロンプトに明示的な起動指示がない限り、`npm run tauri dev` を実行しないこと
  - ビルドエラーが発生した場合は、その都度ユーザーと相談する

## ログ出力方針

- `console.error` / `console.warn`：常に残す。実害（起動失敗・保存失敗等）の把握のため、本番ビルドでも出力され続ける必要がある
- `console.debug` / `console.log`：開発時の一時調査用。`vite.config.ts` の本番ビルド設定（Terser の `compress.pure_funcs`。「ビルド」節を参照）により `npm run tauri build` 実行時に呼び出しごと自動的に削除されるため、**調査用ログは削除し忘れを気にせず積極的に仕込んでよい**（ファイルパス等の情報を含むログも、本番バイナリには含まれない）
  - `npm run tauri dev` では Terser を通さないため、これらのログはそのまま出力される（devtools コンソールで調査可能）
  - 削除されるのは静的な `console.debug(...)` / `console.log(...)` の呼び出し式そのものであり、変数へ代入した参照（例: `const log = console.debug; log(...)`）等の間接呼び出しは対象外になる点に注意する（通常の直接呼び出しの書き方をしていれば問題ない）
- `ErrorBoundary`（`src/components/ErrorBoundary.tsx`）：上記の調査用ログとは異なり、**開発・本番を問わず常時有効な恒久的な安全装置**。描画中の例外を捕捉し、画面が白紙のまま固まって見える状態を避けてエラーメッセージを表示する。Terser の除去対象ではなく、削除・無効化を前提としない

## 概要

Windows 11 向けキーボードランチャー。Alt+Space でウィンドウをトグルし、
設定済みの複数フォルダ内のファイルをインクリメンタル検索して起動する。
検索ボックスに数式を入力すると計算結果を表示し、クリップボードにコピーできる。

## アーキテクチャ

```text
win-launcher/
├── src/                    # React フロントエンド
│   ├── main.tsx
│   ├── App.tsx             # ルートコンポーネント。フック・コンポーネントを組み合わせる構成のみを担う
│   ├── types.ts             # フロントエンド全体で共有する型・定数（AppSettings 等）
│   ├── lib/
│   │   ├── format.ts        # フォーマット系の純粋関数（formatTimestamp 等）
│   │   └── window.ts        # hideWindow（メインウィンドウ非表示）
│   ├── hooks/
│   │   ├── useSettings.ts    # AppSettings・検索フォルダの読み込み・保存
│   │   ├── useHotkey.ts      # 起動ホットキーの変更（set_hotkey）
│   │   ├── useSearch.ts      # クエリ・検索/計算/システムコマンド判定・frecency・起動系コマンド
│   │   ├── useClipboard.ts   # クリップボード履歴の記録・永続化・呼び出し
│   │   ├── useOcr.ts         # OCR状態管理（ローディング・結果・エラー・クリア）
│   │   └── useUpdater.ts     # アップデートダイアログの状態管理・check_for_update/download_and_install_update呼び出し
│   ├── components/
│   │   ├── SearchBox.tsx           # 検索入力欄（ドラッグ領域・歯車ボタン含む）。画像ペーストを検出して onImagePaste を呼ぶ
│   │   ├── OcrPreview.tsx          # OCR結果プレビュー（編集可能テキストエリア＋コピー・閉じるボタン）
│   │   ├── ResultList.tsx          # 計算結果/システムコマンド候補/ファイル検索結果のリスト
│   │   ├── ClipboardPanel.tsx      # クリップボード履歴モードの2カラムパネル
│   │   ├── WebSearchRow.tsx        # 「Googleで〇〇を検索」行
│   │   ├── SystemCommandModal.tsx  # システムコマンドの確認モーダル
│   │   ├── StatusFooter.tsx        # フッターのキー操作ヒント
│   │   ├── FeatureToggle.tsx       # 設定パネル共通の ON/OFF トグル
│   │   ├── SettingsPanel.tsx       # 設定パネル全体（タブ構成）
│   │   ├── GeneralSettings.tsx     # 全般タブ（ホットキー）
│   │   ├── FileSearchSettings.tsx  # ファイル検索タブ
│   │   ├── CalcSettings.tsx        # 数式計算タブ
│   │   ├── SystemCommandSettings.tsx # システムコマンドタブ
│   │   ├── WebSearchSettings.tsx   # Web検索タブ
│   │   ├── ClipboardSettings.tsx   # クリップボードタブ
│   │   ├── RecentFilesSettings.tsx # 最近使ったファイルタブ
│   │   ├── OcrSettings.tsx         # OCRタブ
│   │   └── UpdateDialog.tsx        # アップデート確認/ダウンロード中ダイアログ
│   └── styles.css
├── src-tauri/
│   ├── src/
│   │   ├── main.rs         # Rust バックエンド（全ロジック）
│   │   └── recent_files.rs # 最近使ったファイル一覧の取得ロジック（Windows/Office Recent フォルダ・OneDrive パス解決）
│   ├── capabilities/
│   │   └── default.json    # Tauri v2 権限設定
│   ├── icons/               # トレイ/アプリアイコン
│   ├── Cargo.toml
│   ├── build.rs
│   └── tauri.conf.json
├── scripts/
│   └── generate-latest-json.ps1  # リリース時に latest.json（Tauri Updater 用）を生成する
├── .claude/
│   └── skills/
│       └── release-flow/SKILL.md  # リリース手順（詳細は「リリース手順」節を参照）
├── REQUIREMENTS.md          # 要件定義（ユーザ管理）
└── CLAUDE.md                # 本ファイル（設計方針）
```

## 技術スタック

| 区分 | バージョン |
| --- | --- |
| Tauri | v2 |
| React | 18 |
| TypeScript | 5 |
| Tailwind CSS | 3 |
| Vite | 5 |

## Tauri プラグイン

| プラグイン | 用途 |
| --- | --- |
| `tauri-plugin-global-shortcut` | グローバルホットキー（起動ホットキー） |
| `tauri-plugin-shell` | ファイル起動・Web検索の URL をデフォルトブラウザで開く（`open()`） |
| `tauri-plugin-autostart` | Windows スタートアップ登録 |
| `tauri-plugin-store` | 検索フォルダ・各機能 ON/OFF・ホットキー設定・ウィンドウサイズ・ファイル起動の frecency 履歴の永続化（`settings.json`）。frecency 履歴・ウィンドウサイズは Rust コマンドを介さず、フロントエンドが JS パッケージ `@tauri-apps/plugin-store` で直接読み書きする |
| `tauri-plugin-dialog` | フォルダ選択ダイアログ |
| `tauri-plugin-clipboard-manager` | 計算結果のクリップボードコピー（Rust コマンド経由）。クリップボード履歴機能ではフロントエンドが JS パッケージ `@tauri-apps/plugin-clipboard-manager` で直接 `readText`/`readImage`/`writeImage` を呼ぶ |
| `tauri-plugin-process` | アプリケーションの再起動（`relaunch`） |
| `tauri-plugin-updater` | 自動アップデート（GitHub Releases + `latest.json` の確認・ダウンロード・インストール） |
| `tauri` (tray-icon feature) | システムトレイ常駐 |

## 設計方針

### ウィンドウ

- `decorations: false` でフレームなし、`tauri.conf.json` の `center: true` に加え、ウィンドウを表示するすべての箇所（グローバルホットキー / トレイ「Show」/ トレイアイコンクリック）で `show()` 直前に Rust 側から `window.center()` を呼び出して画面中央に表示する
  - `tauri.conf.json` に `x` / `y` 座標は設定しない（位置を永続化しないため）
  - ドラッグで移動した位置は保持しない。非表示→再表示のたび（フォーカスアウトによる自動非表示からの再表示も含む）に必ず中央へ戻す
- `transparent: true` + CSS `border-radius` で角丸を実現（Fluent ライクなアクリル風 UI）
  - `tauri.conf.json` の `backgroundColor` を `[0, 0, 0, 0]`（alpha 0）に明示設定する。Windows では WebView2 のデフォルト背景が不透明なため、未設定だと角丸の外側にうっすら線（コーナーのにじみ）が見えるアーティファクトが出る
  - `html` / `body` / `#root` にも `background: transparent` を明示し、ウィンドウ・WebView・DOM の各レイヤーで透過を一貫させる
  - `tauri.conf.json` の `shadow` は `false` にする。ネイティブの drop shadow は矩形の DWM 拡張フレームに対して描画されるため、CSS の角丸クリップ領域と境界が一致せず、角の外側に薄い線が残るアーティファクトが出る。影は `App.tsx` 側の CSS（Tailwind `shadow-2xl`）で代替する
- 起動時は `visible: false`（非表示）
- `skipTaskbar: true`、`alwaysOnTop: true`
- フォーカスアウトで自動非表示（frontend の `onFocusChanged` イベントで `hide()` を呼ぶ）
  - WebView2 はウィンドウ内操作（設定パネルへの切替による DOM 入れ替え、ドラッグ開始など）でも一時的にフォーカス喪失を通知することがあるため、即時 `hide()` はしない
  - フォーカス喪失通知後 150ms 待ち、`isFocused()` で再確認してなお非フォーカスの場合のみ `hide()` する（誤って隠れるのを防ぐデバウンス処理）
- フォーカスイン時（グローバルホットキー等での再表示時）は検索欄の内容を保持したまま再フォーカスする
- ヘッダー行（検索バー / 設定パネルのタイトル行）に `data-tauri-drag-region="deep"` を付与し、マウスドラッグでウィンドウ移動を可能にする
  - `="deep"` 必須。値なし（bare）はヘッダー要素自身を直接クリックした場合のみドラッグ判定となり、子要素（アイコン・テキスト等）の上では発火しないため不可
  - `input` / `button` などクリック可能要素は Tauri 側のロジックで自動的にドラッグ対象から除外されるため、サブツリー全体に付与しても入力・クリック操作は阻害されない
  - 位置の永続化は行わない。`tauri.conf.json` の `center: true` により再起動時は常に画面中央へ戻る
- `resizable: true` でウィンドウ枠からのリサイズを許可する。`tauri.conf.json` の `width` / `height`（デフォルトサイズ）と `minWidth` / `minHeight`（最小サイズ）はいずれも 640 / 420 とする
  - 位置とは異なり、サイズは永続化する（再起動後も最後に設定したサイズを維持する）。位置を永続化しない既存方針とは非対称な扱いになるが、これは要件上の明示的な区別であり矛盾ではない
  - 保存：フロントエンドが `getCurrentWindow().onResized` イベントを購読し、リサイズ確定から 500ms デバウンスしたうえで `@tauri-apps/plugin-store` の JS API（frecency・クリップボード履歴と同じ `storeRef`／`settings.json`）の `"windowSize"` キーへ `{ width, height }`（論理ピクセル。`scaleFactor()` で物理→論理に変換）を直接書き込む。Rust コマンドは追加しない
  - 復元：Rust 側の `setup()` で `settings.json` の `"windowSize"` を読み込み、存在すればメインウィンドウ生成直後に `window.set_size(LogicalSize::new(width, height))` を呼んで適用する（フロントエンドの描画・表示前に確定させるため、`show()` より前に行う）。キーが存在しない場合（初回起動等）は `tauri.conf.json` のデフォルトサイズ（640×420）のままにする
  - 最小サイズの強制は `tauri.conf.json` の `minWidth` / `minHeight` に委譲する（Rust 側で個別にクランプ処理は行わない）
  - ドラッグには `core:window:allow-start-dragging` permission が必要（`capabilities/default.json` に追加）

### グローバルホットキー（Rust / フロントエンド）

- デフォルトは `Alt+Space`。アクセラレータ形式の文字列（`tauri_plugin_global_shortcut::Shortcut`（= `global_hotkey::HotKey`）の `FromStr` 実装が解釈できる形式。例: `Alt+Space`、`Ctrl+Shift+K`。Win キーは `Super`）として `settings.json` の `appSettings.hotkey` に永続化する
- アプリ起動時（`setup`）に `appSettings.hotkey` を読み込み、`Shortcut::from_str` でパースして `register`。パース失敗時（設定破損等）はデフォルトにフォールバックし、ストアの値も補正して保存し直す
- `set_hotkey(accelerator)`（Rust コマンド）
  - `Shortcut::from_str` でパースし、失敗または修飾キー（`mods`）が空の場合はエラーを返して保存しない（修飾キー必須はフロントエンドだけでなく Rust 側でも検証する）
  - 現在登録中のショートカットを `unregister` → 新しいショートカットを `register`
  - 新ショートカットの `register` が失敗した場合（他アプリが使用中など）は旧ショートカットを `register` し直して維持し、エラーを返す（ストアは更新しない）
  - 成功時のみ `appSettings.hotkey` を更新して永続化する
  - `register`/`unregister` は `&str`（アクセラレータ文字列）を直接渡せる（`TryInto<ShortcutWrapper>` 経由）ため、`Shortcut` への変換とは別に文字列のまま登録・解除できる
  - グローバルショートカットの `with_handler` はどのショートカットが発火したかに関わらずメインウィンドウの表示/非表示をトグルするロジックなので、登録するショートカットを切り替えるだけで動作が追従する（ハンドラ自体の変更は不要）
- フロントエンドはキー入力を待ち受けず、修飾キー（Ctrl / Alt / Shift / Win）のチェックボックスと通常キーのプルダウンの組み合わせから直接アクセラレータ文字列を組み立てて `set_hotkey` を呼び出す（詳細は「設定画面」節の全般タブを参照）。ライブキーキャプチャや `WM_SYSCOMMAND` 抑止のような仕組みは不要なため設けていない

### 検索ロジック（Rust）

- `appSettings.fileSearchEnabled` が `false` の場合、フロントエンドは `search_files` を呼ばず検索結果を表示しない
- 検索対象フォルダは設定で複数登録可能（有効/無効を個別に切替）
- 有効なフォルダのみ `walkdir` で再帰走査（最大深さ 5、シンボリックリンク追跡あり）
- クエリを小文字変換してファイル名に部分一致
- 全フォルダ合計で最大 50 件に絞って返却
- 各ファイルの Windows シェルアイコン（エクスプローラーと同じアイコン）を取得し、`data:image/png;base64,...` 形式の文字列として結果に含める
  - Win32 API `SHGetFileInfoW`（`SHGFI_ICON | SHGFI_SMALLICON`）でファイルパスから `HICON` を取得
  - `GetIconInfo` → `GetObjectW` でカラービットマップ（`HBITMAP`）の寸法を取得し、`GetDIBits` で 32bpp トップダウン BGRA のピクセルデータへ変換
  - BGRA → RGBA に並べ替えたうえで `image` クレートで PNG エンコードし、`base64` クレートで Base64 化
  - 取得したアイコン・ビットマップ・DC などの GDI ハンドルは RAII ガード（`Drop` 実装）で確実に解放する
  - 取得に失敗した場合（無効なパス等）はアイコンなし（`null`）として扱い、フロントエンドは汎用のドキュメントアイコン SVG にフォールバックする

### ファイル検索結果の frecency ランキング（フロントエンド）

- `search_files` が返したファイル一覧を、フロントエンド側で frecency スコアの降順に並び替えて表示する（Rust 側のソート処理は不要）
- 履歴データは `@tauri-apps/plugin-store` の JS API（`Store.load("settings.json")`）から直接読み書きする
  - Rust 側（`tauri-plugin-store` の `app.store()`）と JS 側（`Store.load()`）は同じ `settings.json` を共有する同一のストアコレクションを参照するため、Rust 側にコマンドを追加せずフロントエンドだけで永続化が完結する
  - JS から直接ストア操作を呼べるよう、`capabilities/default.json` に `store:allow-load` / `store:allow-get` / `store:allow-set` / `store:allow-save` permission を追加する（削除・クリア等の破壊的操作は使わないため付与しない）
  - キー名は `"frecency"`、値は `{ [path: string]: { count: number, lastUsed: number } }`（`lastUsed` は UNIX タイムスタンプ ms）
- アプリ起動時（マウント時）に `frecency` を読み込み、`useState` と同期する `useRef` の両方で保持する（`useRef` は `useCallback` の古いクロージャ参照を避けるため、`useState` は再レンダリングのトリガー用）
- ファイル起動時（Enter／クリックいずれも `launchFile` 経由）に対象パスの `count` をインクリメントし `lastUsed` を現在時刻で更新、`store.set` → `store.save` で即時永続化する
- スコア計算：`score = count * decay(lastUsed)`。`decay` は経過時間に応じた係数（1時間以内 `1.0`、1日以内 `0.9`、1週間以内 `0.7`、1ヶ月以内 `0.5`、それ以上 `0.3`）
- 履歴のないファイルはスコア `0` として扱う。並び替えはスコア降順、スコアが同じ場合（未起動のファイル同士を含む）はファイル名のアルファベット順を二次キーとする
- この機能の ON/OFF トグルは設けない（常時有効）
- `recordFrecency(path)` はファイル起動時の後処理として `launchFile` の `closeWindow({ cleanup })` の `cleanup` 内で呼ぶ。ウィンドウが実際に隠れた後にのみ実行されるため、この呼び出しが引き起こす再レンダーのタイミングを個別に気にする必要はない（詳細・経緯は「ウィンドウを閉じる系アクションの共通設計」節を参照）

### 設定画面（Rust / フロントエンド）

- 設定パネルは左にカテゴリナビ（全般／ファイル検索／数式計算／システムコマンド／Web検索／クリップボード／最近使ったファイル／OCR）、右に選択中カテゴリの内容を表示するタブ構成（`SettingsPanel` 内でタブ選択状態をローカル `useState` 管理）
- 設定パネルは検索ボックス右の歯車アイコンのクリック、または `Ctrl+S` でトグル開閉する（検索 UI 表示中なら開く、設定パネル表示中なら閉じる）
- 設定パネル表示中は `Ctrl+S` または `Esc` のどちらでも検索 UI に戻る
- `Ctrl+S` の開閉トグルは input 要素のローカル `onKeyDown` ではなく、`window` への `keydown` イベントリスナー（`useEffect`）で一括処理する
  - input のローカルハンドラに持たせると、WebView2 のフォーカス状態や Ctrl+S の既定動作（ページ保存）の影響で発火しないことがあるため
- 設定変更後（パネルを閉じた時点）に検索結果を再評価する
- 永続化は `tauri-plugin-store` の `settings.json` に集約する
  - `folders: { path, enabled }[]`（ファイル検索カテゴリの検索フォルダ一覧）
  - `appSettings: { hotkey, fileSearchEnabled, calcEnabled, systemCommandEnabled, shutdownKeyword, restartKeyword, sleepKeyword, webSearchEnabled, copyWithComma, clipboardEnabled, clipboardPrefix, clipboardMaxItems, recentFilesEnabled, recentKeyword, ocrEnabled, checkUpdateOnStartup }`（全般のホットキー、各機能の ON/OFF、システムコマンド3つ（shutdown/restart/sleep）それぞれの呼び出しキーワード、計算結果コピー時のカンマ区切り、クリップボード履歴の呼び出しキーワードと最大件数、最近使ったファイル一覧の呼び出しキーワード、OCR機能 ON/OFF、起動時アップデートチェック ON/OFF。ON/OFF はデフォルト全て `true`、`hotkey` のデフォルトは `Alt+Space`、`shutdownKeyword`/`restartKeyword`/`sleepKeyword` のデフォルトはそれぞれ `"shutdown"`/`"restart"`/`"sleep"`、`clipboardPrefix`（呼び出しキーワード。フィールド名は据え置き）のデフォルトは `"cb"`、`clipboardMaxItems` のデフォルトは `50`、`recentKeyword` のデフォルトは `"recent"`。いずれのキーワードも `"/"` を固定の区切り文字として先頭に付与したうえで検索クエリと前方一致判定する（`"/"` 自体は設定で変更不可）。5つのキーワードは互いに重複できない（詳細は「システムコマンド機能」節の `validate_unique_keyword` を参照））
  - `frecency: { [path]: { count, lastUsed } }`（ファイル起動履歴。設定画面には表示せず、フロントエンドが JS の plugin-store API で直接読み書きする。詳細は「ファイル検索結果の frecency ランキング」節を参照）
  - `prefixCommandFrecency: { [keyword]: { count, lastUsed } }`（プレフィックスコマンド候補の使用履歴。`frecency` と同形式・同方式で、キーがファイルパスではなく呼び出し文字列（`/shutdown` 等）になる。設定画面には表示せず、フロントエンドが JS の plugin-store API で直接読み書きする。詳細は「プレフィックスコマンド候補表示」節を参照）
  - `clipboardHistory: ClipboardTextEntry[]`（クリップボードのテキスト履歴。設定画面には表示せず、フロントエンドが JS の plugin-store API で直接読み書きする。画像エントリは含まない。詳細は「クリップボード履歴」節を参照）
  - `windowSize: { width, height }`（ウィンドウサイズ、論理ピクセル。設定画面には表示せず、フロントエンドが JS の plugin-store API で直接書き込み、Rust 側が起動時に読み込んで適用する。詳細は「ウィンドウ」節を参照）
  - `clipboardPaneWidth: number`（クリップボード履歴パネルの左ペイン幅、px。設定画面には表示せず、フロントエンドが JS の plugin-store API で直接読み書きする。ドラッグ終了時（mouseup）およびフォーカスアウト時（blur）に保存する。Rust コマンドは追加しない）
- 各カテゴリの内容
  - **全般**：起動ホットキーの表示・変更（修飾キーのチェックボックス＋通常キーのプルダウン。「グローバルホットキー」節を参照）＋起動時アップデートチェック ON/OFF トグル（「自動アップデート機能」節を参照）
  - **ファイル検索**：機能 ON/OFF トグル＋検索フォルダの追加（`tauri-plugin-dialog` のフォルダ選択）・有効/無効トグル・削除（既存の検索フォルダ管理 UI をこのタブ配下に配置）。各フォルダパステキストは既存の `launch_file` コマンド（`ShellExecuteW` でディレクトリパスを開くと Explorer が起動する）を `invoke` で呼ぶクリッカブルボタンとして実装し、クリックでエクスプローラーを開く（追加の Rust コマンドや権限は不要）。ボタンにはホバー時 `cursor-pointer` + 下線を付与し、チェックボックス・削除ボタンの動作には影響しない
  - **数式計算**：機能 ON/OFF トグル＋クリップボードコピー時のカンマ区切り ON/OFF トグル（「計算結果をカンマ区切りでコピー」。「計算機能」節を参照）
  - **システムコマンド**：機能 ON/OFF トグル＋シャットダウン・再起動・スリープそれぞれの呼び出しキーワードの独立したテキスト入力（3つの入力欄。1つの共通プレフィックス設定ではない。「システムコマンド機能」節を参照）
  - **Web検索**：機能 ON/OFF トグルのみ（「Web検索機能」節を参照）
  - **クリップボード**：機能 ON/OFF トグル＋呼び出しキーワードのテキスト入力＋最大保持件数の数値入力（「クリップボード履歴」節を参照）
  - **最近使ったファイル**：機能 ON/OFF トグル＋呼び出しキーワードのテキスト入力（「最近使ったファイル一覧」節を参照）
  - **OCR**：機能 ON/OFF トグルのみ（「OCR機能」節を参照）
- 各 ON/OFF トグル・設定値は Rust コマンド（`set_file_search_enabled` / `set_calc_enabled` / `set_system_command_enabled` / `set_system_command_keyword` / `set_web_search_enabled` / `set_copy_with_comma` / `set_clipboard_enabled` / `set_clipboard_prefix` / `set_clipboard_max_items` / `set_recent_files_enabled` / `set_recent_keyword` / `set_ocr_enabled` / `set_check_update_on_startup`）で即時保存し、フロントエンドはレスポンスの `AppSettings` で state を更新する
- フロントエンドは `appSettings` をアプリ起動時（マウント時）に `get_app_settings` で取得し、検索 UI 側のモード判定（計算モード／プレフィックスコマンド候補表示モード／ファイル検索／Web検索行の表示／クリップボード履歴モード）に反映する。OFF の機能は対応する Tauri コマンド（`calculate` / `search_files`、プレフィックスコマンド候補表示、Web検索行の表示、クリップボード履歴モードへの切替）自体を呼び出さない・表示しない

### 計算機能（Rust / フロントエンド）

- `appSettings.calcEnabled` が `false` の場合、入力内容に関わらず `calculate` コマンドを呼ばない（計算結果表示欄自体を出さない）
- `calcEnabled` が `true` のとき、入力文字列が数字と演算子（`+ - * /`）・括弧のみで構成され、数字と演算子を1文字以上含む場合（`isCalcExpression`、`src/hooks/useSearch.ts`）に自動で `calculate` を呼び出す
- 数式らしい入力であってもファイル検索（`search_files`）とは排他にせず、両方を独立して実行する（`useSearch.ts` の `useEffect` 内で `calculate` 呼び出しと `search_files` 呼び出しを条件分岐せず両方行う）。計算結果はファイル検索結果を置き換えず、その先頭の別枠固定表示領域に共存表示する（URLエンコード/デコード結果 `urlConvertResult` と同じ位置づけ。「URLエンコード/デコードの自動表示」節を参照）
  - 選択（↑↓キー）のインデックス空間は「計算結果（表示中なら1）＋ URL変換結果（表示中なら1）＋ ファイル検索結果」の順で連結する。計算結果は常にインデックス0、URL変換結果はその直後（計算結果がなければ0）を占有し、ファイル検索結果はその後ろへオフセットされる（`ResultList.tsx` の `calcOffset` / `urlConvertOffset`、`App.tsx` の `calcLength` / `urlConvertLength`）
  - `isCalcExpression`（数字・演算子・括弧のみ）と `isUrlLikeInput`（`http(s)://` 始まり、レターを含む）は許容文字クラスが構造上排他のため、計算結果と URL変換結果が同時に発生することはない。ただし将来どちらかの判定条件が緩んだ場合に備え、上記のインデックス連結順（計算結果 → URL変換結果）をルールとして明記している
  - 選択中に Enter またはクリックで結果をクリップボードにコピーしてウィンドウを閉じる挙動は `urlConvertResult` と同一（`copyResult` / `copyUrlConvertResult`）
- Rust 側で四則演算・括弧（優先順位対応の再帰下降パーサ）を評価し、結果を返す
  - 自前実装（外部クレート未使用）。`tokenize`（字句解析）→ `Parser`（`parse_expr` → `parse_term` → `parse_factor` の3段構成の再帰下降パーサ）→ `calculate_expr`（トークン列が丁度消費し切れているかを検証してから評価結果を返す）の流れで評価する
  - `Token` は `Num` / `Plus` / `Minus` / `Star` / `Slash` に加え `LParen`（`(`） / `RParen`（`)`）を持つ。`tokenize` はこれらの文字をそのままトークン化する
  - 括弧は `parse_factor`（`factor := ('+' | '-')* (number | '(' expr ')')`）で処理する。`(` を検出したら `parse_expr` を再帰呼び出しして中身を評価し、続く `)` を消費する。`)` が見つからない場合（閉じ括弧の不足）は `None` を返し、既存のパース失敗時（数字以外の文字混入等）と同様に `calculate` コマンドの戻り値が `None` になる。新規のエラーメッセージは設けていない
- `calculate` が `None` を返した場合（ゼロ除算・パース不能な式・括弧の対応不整合を含む）は計算結果表示欄自体を表示せず、ファイル検索結果はインデックス0から通常通り表示する（「計算できません」のような固定メッセージは表示しない）
- 表示は常にカンマ区切り。コピー時にカンマ区切りを含めるかは `appSettings.copyWithComma`（デフォルト `true`）に従う。フロントエンドはこの値を見て `formatWithCommas` を適用するかをコピー直前に切り替える（画面表示用のフォーマットとは独立した分岐）
  - `set_copy_with_comma(enabled)`（Rust コマンド）は他の機能 ON/OFF トグル（`set_calc_enabled` 等）と同一のパターン（`load_app_settings` → フィールド更新 → `save_app_settings` → 更新後の `AppSettings` を返す）で実装する

### システムコマンド機能（Rust / フロントエンド）

- 明示プレフィックスは「`/`（固定の区切り文字） + キーワード（コマンドごとに個別カスタマイズ可能）」の2部構成。`/` 自体を変更する設定項目はない
- `AppSettings` はシステムコマンド用に `shutdown_keyword` / `restart_keyword` / `sleep_keyword`（camelCase 変換で `shutdownKeyword` / `restartKeyword` / `sleepKeyword`）の3フィールドを持つ（デフォルトはそれぞれ `"shutdown"` / `"restart"` / `"sleep"`）。旧バージョンの設定ファイルとの互換のため、いずれも `#[serde(default = ...)]` でデフォルト値を補う
- `appSettings.systemCommandEnabled` が `false` の場合、システムコマンドの候補は一切表示しない（判定自体を行わない）
- `systemCommandEnabled` が `true` のとき、検索クエリが `/` + 各コマンドのキーワード（大小文字区別なし）に前方一致するかどうかをコマンドごとに独立して判定する（`useSearch.ts` の `matchSystemCommands`）
  - クリップボード履歴のような「共通プレフィックス＋残り文字列の抽出」ではなく、コマンドごとに `/` + キーワード全体の文字列に対してクエリが前方一致するかを判定する（`systemCommandKeyword(action, appSettings)` でコマンドに対応するキーワードを取得し、`/` を連結してから比較する）
  - `shutdown_keyword` → シャットダウン
  - `restart_keyword`（従来の `reboot` は廃止し `restart` に一本化） → 再起動
  - `sleep_keyword` → スリープ
  - どのコマンドにも前方一致しない入力（プレフィックスなしで `shutdown` 等とだけ入力した場合を含む）は通常のファイル検索・Web検索の対象として扱う
- モードが有効な間はファイル検索・計算結果表示を行わない（システムコマンドモードはファイル検索・計算結果と排他のまま。この点は計算機能との共存化の対象外）。Windows のファイル名に `/` を使用できないため、ファイル検索と共存させる実益がなく排他のままとしている
- キーワードへの前方一致のため、例えばキーワードが既定値のままなら `/re` で「再起動」、`/s` で「シャットダウン」「スリープ」の両方が候補に出る（複数候補時は ↑↓ で選択）
- マッチしたシステムコマンドは、クリップボード履歴の呼び出しキーワードと合わせて統一された候補一覧（`prefixCommandCandidates`）としてフロントエンドが表示・選択を扱う。表示形式・排他制御・使用実績（frecency）の詳細は「プレフィックスコマンド候補表示」節を参照
- 各キーワードは設定画面の「システムコマンド」カテゴリで、3つの独立したテキスト入力としてそれぞれ変更可能（1つの共通プレフィックス設定ではない）
  - `set_system_command_keyword(command, keyword)`（Rust コマンド）は対象コマンド（`"shutdown"` / `"restart"` / `"sleep"`）とキーワードを引数に取り、該当フィールドのみを更新する。`load_app_settings` → バリデーション → フィールド更新 → `save_app_settings` → 更新後の `AppSettings` を返す、という他の `set_*` と同一のパターンで実装する
  - 空文字列はエラーを返し保存しない
  - `validate_unique_keyword(settings, changing, new_value)`（Rust の共通関数）で重複チェックを行う。システムコマンド3キーワード＋クリップボードの呼び出しキーワード（`clipboard_prefix`）の計4つのうち、`changing`（変更対象の識別子）を除く他の3つのいずれかと大小文字区別なしで完全一致する場合はエラーを返し保存しない。この関数は `set_system_command_keyword` と `set_clipboard_prefix` の両方から呼ばれる（詳細は「クリップボード履歴」節を参照）
  - フロントエンド（`useSettings.ts`）はコマンドごとに独立したエラー state（`systemCommandKeywordErrors: { shutdown, restart, sleep }`）を持ち、保存に失敗した場合は該当コマンドのフィールドにのみエラーメッセージを表示する（他のフィールドの表示・値には影響しない）。設定パネルを閉じる際に全フィールド分をまとめてリセットする（`resetSystemCommandKeywordErrors`）
- 候補を Enter／クリックした時点では即実行せず、確認モーダル（`pendingCommand` state）を表示する
  - モーダルには対象コマンドのラベル（例: 「シャットダウン」）を表示する
  - モーダル表示中は検索入力を `disabled` にし、↑↓ による候補選択も無効化する
  - 「キャンセル」ボタン or Esc キーでモーダルを閉じ、候補選択画面に戻る（ウィンドウは閉じない）
  - 「実行」ボタン or Enter キーで確定し、Rust 側の `execute_system_command(action)` を呼び出してウィンドウを閉じる
- `execute_system_command(action)`（Rust）自体は確認を行わず、指定されたコマンドを即実行するだけ。確認は呼び出し前のフロントエンド責務とする
  - `shutdown` → `shutdown /s /t 0`
  - `restart` → `shutdown /r /t 0`
  - `sleep` → `rundll32.exe powrprof.dll,SetSuspendState 0,1,0`（スタンバイ。ハイバネートではない）

### Web検索機能（フロントエンド）

- `appSettings.webSearchEnabled` が `true` かつ検索クエリ（`query.trim()`）が1文字以上の場合、現在表示中のリスト（クリップボード履歴モードを除く。システムコマンド候補、またはファイル検索結果＋計算結果＋URL変換結果の共存表示のいずれか）の末尾に「Googleで〇〇を検索」の固定行を常に追加する（〇〇は `query` そのもの）
  - ファイル検索結果が0件で「見つかりませんでした」を表示している場合も、その下に固定行を追加する
  - 通常の検索結果アイテムと区別するため、アイコンの配色（青系）と上端のボーダーで視覚的に区別する
- ↑↓ による選択のインデックス空間は「現在のモードのリスト長（`baseLength`） + Web検索行（表示中なら 1）」を対象にする。Web検索行は常にリストの最後のインデックスになる。`baseLength` はシステムコマンドモード／クリップボード履歴モードでは各モードの件数、それ以外では「ファイル検索結果件数 + 計算結果（表示中なら1）+ URL変換結果（表示中なら1）」の合計になる（詳細は「計算機能」節を参照）
- Enter／クリックで `@tauri-apps/plugin-shell` の `open()` を使い、デフォルトブラウザで `https://www.google.com/search?q=<encodeURIComponent(query)>` を開いてウィンドウを閉じる
  - Rust 側の追加実装は不要（`shell:allow-open` permission は既存の `capabilities/default.json` に登録済み）

### クリップボード履歴（Rust / フロントエンド）

- 検出（Rust）：メインウィンドウの HWND を `SetWindowSubclass`（`windows-rs` の `Win32_UI_Shell`、既存）でサブクラス化し、`AddClipboardFormatListener`（`Win32_System_DataExchange` feature）でクリップボード変更通知の受信者として登録する
  - ウィンドウが `hide()` で非表示の間もメッセージループは稼働しているため、バックグラウンドでも `WM_CLIPBOARDUPDATE` を受信できる
  - サブクラスプロシージャは `WM_CLIPBOARDUPDATE` を受信すると、即座に `std::thread::spawn` で別スレッドへ処理を逃がし、ウィンドウのメッセージループ（メインスレッド）をブロックしない。サブクラスプロシージャ自体は「スレッドを立てて返る」以外の処理を一切行わない
  - `extern "system"` のサブクラスプロシージャはクロージャで `AppHandle` を捕捉できないため、`static APP_HANDLE: OnceLock<AppHandle>` を `setup()` で一度だけ設定し、プロシージャ内ではそこから取得して spawn したスレッドに `clone()` で渡す
- 画像の取得・キャッシュ（Rust、`handle_clipboard_change` 関数。spawn したスレッド上で実行）
  - `appSettings.clipboardEnabled` が `false` の場合は何もせず即 return する（機能 OFF 時はキャプチャ処理自体を行わず CPU を消費しない）
  - `app.clipboard().read_image()`（`tauri-plugin-clipboard-manager` の Rust API。`arboard` 経由でクリップボードの画像を直接読む。JS の `readImage()` 経由ではなく Rust から直接呼ぶため、画像データが IPC（JS ⇄ Rust の JSON シリアライズ）を一度も通過しない）が成功した場合のみ画像として処理する
  - 取得した RGBA を `image` クレートで PNG にエンコードし、そのバイナリ（`Vec<u8>`）をアプリ内メモリのキャッシュ（`ClipboardImageCache`。`tauri::State` で管理する `Mutex<HashMap<id, Vec<u8>>>` ＋挿入順管理用 `VecDeque<id>`）にユニーク ID をキーとして保存する
  - 同時に `image::imageops::resize`（幅 320px 以下、高さはアスペクト比維持）でサムネイルを生成し、PNG → Base64 化した `data:image/png;base64,...` 文字列を作る
  - フロントエンドへは `"clipboard-changed"` イベントで `{ type: "image", id, thumbnailDataUrl, width, height, timestamp }`（`width`/`height` は元画像のサイズ）のみを emit する。画像本体（PNG バイナリ・RGBA）は一切 JS 側へ渡さない
    - `ClipboardChangedPayload` enum の `#[serde(rename_all = "camelCase")]` は enum 直下に付けても variant タグ名（`Text`/`Image`）のリネームにしか効かず、struct variant（`Image { .. }`）内部のフィールド名には伝播しない。`thumbnail_data_url` を JS 側の `thumbnailDataUrl` と一致させるには、`Image` variant 自身にも `#[serde(rename_all = "camelCase")]` を付ける必要がある（付け忘れるとフィールド名が snake_case のまま emit され、JS 側で `payload.thumbnailDataUrl` が `undefined` になりサムネイルが表示されないバグになる）
  - `read_image()` が失敗した場合（クリップボードに画像形式がない）は `{ type: "text" }` を emit するだけで終える。テキストの実際の取得は従来通りフロントエンドの責務とする（テキストは画像と違って IPC 越しでも軽量なため、性能上の問題がなく変更不要）
  - キャッシュは `appSettings.clipboardMaxItems` を超えたら挿入順の古いものから削除する（`VecDeque` の先頭から `pop_front` し、対応する `HashMap` エントリも削除）
- テキストの取得・記録（フロントエンド、変更なし）：`"clipboard-changed"` イベントの payload が `{ type: "text" }` の場合のみ `@tauri-apps/plugin-clipboard-manager` の `readText()` を呼び、成功したらテキストエントリとして記録する
  - `appSettings.clipboardEnabled` が `false` の間は payload の種類に関わらず無視する（記録しない）。ネイティブの監視（`AddClipboardFormatListener`）自体は ON/OFF に関わらず常時有効のままにし、Rust 側を動的に着脱しない
  - テキストエントリ：`{ type: "text", id, text, timestamp }`（`id` はフロントエンドで生成するランダム文字列）
  - 画像エントリ：`{ type: "image", id, thumbnailDataUrl, width, height, timestamp }`。`id` は Rust 側のキャッシュキーをそのまま使う（書き戻し時にも同じ `id` を使ってキャッシュを参照するため）
  - 重複排除：テキストは文字列の完全一致、画像は受信した `thumbnailDataUrl` の完全一致で既存エントリを検出し、見つかった場合は既存エントリを削除してから最新の内容として先頭に再挿入する（件数は増やさず「最新の1件」に統合）
  - 最大件数（`appSettings.clipboardMaxItems`、デフォルト `50`）を超えた古いエントリは配列末尾から削除する（表示用リストの上限。Rust 側キャッシュの上限とは別管理だが同じ設定値を参照するため実質揃う）
- 永続化：テキストエントリのみ `@tauri-apps/plugin-store` の JS API で `settings.json` の `"clipboardHistory"` キーへ永続化する（frecency と同じ方式。Rust コマンドは追加しない）。画像エントリ（サムネイルや ID）は永続化対象外（メモリ上のみ。アプリ再起動で失われる。Rust 側の画像キャッシュもプロセス内メモリのみで再起動とともに消える）
  - アプリ起動時（マウント時）に `clipboardHistory` を読み込み、テキストエントリのみの履歴として復元する
- 呼び出し（モード切替）：明示プレフィックスは「`/`（固定） + `appSettings.clipboardPrefix`（呼び出しキーワード。フィールド名・保存キーはリネームせずそのまま流用し、意味だけを「`/` に続くキーワード」として扱う。デフォルト `"cb"`）」の2部構成。検索クエリが `/` + `clipboardPrefix`（大小文字区別なし）に前方一致する場合にクリップボード履歴モードへ切り替える（`useSearch.ts` の `clipboardModeFilter`。`/` を先頭に連結してから前方一致判定する点はシステムコマンドと同じだが、こちらは単一キーワードのため前方一致した残り文字列をそのまま履歴のテキストフィルタとして使う）。画像エントリはテキストを持たないため、フィルタ文字列が空でない間は一覧から除外する
  - `appSettings.clipboardEnabled` が `false` の場合はこのモード判定自体を行わない（通常の検索/計算/システムコマンド判定にフォールバックする）
  - 呼び出しキーワードは設定画面の「クリップボード」カテゴリの「呼び出しキーワード」欄（ラベルは「呼び出しプレフィックス」から変更）で変更可能。入力欄の近くに「`/` が自動的に先頭に付与されます」という説明を表示する
  - `set_clipboard_prefix(prefix)`（Rust コマンド）は保存時、システムコマンド機能の `validate_unique_keyword(settings, "clipboard", trimmed)` を呼び、システムコマンド3キーワードのいずれかと重複する場合はエラーを返し保存しない（詳細は「システムコマンド機能」節を参照）
- 一覧表示：左リストは新しい順。テキストは先頭数十文字、画像はサムネイルアイコン＋コピー日時を表示する。↑↓ で選択、Enter／クリックで選択中のエントリをクリップボードへ書き戻してウィンドウを閉じる
  - テキストの書き戻しは既存の `copy_to_clipboard`（Rust コマンド）を再利用する
  - 画像の書き戻しは `paste_clipboard_image(id)`（Rust コマンド）を呼ぶだけ。フロントエンドはエントリの `id` を渡すのみで、画像バイナリを一切扱わない
    - Rust 側は `ClipboardImageCache` から `id` に対応する PNG バイナリを取得し、`image::load_from_memory` で RGBA にデコードしたうえで Win32 API（`OpenClipboard` → `EmptyClipboard` → `SetClipboardData(CF_DIB, ...)` → `CloseClipboard`）を直接呼んでクリップボードへ書き込む（`GlobalAlloc`/`GlobalLock`/`GlobalUnlock` で確保した `GMEM_MOVEABLE` メモリに BITMAPINFOHEADER ＋ ボトムアップ BGRA ピクセル列を書き込み、`SetClipboardData` に渡す。渡したメモリの所有権は OS に移るため明示的な解放は行わない）
    - `CF_DIB` は `Win32_System_Ole` feature、`GlobalAlloc` 等は `Win32_System_Memory` feature（いずれも `Cargo.toml` に追加）
- 分割線リサイズ：`ClipboardPanel` コンポーネントが左右ペイン間に分割線要素（幅 4px）を描画し、`onMouseDown` でドラッグ開始を検出する
  - 左ペイン幅を `useState` でコンポーネント内部管理し、`initialLeftWidth` props（App.tsx が store から読み込んで渡す）で初期値を設定する（デフォルト 224px）
  - ドラッグ中は `document` レベルの `mousemove`/`mouseup` を `useEffect` で登録して追従し、`useEffect` のクリーンアップで解除する。`isDragging`（ref）と `leftWidthRef`（現在幅を mouseup コールバックに伝えるための ref）の 2 本を使って実装する
  - 左ペインの最小幅 150px、最大幅はパネル全体の 60%（`panelRef` で外コンテナを計測）
  - ドラッグ中は `document.body.style.cursor = "col-resize"` / `userSelect = "none"` をセットし、mouseup で元に戻す
  - 幅確定（mouseup）時に `onWidthChange` コールバックを呼ぶ。App.tsx はこのコールバックで `settings.json` の `"clipboardPaneWidth"` を即時保存する
  - フォーカスアウト（blur）時にも App.tsx の `clipboardPaneWidthRef`（mouseup で常に最新値を保持するための ref）を使って同キーへ保存する
  - `clipboardPaneWidthRef`（mouseup コールバック用）と `clipboardPaneWidth` state（ClipboardPanel への props 用）は必ず同時に更新する。ref のみ更新して state を更新しないと、パネル再マウント時に古い幅が渡されるバグになる
- 右パネル：クリップボード履歴モードのときのみ、左リストの右側に詳細パネルを表示する2カラムレイアウトに切り替える（他のモードは従来通り単一カラム）。選択中のエントリがテキストなら本文（折り返し表示）とコピー日時・文字数、画像ならサムネイル（`<img src={thumbnailDataUrl}>`）とコピー日時・画像サイズ（元画像の `width`×`height`）を表示する
- 必要な権限（`capabilities/default.json`）：`clipboard-manager:allow-read-text`（テキスト取得用。画像の読み書きは Rust 内部で直接 `app.clipboard()` / Win32 API を呼ぶため JS 側のコマンド許可は不要で `allow-read-image` / `allow-write-image` は付与しない）

### 最近使ったファイル一覧（Rust / フロントエンド）

- 明示プレフィックスは「`/`（固定） + `appSettings.recentKeyword`（呼び出しキーワード。デフォルト `"recent"`）」の2部構成。判定方式（前方一致・残り文字列をフィルタとして使う）はクリップボード履歴と同じ（`useSearch.ts` の `recentModeFilter`）
  - `appSettings.recentFilesEnabled` が `false` の場合はこのモード判定自体を行わない
  - 他のプレフィックスキーワード（システムコマンド3つ・クリップボード）と重複できない。`validate_unique_keyword` の対象に含まれる（「システムコマンド機能」節を参照）
  - キーワードは設定画面の「最近使ったファイル」カテゴリで変更可能。`set_recent_keyword(keyword)`（Rust コマンド）は他の `set_*` と同一パターン（空文字列はエラー、重複チェック後にフィールド更新・保存）で実装する
- 取得（Rust、`recent_files.rs`）：`get_recent_files()`（Rust コマンド）が以下2フォルダの直下（非再帰）を走査し、`.lnk`（ショートカット）・`.url`（インターネットショートカット）を最終アクセス日時（由来ファイル自体の mtime）降順で最大 `MAX_SEARCH_RESULTS`（50）件返す
  1. Windows の Recent フォルダ：Known Folder API（`SHGetKnownFolderPath(&FOLDERID_Recent, ...)`）で取得する。環境によって実パスが異なり得るためハードコードしない
  2. Office の Recent フォルダ（`%APPDATA%\Microsoft\Office\Recent`）：対応する Known Folder API が存在しないため `%APPDATA%` 環境変数からパスを組み立てる
  - `.lnk`：`lnk` クレートの `ShellLink::open` でパースし `link_target()` でリンク先ローカルパスを取得する。リンク先がフォルダ、または実在しない場合は除外する。`link_target()` は `lnk` クレート側の制約で `panic` しうるため `catch_unwind` で保護し、1件の異常な `.lnk` がプロセス全体を巻き込まないようにする（release ビルドは `panic = "abort"` のため素通しは致命的）
    - 文字コード：`ShellLink::open` はエンコーディング引数を要求する。固定で `WINDOWS_1252` を渡すと、`LinkInfo` の ANSI フォールバック文字列（Unicode フィールドとは別に必ず読み込まれる）が日本語（Shift-JIS）パスでデコード不能となり `Err` を返す＝一覧から静かに欠落するバグになる。`GetACP()`（Win32 API）でシステム既定 ANSI コードページを取得し、`encoding_rs` の対応エンコーディング（932 → `SHIFT_JIS` 等）を都度渡すことで解消している（`system_default_encoding`）
  - `.url`：テキスト（INI形式）としてパースし `URL=` 行の値を取得する。`https://d.docs.live.net/` で始まる URL のみ OneDrive 上のファイルとみなし、ローカル同期先パスへの変換を試みる（`resolve_onedrive_local_path`）
    1. レジストリ `HKEY_CURRENT_USER\Software\Microsoft\OneDrive\Accounts` 配下の全サブキー（`Personal`・`Business1` 等、個数は環境依存）を動的に列挙し、各々の `UserFolder` 値をローカル同期先パスの候補とする
    2. URL からアカウント識別子セグメントを読み飛ばした残りをパーセントデコードし、OneDrive ルートからの相対パスとして扱う
    3. 候補ルートそれぞれで「候補ルート＋相対パス」の実在確認を行い、最初に見つかったものを採用する。どの候補でも見つからなければ削除済みファイルと同様に除外する
    - 表示名はファイル名から末尾の `.url` を除いたもの。除去後に「もっともらしい拡張子」（ASCII 英数字のみの拡張子）で終わらないもの（OneDrive 上のフォルダ的参照）は、フォルダを除外する既存ルールに従い一覧から除外する（`has_plausible_extension`）
    - ソートキーは変換の成否に関わらず `.url` 自体の mtime
  - Windows の Recent フォルダと Office の Recent フォルダの両方に同一のローカルパスを指すエントリが存在する場合は1件に統合する（mtime が新しい方を採用）。`.lnk` 由来・`.url` 由来（ローカルパス変換成功済み）を問わず同じ統合ロジックを適用する
- モード切替・フィルタ・表示（フロントエンド、`useSearch.ts`）
  - モードに入ったタイミング（`recentMode` が `false → true` になった瞬間）で `get_recent_files` を呼び直す。フィルタ文字列が変わるたびには再取得せず、取得済みの一覧をフロントエンド側で表示名（`RecentFile.name`。`.lnk`/`.url` いずれもここに統一済み）への部分一致でフィルタする（`recentResults`）。既に最終アクセス日時降順で取得済みのため、フィルタ後も順序は維持される
  - 加えて、`recentMode` を維持したままウィンドウが非表示→再表示された場合（`getCurrentWindow().onFocusChanged` でフォーカス回復を検知）も取得し直す。クリップボード履歴は OS のクリップボード変更通知を常時受信しているため非表示中の変化も自動で最新化されるが、最近使ったファイル一覧にはプッシュ通知の仕組みがなく、モード遷移時の1回きりの取得のままだと非表示中にファイルを開く／削除する等の変化が反映されないままになる（フォーカスアウト→インを挟んでも一覧が更新されず、見た目上フリーズしたように見える不具合の原因になっていた）。フォーカス回復のたびに再取得することで、クリップボード履歴と同様「再表示時には常に最新の状態を見せる」挙動に揃えている。この再取得判定自体は `useSearch.ts` 内の `/recent` 専用ハードコードではなく、汎用の「フォーカス回復時再取得テーブル」（`focusRegainTableRef`）へのエントリとして宣言している。詳細・新モード追加時の規約は「"/" プレフィックスモードの内部アーキテクチャ」節を参照
  - `RecentFile` は既存の `FileEntry` へ `{ name, path, icon: null }`（アイコンなし）としてマッピングし、既存の `ResultList` のファイル検索結果と同じ行 UI・`launchFile` をそのまま再利用する（`RecentFile.path` は `.lnk`/`.url` いずれも実在確認済みのローカルパスに統一されているため、起動処理を由来で分岐する必要がない）
  - ファイル検索結果・計算結果・URLエンコード/デコード結果との関係は他のプレフィックスモードと同様に排他（`recentMode` の間は `search_files` を呼ばず、それらを表示しない）
  - frecency によるスコア並び替えは行わない（常に最終アクセス日時順を維持する）
- 設定画面の「最近使ったファイル」カテゴリ：機能 ON/OFF トグル＋呼び出しキーワードのテキスト入力（`RecentFilesSettings.tsx`）

### 格納フォルダを開く（Shift+Enter）（Rust / フロントエンド）

- 対象：通常のファイル検索結果、`/recent`（最近使ったファイル一覧）の結果一覧の両方（いずれも `useSearch.ts` の `results` state を共有しているため、キーボード操作側は由来を区別しない。計算結果・URLエンコード/デコード結果・システムコマンド候補・クリップボード履歴・プレフィックスコマンド候補はファイルパスを持たないため対象外）
- 選択中に Shift+Enter を押すと、対象ファイルの親フォルダをエクスプローラーで開く。通常の Enter によるファイル起動と同様にウィンドウを閉じる（非表示にする。詳細は後述の「ウィンドウを閉じる」小節を参照）
- Rust：`open_containing_folder(path)` コマンド（`main.rs`）
  - `path` の拡張子が `.lnk`（大小文字区別なし）の場合、`recent_files::resolve_lnk_target_path(path)` でリンク先ローカルパスを解決し、解決できればそちらの親フォルダを、できなければ `.lnk` 自身の親フォルダを開く（`Option::unwrap_or` でフォールバック）
  - `.lnk` 以外はそのまま `path` の親フォルダ（`Path::parent()`）を開く
  - フォルダを開く処理自体は既存の `open_file`（`ShellExecuteW` にディレクトリパスを渡すとエクスプローラーが開く。設定画面の検索フォルダパスクリックと同じ仕組み）をそのまま流用する。新規の Win32 API 呼び出しは追加していない
- Rust：`.lnk` のリンク先解決ロジックの共有（`recent_files.rs`）
  - 「最近使ったファイル一覧」節の `.lnk` 処理（`process_lnk`）から、リンク先ローカルパスの解決部分だけを `pub fn resolve_lnk_target_path(lnk_path: &Path) -> Option<String>` として切り出した（`ShellLink::open` によるパース、`system_default_encoding()` による文字コード解決、`link_target()` の `catch_unwind` による panic 対策を含む、`process_lnk` が使っていたロジックそのもの）。`process_lnk` はこの関数を呼んだうえで実在チェック・フォルダ除外を追加で行う一覧生成用のラッパーになっている
  - `open_containing_folder` はこの `resolve_lnk_target_path` を実在チェックなしでそのまま呼ぶ（`.lnk` 自体が通常のファイル検索結果に出現している時点で実在は保証されているため、`process_lnk` の実在チェック・フォルダ除外ロジックは不要）
- フロントエンド：`useSearch.ts` の `openContainingFolder(path)`
  - `launchFile` と同じ「ウィンドウを閉じる」経路（`closeWindow({ cleanup: () => setResults([]) })`）を通る。frecency は記録しない（ファイルを起動したわけではないため）。`closeWindow()` の詳細・`invoke` を `await` せず発火する理由は「ウィンドウを閉じる系アクションの共通設計」節を参照
  - `App.tsx` の `handleKeyDown` で `e.shiftKey` を判定し、計算結果・URLエンコード/デコード結果・Web検索行のインデックスオフセットを踏まえた同一の計算式（`search.results[search.selected - calcLength - urlConvertLength]`）で対象ファイルを求める。この計算式は通常の Enter 起動と共通の `selectedFile` 変数として1箇所にまとめている（計算結果・Web検索行等が選択中の場合は範囲外アクセスとなり `undefined` になるため、Shift+Enter は自然に無効化される。個別の除外条件を書く必要がない）
  - フッターのキー操作ヒント（`StatusFooter.tsx`）：`isFileSelected` が真（＝選択中の項目が実ファイル）のときのみ「Shift+Enter フォルダを開く」を表示する

### プレフィックスコマンド候補表示（フロントエンド）

- 検索クエリが `/` から始まる場合、登録済みの全プレフィックスコマンド（システムコマンド3つ＋クリップボード履歴＋最近使ったファイル一覧。今後プレフィックス機能が追加された場合も同様に扱う）を、ファイル検索結果とは別枠の候補一覧として表示する（`useSearch.ts` の `buildPrefixCommandCandidates`）
  - システムコマンド3つは既存の `matchSystemCommands`（「システムコマンド機能」節を参照）をそのまま呼び出し、一致した `SystemCommand` を `PrefixCommand`（`{ keyword, description, kind: "system", action }`）に変換して候補に加える。個別のキーワード判定ロジック自体（`/` + キーワード全体への前方一致）は変更しない
  - クリップボード履歴は `/` + `appSettings.clipboardPrefix` がクエリに前方一致するかを同じ方向（候補文字列がクエリで始まるか）で判定し、一致すれば `{ keyword, description: "クリップボード履歴", kind: "clipboard", action: null }` を候補に加える
  - 最近使ったファイル一覧は `/` + `appSettings.recentKeyword` が同様に前方一致するかを判定し、一致すれば `{ keyword, description: "最近使ったファイル", kind: "recent", action: null }` を候補に加える
  - `appSettings.systemCommandEnabled` / `clipboardEnabled` / `recentFilesEnabled` が `false` の機能はそれぞれ候補生成の対象から除外する
  - `calcMode`（数式らしい入力）、または `clipboardMode`／`recentMode`（呼び出しキーワードが完全に入力済みで既に専用モードに切り替わっている状態）の間は候補を生成しない（`clipboardMode`／`recentMode` は個別の発火ロジック＝`clipboardModeFilter`／`recentModeFilter` を変更せず、そのまま優先させる。つまり `/cb` や `/recent` を最後まで入力した時点で候補一覧ではなく専用モードへ直接切り替わる、という挙動を維持する）
- `PrefixCommand`（`src/types.ts`）は `{ keyword: string, description: string, kind: "system" | "clipboard" | "recent", action: SystemCommandAction | null }`。`keyword` は呼び出し文字列（`/` + キーワード全体、例: `"/shutdown"`）で、frecency のキーにもそのまま使う
- 候補は frecency スコアの降順で並び替える（`sortPrefixCommandsByFrecency`）。ファイル検索結果の frecency（`sortByFrecency`/`frecencyScore`/`decayFactor`。「ファイル検索結果の frecency ランキング」節を参照）と全く同じ関数を再利用し、キーだけを `path` から `keyword` に変えている。使用実績のない候補はスコア0、その場合は `keyword` のアルファベット順が二次キーになる
  - 使用実績（`count`/`lastUsed`）は候補を Enter／クリックで選択（＝実行）した時点（`selectPrefixCommand`）で記録する。システムコマンドは確認モーダルの確定を待たず、候補を選んだ時点で記録する
  - `tauri-plugin-store` の `settings.json` に `"prefixCommandFrecency"` キー（`{ [keyword]: { count, lastUsed } }`）でフロントエンドが直接永続化する（frecency と同じ方式。Rust コマンドは追加しない）。アプリ起動時（マウント時）に App.tsx が読み込み、`useSearch` の `setInitialPrefixCommandFrecency` で初期値を反映する
- 表示（`ResultList.tsx`）：ファイル検索結果・システムコマンド候補と同じリストUI（アイコン＋太字1行目＋グレー2行目）を流用する。1行目に呼び出し文字列（`cmd.keyword`）、2行目に説明文（`cmd.description`）を表示する。アイコンは `kind` によって切り替える（システムコマンドは既存の電源アイコン、クリップボード履歴は `ClipboardPanel` のテキストエントリと同じドキュメントアイコン、最近使ったファイル一覧は時計アイコン）
- ファイル検索結果との関係は排他（`prefixCommandMode = prefixCommandCandidates.length > 0` の間はファイル検索・計算結果・URLエンコード/デコード結果を表示せず、`search_files` も呼ばない）。旧 `systemMode`/`systemMatches` はこの機能に統合され、`useSearch.ts` の公開APIからは削除された（`prefixCommandMode`/`prefixCommandCandidates`/`selectPrefixCommand` に置き換え）
- 選択・実行（`selectPrefixCommand`）：↑↓ で選択、Enter／クリックで直接実行する（ファイル検索結果の選択・実行と同じ挙動）
  - `kind: "system"` の場合：`requestSystemCommand({ action, label: description })` を呼ぶだけで、既存の確認モーダル（`pendingCommand` state、「システムコマンド機能」節を参照）にそのまま合流する
  - `kind: "clipboard"` または `kind: "recent"` の場合：`setQuery(candidate.keyword)` で検索クエリを呼び出しキーワード全体（例: `"/cb"`、`"/recent"`）に置き換える。これにより次のレンダリングで既存の `clipboardModeFilter`／`recentModeFilter` が自然に一致し、それぞれの専用モードへ切り替わる（専用の遷移コードを新設しない）
- 前方一致する候補が0件の場合（例: `/xyz`）は `prefixCommandMode` が `false` のままとなり、候補欄を表示せず通常のファイル検索結果を表示する

### ウィンドウを閉じる系アクションの共通設計（フロントエンド）

ウィンドウを閉じる系のアクション——`launchFile`／`openContainingFolder`／`copyResult`／`copyUrlConvertResult`／`openWebSearch`／`confirmSystemCommand`（以上 `useSearch.ts`）／`selectClipboardEntry`（`useClipboard.ts`。`useSearch` の `closeWindow` を引数として受け取って使う）——は、すべて `useSearch.ts` の `closeWindow(options?)` を経由する。**新しくウィンドウを閉じる系アクションを追加する場合も、必ずこの関数を経由すること。** `closeWindow()` を経由しない独自のクローズ処理・個別の `useRef` ガードを新設しない。

**設計原則：`hideWindow()` を最優先で `await` し、React state の変更は解決後に行う**

```ts
const closeWindow = useCallback(
  async (options?: {
    clearQuery?: "full" | "prefixOnly";
    prefix?: string;
    cleanup?: () => void | Promise<void>;
  }) => {
    await hideWindow();
    if ((options?.clearQuery ?? "full") === "prefixOnly") {
      setQuery(options?.prefix ?? "");
    } else {
      setQuery("");
    }
    bumpCloseRefreshTick();
    await options?.cleanup?.();
  },
  [bumpCloseRefreshTick]
);
```

- `results`／`selected`／`calcResult`／`frecency` 等、画面に影響する React state の変更は、必ず `cleanup` オプション（または `closeWindow()` 自身が行うクエリのクリア）としてまとめ、`hideWindow()` の解決後にのみ実行されるようにする。この境界さえ守れば、後処理がどれだけ重かったり（frecency の store 書き込み等）、他の `useEffect` を連鎖的に再実行させたり（`/recent` の `recentResults` 再計算等）しても、ウィンドウが可視状態のまま中間状態が描画されることは構造的に起こり得ない
- 各アクションが行う「ファイル起動・クリップボードへの書き込み等の Rust 呼び出し（アクション本体）」は、`closeWindow()` を呼ぶ前に `await` せず fire-and-forget で発火する。ウィンドウの表示状態と無関係な副作用のため `hideWindow()` を待たせる理由がなく、開いたアプリの起動が遅い場合（画像ビューアー等）でも `closeWindow()` の `hideWindow()` 呼び出し自体は遅延しない
- `bumpCloseRefreshTick()` は `closeRefreshTick`（`useState<number>`）を加算し、メインの検索 `useEffect` の依存配列に含めている。React の `useState` は新しい値が `Object.is` で現在値と等しければ再レンダリングをスキップする（ベイルアウト）ため、無入力のまま（`query` が既に `""`）frecency 順のデフォルト一覧から直接ファイルを起動した場合や、`/recent`・`/cb` で連続してプレフィックスのみへ戻す場合、`setQuery` だけでは値が変化せず検索エフェクトが再実行されないことがある。`closeRefreshTick` は query の値に依存せず確実にエフェクトを再実行させるための専用カウンタ
- **`clearQuery` の使い分け（"full" / "prefixOnly"）**：`"full"`（デフォルト。クエリを完全に空文字へ戻す）と `"prefixOnly"`（プレフィックス部分だけを残し、それに続く絞り込みフィルタ文字列だけをクリアする。残す文字列は呼び出し側が `options.prefix` に渡す）の2パターン。`"prefixOnly"` を使うのは `launchFile` の `/recent` モード分岐と `selectClipboardEntry`（`/cb`）の2箇所のみで、それ以外は明示的に指定しない限り `"full"` のまま動作する
  - **新規プレフィックスモード追加時の検討観点**：確定（Enter／クリック）のたびにそのモードから連続して別の項目を選び直すユースケースが想定されるモード（`/recent`・`/cb` のような一覧選択系）は `"prefixOnly"` の対象候補にする。逆に、1回の確定でそのモード自体から離脱するのが自然なモード（通常のファイル検索、システムコマンドの実行等）は `"full"` のままでよい。`options.prefix` に渡す文字列は、設定画面で変更可能な呼び出しキーワードを反映した動的な値（`PREFIX_CHAR + appSettings.xxxKeyword` 等）として都度組み立てること。`"/recent"`・`"/cb"` のようなハードコードはしない（ユーザーがキーワードを変更している場合に不整合が生じるため）

**過去の経緯（モグラ叩きの反省）**：以前は各アクションが「アクション本体の副作用 → 結果クリア → `closeWindow()`」という順序を個別に実装しており、`hideWindow()` が解決する前に他の非同期処理（`recordFrecency` の `setFrecency` が引き起こす検索 `useEffect` の再実行、`/recent` の `recentResults` の同期的な再計算等）が先に走ってしまい、選択ハイライトの位置や結果一覧の内容が一瞬だけ意図しない状態で描画される「ちらつき」バグが、症状ごとに個別発生していた（通常のファイル検索での frecency 起因のちらつき、`/recent` で画像ファイルを実行した場合のみ再発したちらつき、等）。それぞれを `closingRef` のような個別ガードで後追いに潰す対症療法を重ねていたが、ファイル種別や処理の重さが変わるたびに新しい中間状態が露出しかねない構造だった。「`hideWindow()` 解決より前に、画面に影響する React state を一切変更しない」という順序を `closeWindow()` 自身に強制させる設計に統一したことで、個別ガード（`closingRef`）や個別の呼び出し順序の工夫（`recordFrecency` を意図的に `await` せず発火する等）はすべて不要になり削除した。

**再表示時（`cleanup` がまだ完了していない場合）の挙動方針**：`closeWindow()` の `cleanup` は `hideWindow()` の解決後に開始される。理論上、ユーザーが極めて素早く再度ウィンドウを表示した場合、`cleanup` の非同期部分（`recordFrecency` の store 書き込み、`search_files`/`get_recent_files` の再取得等）が完了していない状態で画面が見える可能性がある。検討した3方針：

1. 再表示時、`cleanup` の完了を待ってから最新状態を描画する
2. 再表示時点で未完了なら、その場で `cleanup` を即時実行してから描画する
3. 再表示時は一旦ニュートラルな状態を先に描画し、`cleanup` の結果は次のクエリ変化まで気にしない

採用したのは **3**。理由：
- ウィンドウの再表示（グローバルホットキー／トレイ）は Rust 側が `window.center()` → `show()` を行うだけの経路で、JS 側の `cleanup` の完了と同期する仕組みを持たない。1・2 を実現するには新たな IPC 往復や `show()` 自体の待機処理が必要になり、体感速度（Alt+Space の反応速度）を犠牲にしてまで解消する価値のある問題ではない
- `cleanup` の同期的な部分（`setQuery`／`setResults`／`bumpCloseRefreshTick` 等）は `hideWindow()` の解決直後、単一の JS 実行区間内でほぼ瞬時に完了する。人間の Alt+Space 打鍵と Rust 側の `show()` の IPC 往復がここに割り込む余地は事実上ない
- 残る非同期部分（`recordFrecency` の store 書き込み、検索結果の再取得等）が再表示後もまだ解決していない場合に見える状態は、「クエリを変更した直後、結果が追いつくまでの一瞬のロード状態」と本質的に同じであり、通常のクエリ入力時から既に許容されている自然な UI 状態である。ここだけを特別扱いして待たせる理由がない

**適用対象外の例外**：OCR プレビューの「コピーして閉じる」（`App.tsx` の `handleOcrCopyAndClose`）は、`closeWindow()` を経由せず独自に 180ms のフェードアウト演出を挟んでから `hideWindow()` を呼ぶ。これはウィンドウが可視のまま意図的に見せる演出であり、「隠れるまで state を変更しない」という本節の原則とは目的が異なる（詳細は「フロントエンド」節の OCR 関連記述を参照）。同様に `Escape` キーによる非表示は `hideWindow()` を直接呼ぶのみで、クエリ保持のため `closeWindow()` の後処理（クエリクリア）自体を意図的に行わない

### "/" プレフィックスモードの内部アーキテクチャ（フロントエンド）

`/recent`・`/cb` 等、"/" プレフィックスを持つモードが増えるたびに個別対応が積み重なり、フォーカス・非表示まわりのロジックが複雑化していた。以下の2パターンに集約することでこれを解消している（ウィンドウを閉じる処理自体の共通化は「ウィンドウを閉じる系アクションの共通設計」節を参照）。**新しい "/" プレフィックスモード（pull型のデータ取得を伴うもの）を追加する際は、必ずこの2パターンに乗せること。** 個別の ref・個別の `useEffect` 分岐を新設しない。

- **世代ID管理（`asyncCallIdRef`、`useSearch.ts`）**：`search_files`・`get_recent_files` 等、非同期呼び出しの「自分が最新の呼び出しか」を判定する世代 ID を、モード名をキーにした単一の `Record<string, number>` にまとめている（`const asyncCallIdRef = useRef<Record<string, number>>({})`）。呼び出し直前に `beginAsyncCall(key)` で世代を進めて ID を取得し、`.then()` 側で `isLatestAsyncCall(key, id)` が `false` なら結果を破棄する。現在使用中のキーは `"search"`（`search_files`）と `"recent"`（`get_recent_files`）
  - 【過去の教訓】この2つの世代 ID をかつて1本のカウンタで共有していたところ、「Shift+Enter でフォルダを開く → Explorer にフォーカスを奪われる → `/recent` モードのフォーカス回復リスナーが `get_recent_files` を呼んで共有カウンタを進める → 直後に解決した `search_files("")` の再取得が『もう自分は最新ではない』と誤判定され結果が握りつぶされる」という不具合が起きていた。**同一のカウンタを複数の非同期呼び出し系統（別コマンド）で共有しないこと**が教訓であり、それを構造的に強制するのがこの仕組み。新しいモードで pull型の非同期取得を追加する場合は、既存キーを使い回さず新しいキー名を割り当てて `beginAsyncCall`/`isLatestAsyncCall` を呼ぶこと
- **フォーカス回復時再取得テーブル（`focusRegainTableRef`、`useSearch.ts`）**：push型（OS 通知等で非表示中も自動的に最新化される。例：クリップボード履歴）ではない pull型モードは、モード遷移時の1回きりの取得のままだと非表示中の変化（ファイルを開く／削除する等）が反映されない。これに対応するため、`focusRegainTableRef.current`（`Record<string, { active: boolean; refetch: () => void }>`）へレンダーのたびに最新の `active`／`refetch` を書き込み、単一の `onFocusChanged` リスナーがフォーカス回復時にテーブルを走査して `active` なモードだけ `refetch()` を呼ぶ。リスナー自体は特定モードを知らない汎用ロジックのみを持つ
  - 現在のエントリは `recent` の1つ（`/recent` モード、`fetchRecentFiles("focus-regain")`）。新しい pull型モードを追加する場合は、この `focusRegainTableRef.current` の代入にエントリを1つ追加するだけでよく、`onFocusChanged` リスナー自体やモード専用の鏡ref（かつての `recentModeRef` のようなもの）を新設する必要はない
  - この `onFocusChanged` リスナーは `App.tsx` 側のフォーカスアウト自動非表示・フォーカスイン再フォーカス用のリスナー（「ウィンドウ」節を参照）とは別に `useSearch.ts` 内で独立して登録している。責務（ウィンドウ全体のフォーカス管理 vs. モードごとのデータ鮮度管理）が明確に分かれているため、意図的に統合していない

### ファイル起動（Rust）

- Win32 API `ShellExecuteW` を直接呼び出し、拡張子に応じたデフォルトアプリで開く
  - `cmd /C start "" <path>` は cmd.exe が `/C` 以降の引数を連結して1つのコマンドラインとして再パースするため、ファイル名に `&` `|` `^` 等の文字が含まれる場合にコマンドインジェクションが発生し得る（検索対象フォルダに攻撃者が任意のファイル名のファイルを置けるケースが脅威モデルになる）。`ShellExecuteW` はファイルパスをコマンドラインとして解釈せず、開く対象のファイルパスとして丸ごと1つの文字列で渡すだけのため、この種のインジェクションが発生しない
  - 実装は `open_file(path: &str)`（`#[cfg(windows)]`）。`hwnd` は `None`、`lpoperation`/`lpparameters`/`lpdirectory` は `PCWSTR::null()`（既定の動作に委譲）、`lpfile` にのみ対象パスの UTF-16 文字列を渡す
  - 戻り値の `HINSTANCE` は ShellExecute の仕様上、成功時は 32 を超える値、失敗時は 32 以下のエラーコードを返すため、`<= 32` で失敗判定する
  - `#[cfg(not(windows))]` 側は `cargo build` を非Windows環境でも通すためのフォールバック（このアプリ自体は Windows 専用）
  - 必要な `windows` クレートの feature（`Win32_UI_Shell`・`Win32_UI_WindowsAndMessaging`）はシェルアイコン取得・クリップボード機能で既に有効化済みのため追加不要

### システムトレイ

- Tauri v2 の `tray-icon` 機能を使用
- トレイアイコンは `icons/32x32.png`（`npm run tauri icon` で生成されるアプリアイコン）を `include_bytes!` でコンパイル時に埋め込み、`image` クレートで RGBA にデコードして使用する
  - `include_bytes!` はファイル内容をビルドの依存関係として記録するため、アイコン差し替え後は次の `cargo build` で自動的に再コンパイルされる（手動で `build.rs` を touch する必要はない）
- トレイメニューの項目構成（この順で配置）
  - 「Show WinLauncher」：左クリック / メニュークリックでウィンドウ表示（`window.center()` → `show()` → `set_focus()`）
  - 「Check for Updates」：ウィンドウを表示（「Show WinLauncher」と同じ `center()` → `show()` → `set_focus()`）したうえで `"check-for-update-requested"` イベントを emit する。実際のチェック処理（`check_for_update` の呼び出し・結果に応じたダイアログ表示）はフロントエンド（`useUpdater`）が行う（詳細は「自動アップデート機能」節を参照）
  - 「Start with Windows」：チェック付きメニュー項目。現在の自動起動状態を反映し、クリックで `tauri-plugin-autostart` の有効/無効をトグルしてチェック状態を更新
  - 「Restart」：`app.request_restart()`（`tauri-plugin-process` プラグイン登録後に `AppHandle` が持つメソッド）でアプリケーションを再起動する。トレイトのインポートは不要
  - 「Quit」：`app.exit(0)` でアプリケーションを終了する
- ツールチップは `"WinLauncher — {hotkey}"` 形式（`{hotkey}` は `appSettings.hotkey`）
  - トレイは `TrayIconBuilder::with_id("main-tray")` で構築するため、`app.tray_by_id("main-tray")` で後から `TrayIcon` ハンドルを取得できる
  - アプリ起動時（`setup`）：登録した起動ホットキー文字列（パース失敗時はデフォルトへフォールバック後の値）でツールチップを組み立てて `.tooltip(...)` に渡す
  - `set_hotkey` コマンドでホットキー変更が成功した直後、`app.tray_by_id("main-tray")` を取得して `set_tooltip(Some(...))` を呼び、新しいホットキー文字列でツールチップを即時更新する

### 自動起動

- `tauri-plugin-autostart` でレジストリ登録
- 起動時に `is_enabled()` で現在の状態を取得し、トレイメニューのチェック状態に反映
- トレイメニューの「Start with Windows」クリックで `enable()` / `disable()` をトグル

### 自動アップデート機能（Rust / フロントエンド）

- `tauri-plugin-updater` を使用。配信方式は GitHub Releases + 静的 `latest.json`（`tauri.conf.json` の `plugins.updater.endpoints` に URL を設定）
- 署名鍵は `tauri signer generate`（minisign 方式）で生成し、秘密鍵は `src-tauri/keys/`（`.gitignore` 対象、コミットしない）に保存する。公開鍵（`.pub` ファイルの中身をそのまま）を `tauri.conf.json` の `plugins.updater.pubkey` に設定する
- `tauri.conf.json` の `plugins.updater.windows.installMode` は `"passive"`（進捗バーのみ表示する無人インストール）
- `tauri.conf.json` の `bundle.createUpdaterArtifacts: true` により、`npm run tauri build` 時に NSIS インストーラー本体（`.exe`）に対して署名済み `.exe.sig` が直接生成される（現行の `@tauri-apps/cli` v2 は Windows 向け updater アーティファクトとして zip ラッピングを行わない）。この成果物から `latest.json` を生成し GitHub Releases へアップロードするリリース手順の詳細は「リリース手順」節を参照
- Rust コマンド
  - `check_for_update()`：`app.updater().check()` を呼び、`{ available, version, notes }`（`UpdateCheckResult`）を返す。見つかった `tauri_plugin_updater::Update` は次の `download_and_install_update` 呼び出しに備えて `PendingUpdate`（`Mutex<Option<Update>>`、`app.manage()` で管理）に保持する（再チェックを避けるため）
  - `download_and_install_update()`：`PendingUpdate` から取り出した `Update` の `download_and_install()` を呼ぶ。Windows 実装は内部でダウンロード完了後にインストーラーを起動し `std::process::exit(0)` でプロセスごと終了するため、成功時はこの呼び出しから制御が戻らない（＝フロントエンドの `invoke` の Promise は解決されない）
  - `on_before_exit` フックは明示的な上書きを行わない。`UpdaterExt::updater_builder()`（`app.updater()` の内部実装）が既定で `AppHandle::cleanup_before_exit()` を呼ぶよう配線済みであり、これがトレイアイコン（`TrayIconBuilder::with_id("main-tray")` で登録した単一アイコン）・各ウィンドウ・リソーステーブルの後片付けを行う。個別のトレイ後片付けコードは不要と判断した
  - ダウンロード進捗のコールバック（`download_and_install` の `on_chunk`/`on_download_finish` 引数）は no-op（フロントエンドへの進捗通知は行わない。UI 側はスピナー表示のみ）
- 設定：`appSettings.checkUpdateOnStartup`（デフォルト `true`）。`set_check_update_on_startup(enabled)` は他の `set_*` と同一パターンで実装する
- 起動時チェック（フロントエンド）：`useSettings` が公開する `settingsLoaded` フラグが `true` になった時点（＝ `get_app_settings` の初回取得完了時）で一度だけ、`appSettings.checkUpdateOnStartup` が `true` の場合のみ `useUpdater().runCheck({ silent: true })` を呼ぶ（`App.tsx` の `didStartupUpdateCheckRef` で一度きりに制御。`appSettings` は他の設定変更でも更新されるため、変更の度に再実行されないようにするため）
  - `silent: true` はチェック失敗時・「更新なし」時のダイアログ表示を抑制する（コンソールログのみ）。新しいバージョンが見つかった場合は `silent` に関わらずダイアログを表示する
- 手動チェック（トレイ）：トレイの「Check for Updates」クリックで Rust が emit する `"check-for-update-requested"` イベントを `useUpdater` が `listen` で受信し、`runCheck({ silent: false })` を呼ぶ（＝見つからなかった場合や失敗時も結果をダイアログで表示する）
- `useUpdater` フックが返す `dialog` state（`UpdateDialogState`：`checking` / `upToDate` / `error` / `available` / `installing` の判別共用体）を `UpdateDialog` コンポーネントが描画する。表示は `SystemCommandModal` と同じオーバーレイ＋カードの見た目（`absolute inset-0 bg-black/30 backdrop-blur-sm` ＋白いカード）を踏襲し、新規デザインパターンは作らない
  - `available`：新バージョン番号とリリースノート（GitHub Releases の本文をそのまま、長い場合は内部スクロール）を表示し、「後で」（ダイアログを閉じるのみ）と「今すぐ更新」（`download_and_install_update` を呼ぶ）の2ボタンを出す
  - `installing`：スピナー＋「ダウンロード中です…」「完了後、更新を適用するためアプリを再起動します。」を表示する。ダウンロード完了後は Rust 側でプロセスごと終了するため、これ以降の画面遷移は作り込まない（`invoke` が正常応答を返すことはない前提のため、成功パスの後処理コードは書かない）
  - `checking` / `upToDate` / `error` は手動チェック時のみ経由する（起動時チェックは `silent: true` のためこれらの state を経由しない）

## Tauri コマンド

| コマンド | 説明 |
| --- | --- |
| `search_files(query)` | 有効な検索フォルダ内でファイル検索結果（Windows シェルアイコンの Base64 付き）を返す |
| `launch_file(path)` | ファイルを起動する |
| `open_containing_folder(path)` | 指定パスの格納フォルダ（親フォルダ）をエクスプローラーで開く（Shift+Enter）。`path` が `.lnk` の場合はリンク先実ファイルの親フォルダを開く（解決失敗時は `.lnk` 自身の親フォルダにフォールバック） |
| `calculate(expr)` | 数式を評価し結果の文字列を返す（評価不能なら `null`） |
| `copy_to_clipboard(text)` | テキストをクリップボードへコピーする |
| `get_folders()` | 登録済み検索フォルダ一覧を返す |
| `pick_folder()` | フォルダ選択ダイアログを開き、選択パスを返す |
| `add_folder(path)` | 検索フォルダを追加する |
| `remove_folder(path)` | 検索フォルダを削除する |
| `toggle_folder(path)` | 検索フォルダの有効/無効を切り替える |
| `execute_system_command(action)` | システムコマンド（`shutdown` / `restart` / `sleep`）を実行する |
| `get_app_settings()` | ホットキー・各機能 ON/OFF（`AppSettings`）を返す |
| `set_file_search_enabled(enabled)` | ファイル検索機能の ON/OFF を切り替えて `AppSettings` を返す |
| `set_calc_enabled(enabled)` | 数式計算機能の ON/OFF を切り替えて `AppSettings` を返す |
| `set_copy_with_comma(enabled)` | 計算結果コピー時のカンマ区切り ON/OFF を切り替えて `AppSettings` を返す |
| `set_system_command_enabled(enabled)` | システムコマンド機能の ON/OFF を切り替えて `AppSettings` を返す |
| `set_system_command_keyword(command, keyword)` | `command`（`shutdown`/`restart`/`sleep`）に対応する呼び出しキーワードを変更して `AppSettings` を返す。空文字列、または他の3キーワードのいずれかと重複する場合はエラーを返して保存しない |
| `set_web_search_enabled(enabled)` | Web検索機能の ON/OFF を切り替えて `AppSettings` を返す |
| `set_clipboard_enabled(enabled)` | クリップボード履歴機能の ON/OFF を切り替えて `AppSettings` を返す |
| `set_clipboard_prefix(prefix)` | クリップボード履歴の呼び出しキーワード（`/` に続く部分）を変更して `AppSettings` を返す。空文字列、またはシステムコマンドの3キーワードのいずれかと重複する場合はエラーを返して保存しない |
| `set_clipboard_max_items(maxItems)` | クリップボード履歴の最大保持件数を変更して `AppSettings` を返す。`1` 未満はエラーを返して保存しない |
| `paste_clipboard_image(id)` | `ClipboardImageCache` から `id` に対応する画像バイナリを取得し、Win32 API でクリップボードへ直接書き込む |
| `set_recent_files_enabled(enabled)` | 最近使ったファイル一覧機能の ON/OFF を切り替えて `AppSettings` を返す |
| `set_recent_keyword(keyword)` | 最近使ったファイル一覧の呼び出しキーワード（`/` に続く部分）を変更して `AppSettings` を返す。空文字列、または他の4キーワードのいずれかと重複する場合はエラーを返して保存しない |
| `get_recent_files()` | Windows の Recent フォルダ・Office の Recent フォルダから最近使ったファイル一覧（`.lnk`/`.url` 由来、OneDrive パス解決込み）を最終アクセス日時降順で返す（最大50件） |
| `set_hotkey(accelerator)` | 起動ホットキーを変更（unregister → register）し `AppSettings` を返す。失敗時は旧ホットキーを維持しエラーを返す |
| `ocr_from_clipboard()` | クリップボードの画像を Rust 側で直接読み取り、Windows OCR API（`Windows.Media.Ocr`）でテキスト抽出して返す。日本語言語パック優先・英語フォールバック。`tauri::async_runtime::spawn_blocking` で別スレッドに逃がし COM を初期化して実行。テキスト取得は `OcrLine.Words` を個別に取得し、直前と現在の単語が両方とも ASCII 英数字のみ（`chars().all(|c| c.is_ascii_alphanumeric())`）の場合のみスペースを挿入、それ以外はスペースなしで結合（CJK 文字への不要な空白挿入を防ぐ）。行のソートは先頭ワードの `BoundingRect.Y`（`Windows.Foundation.Rect`、`"Foundation"` feature 必要）を基準に昇順ソートしてから改行結合する |
| `set_ocr_enabled(enabled)` | OCR機能の ON/OFF を切り替えて `AppSettings` を返す |
| `check_for_update()` | GitHub Releases（`latest.json`）に対してアップデートの有無を確認し、`{ available, version, notes }` を返す。見つかった更新は次の `download_and_install_update` 呼び出しに備えて Rust 側に保持する |
| `download_and_install_update()` | 保持しておいた更新をダウンロード＆インストールする。成功時は内部でアプリを終了するため呼び出し元に制御は戻らない |
| `set_check_update_on_startup(enabled)` | 起動時アップデートチェックの ON/OFF を切り替えて `AppSettings` を返す |

## フロントエンド

- `App.tsx` はルートのコンポジションのみを担う（検索/計算 UI + 設定パネルの2画面の切替、`storeRef`／`inputRef` の保持、フック間をつなぐ `handleKeyDown`・`closeSettings` 等の組み立て）。機能ごとのロジックはカスタムフックへ、UI は `components/` 配下の個別コンポーネントへ分離している
- カスタムフック（`hooks/`）
  - `useSettings(showSettings)`：`AppSettings`・検索フォルダの読み込みと各 `set_*` コマンドの呼び出し（ホットキーを除く）
  - `useHotkey(setAppSettings)`：`set_hotkey` の呼び出しとエラー状態。`useSettings` の `setAppSettings` を受け取って更新を反映する
  - `useSearch(appSettings, settingsVersion, storeRef)`：検索クエリ・計算/プレフィックスコマンド候補判定・ファイル検索・frecency（ファイル起動用・プレフィックスコマンド用の両方）・ファイル起動／コピー／Web検索を一括管理する。クリップボードモード（`clipboardMode`/`clipboardFilterText`）・最近使ったファイル一覧モード（`recentMode`/`recentFilterText`、`get_recent_files` の呼び出しとフィルタ）の判定もここで行う（クエリとプレフィックスのみに依存し、履歴データには依存しないため）
    - 選択インデックスの操作を「キーボード操作（`setSelected`）」と「マウスホバー（`selectFromHover`）」で分離している。一覧の再描画・オートスクロールでカーソル直下の行がユーザーの手を離れて入れ替わった際、その `onMouseEnter` がキーボードでの選択結果を横から上書きしてしまう不具合の対策で、以下2つの条件のいずれかに該当する `onMouseEnter` は無視する（`selectFromHover`）
      1. 直近のキーボード操作から `HOVER_SUPPRESS_AFTER_KEYBOARD_MS`（200ms）以内
      2. `onMouseEnter` 発火時点の座標が、ルートコンテナの `onMouseMove`（`recordMouseMove`。`App.tsx` から配線）で直近に記録した実際のマウス移動座標とほぼ同じ（＝カーソル自体は静止しており、再描画で該当行がたまたまカーソル直下に来ただけ）
    - 非同期呼び出し（`search_files`／`get_recent_files`）の世代 ID 管理とフォーカス回復時の再取得（`focusRegainTableRef`）はモードを横断する共通の仕組みとして「"/" プレフィックスモードの内部アーキテクチャ」節に、ウィンドウを閉じる処理（`closeWindow`）は「ウィンドウを閉じる系アクションの共通設計」節にまとめて記載している（過去の不具合の経緯を含む）。新しい "/" プレフィックスモード・ウィンドウを閉じるアクションを追加する際はそれぞれの節の規約に従うこと
    - ファイル起動やコピー等でウィンドウを閉じる直前の `setQuery("")` による空クエリへの変化でも、`fileSearchEnabled` が `true` なら通常通り `search_files("")` を呼ぶ（抑止しない）。この呼び出しは `hideWindow()` でウィンドウが非表示になった後（ユーザーからは見えない状態）に解決するため体感上のコストはなく、代わりに次に空クエリのまま再表示した際、常に最新の frecency 順一覧（通常表示）が即座に見える状態になる。かつてはこの空クエリへの変化を「ウィンドウを閉じるだけなら不要な処理」として `suppressNextSearchRef` で1回分だけ抑止していたが、抑止した分を再取得するタイミングがどこにも存在せず、次にウィンドウを再表示した時に検索結果エリアが空のまま固まって見える不具合（クエリを何か入力するまで復旧しない）を引き起こしていたため、このフラグ自体を廃止した
  - `useClipboard(appSettingsRef, clipboardMode, clipboardFilterText, storeRef, closeWindow)`：クリップボード履歴の記録・永続化・フィルタ済み一覧・書き戻し。ウィンドウを閉じる処理は `useSearch` の `closeWindow` をそのまま受け取って使う（詳細は「ウィンドウを閉じる系アクションの共通設計」節を参照）
  - `useUpdater()`：アップデートダイアログの状態（`checking`/`upToDate`/`error`/`available`/`installing`）管理、`check_for_update`/`download_and_install_update` の呼び出し、トレイ発の `"check-for-update-requested"` イベントの受信（詳細は「自動アップデート機能」節を参照）
  - フック間で共有する `Store` インスタンス（`storeRef`）は `App.tsx` が一度だけ読み込み、`useSearch`／`useClipboard` には参照を渡すのみ（frecency・clipboardHistory の初期値も `App.tsx` の読み込み完了時に各フックの `setInitial*` で反映する）
- コンポーネント（`components/`）は表示と props 経由のイベント通知のみを担い、Tauri コマンドや永続化には直接アクセスしない（すべて `App.tsx` がフックの戻り値を props として渡す）
- 検索/計算 UI のキーボード操作：↑↓ 選択、Enter で起動 or コピー、Shift+Enter で選択中のファイル（通常のファイル検索結果／`/recent` のみ対象）の格納フォルダを開く、Esc で非表示、`Ctrl+S` で設定パネルを開く、`Ctrl+D` でクエリを全クリア（詳細は次項）
- `Ctrl+D`：`Ctrl+S`（設定パネルの開閉トグル）と同じ `window` への `keydown` イベントリスナー（`App.tsx`、`useEffect`）で一括処理する（input のローカルハンドラだと WebView2 のブラウザ既定動作の影響で発火しないことがあるため、という理由も `Ctrl+S` と共通）。OCR プレビュー表示中（`ocrActive`）は「閉じる」ボタンと全く同じハンドラ（`handleOcrClose`）をそのまま呼び出し、それ以外の全モードでは現在のモードに関わらず `search.setQuery("")` でクエリを完全に空文字へ戻す（ウィンドウは閉じないため `closeWindow()` は経由しない。`closeRefreshTick` の加算も不要：`query` 自体が変化するため検索用 `useEffect` は通常通り再トリガーされる）。設定パネル表示中（`showSettings`）は対象外とする
- クリップボード履歴モードのときのみ、検索結果リストの右側に詳細パネルを表示する2カラムレイアウトになる（他のモードは単一カラムのまま。詳細は「クリップボード履歴」節を参照）
- OCR プレビュー表示中（`ocrLoading || ocrText !== null || ocrError !== null`）は検索結果エリア（`ResultList` / `ClipboardPanel`）と `StatusFooter` を非表示にする。検索ロジック自体は動作し続け、クエリや内部 state には影響しない。`App.tsx` で `ocrActive` を導出し、条件付きレンダリングで制御する
- `OcrPreview` の「閉じる」「コピーして閉じる」ボタンはそれぞれ独立したコールバック（`onClose` / `onCopyAndClose`）を `App.tsx` から受け取り、ボタン内部では invoke やウィンドウ制御を行わない（表示専用コンポーネントの原則を維持するため）
  - 「閉じる」（`onClose` = `handleOcrClose`）：`ocr.clearOcr()` で OCR state をリセットしたうえで、`requestAnimationFrame` 経由で `inputRef.current?.focus()` を呼び検索ボックスへフォーカスを戻す（`SearchBox` は `ocrActive` に関わらず常にマウントされているため、フォーカス移動のみで足りる）
  - 「コピーして閉じる」（`onCopyAndClose` = `handleOcrCopyAndClose`）：`copy_to_clipboard` invoke → ルートコンテナに `ocrClosing` state で opacity 0 へのフェードアウト（Tailwind `transition-opacity duration-[180ms]`、180ms はホットキー等による他の非表示処理とは別に、この操作専用の視覚効果として追加するもの）を適用 → 180ms 待機後に `hideWindow()` → `ocrClosing` を戻しつつ `ocr.clearOcr()` で state をリセットする。ホットキー再表示やフォーカスアウトによる非表示にはこのフェードは適用しない（既存の即時 `hide()` のまま）
  - いずれの経路でも `ocr.clearOcr()` を通るため、次回ウィンドウ表示時は `ocrActive` が `false`（通常の検索画面）に戻っている
- `OcrPreview` は `flex-1` でウィンドウ残高を占有する（検索ボックスの直下からウィンドウ下端まで全高を使う）。テキスト表示時はテキストエリアを `flex-1 min-h-0 overflow-y-auto` にして内部スクロール可能にし、ボタン行は `flex-shrink-0` で下端に固定する。ローディング・エラー時はコンテンツ高さのみ使用し残高は空白になる
- 設定パネル：タブ構成（全般／ファイル検索／数式計算／システムコマンド／Web検索／クリップボード／最近使ったファイル／OCR）、`Ctrl+S` または Esc で検索 UI に戻る
- `@tauri-apps/api/core` の `invoke` で Rust コマンドを呼ぶ
- `@tauri-apps/api/event` の `listen` で Rust 側からの `clipboard-changed` / `check-for-update-requested` イベントを受信する
- `getCurrentWindow().onFocusChanged` でフォーカスアウト検知・自動非表示、フォーカスイン時の再フォーカス

## コマンド実行時の注意

- `npm run tauri dev` や `cargo build` を実行する際、`cd` で作業ディレクトリを移動する必要はない（既にプロジェクトルートが作業ディレクトリとして設定されているため）。`cd` を挟んだ複合コマンドは避け、単体のコマンドとしてそのまま実行すること

## ビルド

```bash
# Rust のみコンパイル確認
cargo build --manifest-path src-tauri/Cargo.toml

# 開発サーバー起動（フロント + Rust）
npm run tauri dev

# プロダクションビルド
npm run tauri build
```

- `npm run tauri build`（内部で `beforeBuildCommand` として `npm run build`＝`tsc && vite build` が実行される）では、`vite.config.ts` が Vite の `command === "build"` を検知して Terser minify に切り替わり、`console.debug` / `console.log` の呼び出しを自動削除する（詳細は「ログ出力方針」節を参照）。`npm run tauri dev`（Vite の `command` は `"serve"`）ではこの設定が適用されず、通常の esbuild minify のままログもそのまま残る

## テスト方針

- ビルド確認は `cargo build` で行う
- 動作確認は `npm run tauri dev` で起動して目視確認する
- `npm run tauri dev` 起動後の PowerShell + スクリーンキャプチャによる自動 GUI テストは実施しない

## リリース手順

詳細な手順（バージョン bump → 署名付きビルド → `latest.json` 生成 → リリースノート更新 → git commit/tag/push → `gh release create` → アセットアップロード、およびリリース後の動作確認チェックリスト）は `.claude/skills/release-flow/SKILL.md` を参照。「リリースして」「新バージョンを公開して」等の依頼時はこのスキルを使う。

## WinGetパッケージの新バージョン申請手順

既存パッケージ（`hidecode365.WinLauncher`）へのバージョン追加（update申請）の手順。初回の新規パッケージ申請（new）とは別の手順。

1. `gh release view <tag> --repo hidecode365/win-launcher --json assets` でリリースアセット一覧を取得し、インストーラー（`.exe`）のダウンロード URL を確認する（`.sig`・`latest.json`・`.msi` は申請に使わない。既存マニフェストが `.exe`（nullsoft）のみ登録のため、`.msi` を追加すると `wingetcreate update` がインストーラー URL 数の不一致でエラーになる。既存マニフェストのインストーラー種別・数は `winget show hidecode365.WinLauncher` で事前に確認できる）
2. `wingetcreate update hidecode365.WinLauncher --version <バージョン> --urls <exeのURL>` を（`--submit` なしで）実行し、ローカルにマニフェスト（`manifests/h/hidecode365/WinLauncher/<バージョン>/` 配下に3ファイル）を生成する
3. 生成された `*.locale.en-US.yaml` の `Documentations`（Wiki リンク）を削除する。このリポジトリに Wiki ページが存在せずリンク切れになるため
4. 内容を確認したうえで `wingetcreate submit "manifests/h/hidecode365/WinLauncher/<バージョン>"` でPRを提出する（ローカルで編集済みのマニフェストをそのまま送るため、`update --submit` で再実行しない）
5. `--submit`／`submit` 実行時、GitHub認証（デバイスコード）を求められる場合がある（過去の認証がキャッシュされていれば省略されることもある）。求められた場合は表示されたコードとURLをユーザーに案内し、ブラウザでの認証完了を待つ
6. 提出後に表示されるPR URL（`https://github.com/microsoft/winget-pkgs/pull/<番号>`）をユーザーに報告する
7. `wingetcreate` はカレントディレクトリ（このリポジトリのルート）配下に `manifests/h/hidecode365/WinLauncher/<バージョン>/` を生成する。過去の初回申請（v0.1.0）分はこのリポジトリに `git add` 済みでコミット履歴に残っているため、後始末で削除する際は **新しく生成した対象バージョンのフォルダのみ**を指定して削除すること（`manifests/` ディレクトリ全体を `rm -rf` すると、コミット済みの過去バージョン分まで巻き込んで削除してしまう）。削除前に `git status` で意図した範囲だけが untracked になっているか必ず確認する

## リリースダウンロード数の確認

`tools/check-download-stats.ps1` は GitHub Releases の各バージョンについて `.exe`/`.msi` のダウンロード数を集計・表示する PowerShell スクリプト。`.sig` ファイル・`latest.json` は WinGet 審査パイプライン等のアクセスがノイズとして混入するため集計対象から除外している。
