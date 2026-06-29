# WinLauncher — 設計方針

## 開発フロー

要件を変更する場合は、以下の順序で進めること。

1. **`REQUIREMENTS.md` の修正**（基本的にユーザが行う）
2. **本ファイル（`CLAUDE.md`）の設計方針の修正**（要件変更を踏まえてアーキテクチャ・技術選定・挙動仕様を更新）
3. **ソースコードの改修**（更新後の設計方針に基づいて実装）

ソースを直接変更する前に、変更内容が要件・設計方針と矛盾しないか確認し、矛盾があれば先に `CLAUDE.md` を更新してから着手する。

### 要件差分の検出（スナップショット運用）

ユーザが「要件を変更したので改修して」のように具体的な変更内容を示さず指示してくる場合があるため、
直前の改修完了時点の `REQUIREMENTS.md` を `.claude/REQUIREMENTS.snapshot.md` に保持しておく。

- **改修開始時**：`REQUIREMENTS.md` と `.claude/REQUIREMENTS.snapshot.md` を diff し、変更箇所を特定してから着手する
- **改修完了時**：現在の `REQUIREMENTS.md` の内容を `.claude/REQUIREMENTS.snapshot.md` に上書きコピーし、次回の差分検出に備える
- スナップショットが存在しない、または diff が取れない場合は `REQUIREMENTS.md` 全体を読み直して要件を再確認する

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
│   │   └── useClipboard.ts   # クリップボード履歴の記録・永続化・呼び出し
│   ├── components/
│   │   ├── SearchBox.tsx           # 検索入力欄（ドラッグ領域・歯車ボタン含む）
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
│   │   └── ClipboardSettings.tsx   # クリップボードタブ
│   └── styles.css
├── src-tauri/
│   ├── src/main.rs         # Rust バックエンド（全ロジック）
│   ├── capabilities/
│   │   └── default.json    # Tauri v2 権限設定
│   ├── icons/               # トレイ/アプリアイコン
│   ├── Cargo.toml
│   ├── build.rs
│   └── tauri.conf.json
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

### 設定画面（Rust / フロントエンド）

- 設定パネルは左にカテゴリナビ（全般／ファイル検索／数式計算／システムコマンド／Web検索／クリップボード）、右に選択中カテゴリの内容を表示するタブ構成（`SettingsPanel` 内でタブ選択状態をローカル `useState` 管理）
- 設定パネルは検索ボックス右の歯車アイコンのクリック、または `Ctrl+S` でトグル開閉する（検索 UI 表示中なら開く、設定パネル表示中なら閉じる）
- 設定パネル表示中は `Ctrl+S` または `Esc` のどちらでも検索 UI に戻る
- `Ctrl+S` の開閉トグルは input 要素のローカル `onKeyDown` ではなく、`window` への `keydown` イベントリスナー（`useEffect`）で一括処理する
  - input のローカルハンドラに持たせると、WebView2 のフォーカス状態や Ctrl+S の既定動作（ページ保存）の影響で発火しないことがあるため
- 設定変更後（パネルを閉じた時点）に検索結果を再評価する
- 永続化は `tauri-plugin-store` の `settings.json` に集約する
  - `folders: { path, enabled }[]`（ファイル検索カテゴリの検索フォルダ一覧）
  - `appSettings: { hotkey, fileSearchEnabled, calcEnabled, systemCommandEnabled, webSearchEnabled, copyWithComma, clipboardEnabled, clipboardPrefix, clipboardMaxItems }`（全般のホットキー、各機能の ON/OFF、計算結果コピー時のカンマ区切り、クリップボード履歴の呼び出しプレフィックスと最大件数。ON/OFF はデフォルト全て `true`、`hotkey` のデフォルトは `Alt+Space`、`clipboardPrefix` のデフォルトは `"cb"`、`clipboardMaxItems` のデフォルトは `50`）
  - `frecency: { [path]: { count, lastUsed } }`（ファイル起動履歴。設定画面には表示せず、フロントエンドが JS の plugin-store API で直接読み書きする。詳細は「ファイル検索結果の frecency ランキング」節を参照）
  - `clipboardHistory: ClipboardTextEntry[]`（クリップボードのテキスト履歴。設定画面には表示せず、フロントエンドが JS の plugin-store API で直接読み書きする。画像エントリは含まない。詳細は「クリップボード履歴」節を参照）
  - `windowSize: { width, height }`（ウィンドウサイズ、論理ピクセル。設定画面には表示せず、フロントエンドが JS の plugin-store API で直接書き込み、Rust 側が起動時に読み込んで適用する。詳細は「ウィンドウ」節を参照）
  - `clipboardPaneWidth: number`（クリップボード履歴パネルの左ペイン幅、px。設定画面には表示せず、フロントエンドが JS の plugin-store API で直接読み書きする。ドラッグ終了時（mouseup）およびフォーカスアウト時（blur）に保存する。Rust コマンドは追加しない）
- 各カテゴリの内容
  - **全般**：起動ホットキーの表示・変更（修飾キーのチェックボックス＋通常キーのプルダウン。「グローバルホットキー」節を参照）
  - **ファイル検索**：機能 ON/OFF トグル＋検索フォルダの追加（`tauri-plugin-dialog` のフォルダ選択）・有効/無効トグル・削除（既存の検索フォルダ管理 UI をこのタブ配下に配置）
  - **数式計算**：機能 ON/OFF トグル＋クリップボードコピー時のカンマ区切り ON/OFF トグル（「計算結果をカンマ区切りでコピー」。「計算機能」節を参照）
  - **システムコマンド**：機能 ON/OFF トグルのみ
  - **Web検索**：機能 ON/OFF トグルのみ（「Web検索機能」節を参照）
  - **クリップボード**：機能 ON/OFF トグル＋呼び出しプレフィックスのテキスト入力＋最大保持件数の数値入力（「クリップボード履歴」節を参照）
- 各 ON/OFF トグル・設定値は Rust コマンド（`set_file_search_enabled` / `set_calc_enabled` / `set_system_command_enabled` / `set_web_search_enabled` / `set_copy_with_comma` / `set_clipboard_enabled` / `set_clipboard_prefix` / `set_clipboard_max_items`）で即時保存し、フロントエンドはレスポンスの `AppSettings` で state を更新する
- フロントエンドは `appSettings` をアプリ起動時（マウント時）に `get_app_settings` で取得し、検索 UI 側のモード判定（計算モード／システムコマンドモード／ファイル検索／Web検索行の表示／クリップボード履歴モード）に反映する。OFF の機能は対応する Tauri コマンド（`calculate` / `search_files`、システムコマンドの候補表示、Web検索行の表示、クリップボード履歴モードへの切替）自体を呼び出さない・表示しない

### 計算機能（Rust / フロントエンド）

- `appSettings.calcEnabled` が `false` の場合、入力内容に関わらず計算モードへ切り替えない（`calculate` コマンドも呼ばない）
- `calcEnabled` が `true` のとき、入力文字列が数字と演算子（`+ - * /`）を含む場合に自動で計算モードへ切り替え
- Rust 側で四則演算（優先順位対応の再帰下降パーサ）を評価し、結果をリアルタイム表示
- 表示は常にカンマ区切り。Enter でクリップボードにコピーしてウィンドウを閉じる
  - コピー時にカンマ区切りを含めるかは `appSettings.copyWithComma`（デフォルト `true`）に従う。フロントエンドはこの値を見て `formatWithCommas` を適用するかをコピー直前に切り替える（画面表示用のフォーマットとは独立した分岐）
  - `set_copy_with_comma(enabled)`（Rust コマンド）は他の機能 ON/OFF トグル（`set_calc_enabled` 等）と同一のパターン（`load_app_settings` → フィールド更新 → `save_app_settings` → 更新後の `AppSettings` を返す）で実装する
- ゼロ除算・パース不能な式は結果なし（`計算できません`）として扱う

### システムコマンド機能（Rust / フロントエンド）

- `appSettings.systemCommandEnabled` が `false` の場合、システムコマンドの候補は一切表示しない（キーワード前方一致の判定自体を行わない）
- `systemCommandEnabled` が `true` のとき、検索クエリ（小文字・前後空白除去）がシステムコマンドのキーワードの前方一致になっている場合、計算モードと同様にファイル検索を行わず候補を表示する
  - `shutdown` → シャットダウン
  - `restart` / `reboot`（同一アクション） → 再起動
  - `sleep` → スリープ
- 前方一致のため、例えば `re` で「再起動」、`s` で「シャットダウン」「スリープ」の両方が候補に出る（複数候補時は ↑↓ で選択）
- フロントエンドはマッチした候補だけを通常の検索結果と同じリスト UI（↑↓ 選択）で表示する。ファイル検索（`search_files`）は呼び出さない
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

- `appSettings.webSearchEnabled` が `true` かつ検索クエリ（`query.trim()`）が1文字以上の場合、現在表示中のリスト（計算結果／システムコマンド候補／ファイル検索結果のいずれか）の末尾に「Googleで〇〇を検索」の固定行を常に追加する（〇〇は `query` そのもの）
  - ファイル検索結果が0件で「見つかりませんでした」を表示している場合も、その下に固定行を追加する
  - 通常の検索結果アイテムと区別するため、アイコンの配色（青系）と上端のボーダーで視覚的に区別する
- ↑↓ による選択のインデックス空間は「現在のモードのリスト長 + Web検索行（表示中なら 1）」を対象にする。Web検索行は常にリストの最後のインデックスになる
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
- 呼び出し（モード切替）：検索クエリが `appSettings.clipboardPrefix`（デフォルト `cb`、大小文字区別なし）に前方一致する場合にクリップボード履歴モードへ切り替える。プレフィックスに続く残り文字列は履歴のテキストエントリに対する部分一致フィルタとして使う（画像エントリはテキストを持たないため、フィルタ文字列が空でない間は一覧から除外する）
  - `appSettings.clipboardEnabled` が `false` の場合はこのモード判定自体を行わない（通常の検索/計算/システムコマンド判定にフォールバックする）
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
- 左クリック / 「Show」メニューでウィンドウ表示
- 「Quit」メニューでアプリ終了
- 「Start with Windows」をチェック付きメニュー項目として表示し、現在の自動起動状態を反映
  - クリックで `tauri-plugin-autostart` の有効/無効をトグルし、メニューのチェック状態を更新
- ツールチップは `"WinLauncher — {hotkey}"` 形式（`{hotkey}` は `appSettings.hotkey`）
  - トレイは `TrayIconBuilder::with_id("main-tray")` で構築するため、`app.tray_by_id("main-tray")` で後から `TrayIcon` ハンドルを取得できる
  - アプリ起動時（`setup`）：登録した起動ホットキー文字列（パース失敗時はデフォルトへフォールバック後の値）でツールチップを組み立てて `.tooltip(...)` に渡す
  - `set_hotkey` コマンドでホットキー変更が成功した直後、`app.tray_by_id("main-tray")` を取得して `set_tooltip(Some(...))` を呼び、新しいホットキー文字列でツールチップを即時更新する

### 自動起動

- `tauri-plugin-autostart` でレジストリ登録
- 起動時に `is_enabled()` で現在の状態を取得し、トレイメニューのチェック状態に反映
- トレイメニューの「Start with Windows」クリックで `enable()` / `disable()` をトグル

## Tauri コマンド

| コマンド | 説明 |
| --- | --- |
| `search_files(query)` | 有効な検索フォルダ内でファイル検索結果（Windows シェルアイコンの Base64 付き）を返す |
| `launch_file(path)` | ファイルを起動する |
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
| `set_web_search_enabled(enabled)` | Web検索機能の ON/OFF を切り替えて `AppSettings` を返す |
| `set_clipboard_enabled(enabled)` | クリップボード履歴機能の ON/OFF を切り替えて `AppSettings` を返す |
| `set_clipboard_prefix(prefix)` | クリップボード履歴の呼び出しプレフィックスを変更して `AppSettings` を返す。空文字列はエラーを返して保存しない |
| `set_clipboard_max_items(maxItems)` | クリップボード履歴の最大保持件数を変更して `AppSettings` を返す。`1` 未満はエラーを返して保存しない |
| `paste_clipboard_image(id)` | `ClipboardImageCache` から `id` に対応する画像バイナリを取得し、Win32 API でクリップボードへ直接書き込む |
| `set_hotkey(accelerator)` | 起動ホットキーを変更（unregister → register）し `AppSettings` を返す。失敗時は旧ホットキーを維持しエラーを返す |

## フロントエンド

- `App.tsx` はルートのコンポジションのみを担う（検索/計算 UI + 設定パネルの2画面の切替、`storeRef`／`inputRef` の保持、フック間をつなぐ `handleKeyDown`・`closeSettings` 等の組み立て）。機能ごとのロジックはカスタムフックへ、UI は `components/` 配下の個別コンポーネントへ分離している
- カスタムフック（`hooks/`）
  - `useSettings(showSettings)`：`AppSettings`・検索フォルダの読み込みと各 `set_*` コマンドの呼び出し（ホットキーを除く）
  - `useHotkey(setAppSettings)`：`set_hotkey` の呼び出しとエラー状態。`useSettings` の `setAppSettings` を受け取って更新を反映する
  - `useSearch(appSettings, settingsVersion, storeRef)`：検索クエリ・計算/システムコマンド判定・ファイル検索・frecency・ファイル起動／コピー／Web検索を一括管理する。クリップボードモードの判定（`clipboardMode`/`clipboardFilterText`）もここで行う（クエリとプレフィックスのみに依存し、履歴データには依存しないため）
  - `useClipboard(appSettingsRef, clipboardMode, clipboardFilterText, storeRef, setQuery)`：クリップボード履歴の記録・永続化・フィルタ済み一覧・書き戻し
  - フック間で共有する `Store` インスタンス（`storeRef`）は `App.tsx` が一度だけ読み込み、`useSearch`／`useClipboard` には参照を渡すのみ（frecency・clipboardHistory の初期値も `App.tsx` の読み込み完了時に各フックの `setInitial*` で反映する）
- コンポーネント（`components/`）は表示と props 経由のイベント通知のみを担い、Tauri コマンドや永続化には直接アクセスしない（すべて `App.tsx` がフックの戻り値を props として渡す）
- 検索/計算 UI のキーボード操作：↑↓ 選択、Enter で起動 or コピー、Esc で非表示、`Ctrl+S` で設定パネルを開く
- クリップボード履歴モードのときのみ、検索結果リストの右側に詳細パネルを表示する2カラムレイアウトになる（他のモードは単一カラムのまま。詳細は「クリップボード履歴」節を参照）
- 設定パネル：タブ構成（全般／ファイル検索／数式計算／システムコマンド／Web検索／クリップボード）、`Ctrl+S` または Esc で検索 UI に戻る
- `@tauri-apps/api/core` の `invoke` で Rust コマンドを呼ぶ
- `@tauri-apps/api/event` の `listen` で Rust 側からの `clipboard-changed` イベントを受信する
- `getCurrentWindow().onFocusChanged` でフォーカスアウト検知・自動非表示、フォーカスイン時の再フォーカス

## ビルド

```bash
# Rust のみコンパイル確認
cd src-tauri && cargo build

# 開発サーバー起動（フロント + Rust）
npm run tauri dev

# プロダクションビルド
npm run tauri build
```

## テスト方針

- ビルド確認は `cargo build` で行う
- 動作確認は `npm run tauri dev` で起動して目視確認する
- `npm run tauri dev` 起動後の PowerShell + スクリーンキャプチャによる自動 GUI テストは実施しない
