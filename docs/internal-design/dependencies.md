# 依存ライブラリ・プラグインの選定理由

対象: `package.json`、`src-tauri/Cargo.toml`。バージョン一覧そのもの（表）は CLAUDE.md「技術スタック」節・「Tauri プラグイン」節を参照。本ファイルはバージョン更新や選定に至った理由・経緯のみを記す。

## 現在の設計

<a id="dependency-update-status"></a>

### 依存バージョンの更新状況

- `vite`：5系から `6.4.3` へ更新済み（`package.json` は `^6.4.3` 固定）
- `esbuild`（`vite` の間接依存）：`0.25.12` に更新済み
- `@vitejs/plugin-react`：`4.7.0` のまま据え置き（追加の更新なし）
- `glib`（Rust、`src-tauri/Cargo.lock` 上の間接依存。Windows ビルドでは未使用）：Dependabot が medium 指摘を出しているが、`tauri` が要求する `gtk 0.18.2` に固定されているため単独更新不可。`tauri` 本体の上流アップデート待ちで保留中

<a id="dialog-plugin-parent-window"></a>

### `tauri-plugin-dialog` は必ず Rust 側の Tauri コマンドとして実装する

フォルダ選択ダイアログには `tauri-plugin-dialog` を使うが、**必ず Rust 側の Tauri コマンド（`pick_folder`）として実装し、`FileDialogBuilder::set_parent` で WinLauncher のウィンドウを親に指定すること。** フロントエンドの JS API（`@tauri-apps/plugin-dialog` の `open()`/`save()`/`message()` 等）には親ウィンドウを指定する手段がなく、`alwaysOnTop: true` のウィンドウの背後にダイアログが回り込んでしまう不具合になる（実際に発生し修正済み。詳細は「経緯」節を参照）。本プロジェクトでは `@tauri-apps/plugin-dialog` は npm 依存にも加えておらず、フロントエンドから直接ダイアログ系 JS API を呼ぶ経路は存在しない。

<a id="plugin-list-rationale"></a>

### 各プラグインの用途と選定理由

| プラグイン | 用途・選定理由 |
| --- | --- |
| `tauri-plugin-global-shortcut` | グローバルホットキー（起動ホットキー） |
| `tauri-plugin-shell` | ファイル起動・Web検索の URL をデフォルトブラウザで開く（`open()`） |
| `tauri-plugin-autostart` | Windows スタートアップ登録 |
| `tauri-plugin-store` | 検索フォルダ・各機能 ON/OFF・ホットキー設定・ウィンドウサイズ・frecency 履歴の永続化（`settings.json`）。frecency 履歴・ウィンドウサイズ等はフロントエンドが JS パッケージ `@tauri-apps/plugin-store` で直接読み書きする |
| `tauri-plugin-dialog` | フォルダ選択ダイアログ（[dialog-plugin-parent-window](#dialog-plugin-parent-window) の制約に従う） |
| `tauri-plugin-clipboard-manager` | 計算結果のクリップボードコピー（Rust コマンド経由）。クリップボード履歴機能ではフロントエンドが JS パッケージで直接 `readText`/`readImage`/`writeImage` を呼ぶ |
| `tauri-plugin-process` | アプリケーションの再起動（`relaunch`） |
| `tauri-plugin-updater` | 自動アップデート（GitHub Releases + `latest.json`） |
| `tauri-plugin-notification` | パス貼り付けによる検索フォルダ管理の完了時トースト通知（サーバーレス・無料方針に合致し、外部サービス連携なしで導入できるため採用。詳細は [path-paste.md](path-paste.md#toast-notification) を参照） |
| `tauri` (tray-icon feature) | システムトレイ常駐 |

<a id="windows-api-first-policy"></a>

### サードパーティクレートより Windows 標準 API を優先する方針

本プロジェクトは `ShellExecuteW`・`SHGetFileInfoW`・クリップボードの Win32 API 直接操作・OCR の WinRT 直呼び出し・`.lnk` 作成の `IShellLinkW`/`IPersistFile` 直接呼び出しなど、随所で「サードパーティ再実装に頼らず Windows 標準 API を直接呼ぶ」方針を採っている。`mslnk` クレートから `IShellLinkW` への切り替え（詳細は [path-paste.md](path-paste.md#mslnk-to-shell-link-history) を参照）はこの方針が実際に問題を回避した具体例である。新しい Windows 固有機能を実装する際、まずサードパーティクレートに便利な実装がないか探すより先に、標準 API で直接実装できないかを検討すること。

## 経緯

<a id="dialog-always-on-top-bug"></a>

### `alwaysOnTop` ウィンドウの背後にダイアログが回り込むバグ

フロントエンドの JS API（`@tauri-apps/plugin-dialog` の `open()` 等）でフォルダ選択ダイアログを呼び出したところ、`alwaysOnTop: true` の WinLauncher ウィンドウの背後にダイアログが表示され、ユーザーから見えない状態になる不具合が発生した。JS API には親ウィンドウを指定する手段がなく、OS のウィンドウ管理上どのウィンドウの子として扱われるかを制御できないことが原因だった。Rust 側の Tauri コマンドとして実装し直し、`FileDialogBuilder::set_parent` で明示的に WinLauncher のウィンドウを親に指定することで解消した。この経緯から、以後 `@tauri-apps/plugin-dialog` は npm 依存にも加えず、フロントエンドから直接ダイアログ系 JS API を呼ぶ経路自体を作らない方針にしている。

## 今後の指針

- 新しいダイアログ・ポップアップ的な UI を Tauri プラグインで実装する場合、`alwaysOnTop: true` のメインウィンドウとの重なりが問題にならないか必ず確認する。フロントエンドの JS API に親ウィンドウ指定の手段がない場合は Rust 側の Tauri コマンドとして実装し直す
- Windows 固有の機能を実装する際は、まず Windows 標準 API（Win32 / WinRT / COM）で直接実装できないかを検討し、サードパーティクレートは標準 API での実装が著しく煩雑になる場合の代替手段として扱う
- 依存の更新保留（`glib` 等）は、保留理由（上流の制約）を明記したまま残す。理由を書かずに「保留中」とだけ記録しない
