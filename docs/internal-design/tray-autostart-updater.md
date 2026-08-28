# システムトレイ・自動起動・自動アップデート

対象コード: `src-tauri/src/main.rs`（トレイメニュー構築、`tauri-plugin-autostart`、`check_for_update`／`download_and_install_update`）、`src/hooks/useUpdater.ts`、`src/components/UpdateDialog.tsx`。

いずれもアプリのライフサイクル（常駐・起動時動作・更新）に関わる小粒な機能のため1ファイルにまとめている。

## 現在の設計

<a id="system-tray"></a>

### システムトレイ

Tauri v2 の `tray-icon` 機能を使用。トレイアイコンは `icons/32x32.png`（`npm run tauri icon` で生成されるアプリアイコン）を `include_bytes!` でコンパイル時に埋め込み、`image` クレートで RGBA にデコードして使用する（`include_bytes!` はファイル内容をビルドの依存関係として記録するため、アイコン差し替え後は次の `cargo build` で自動的に再コンパイルされる）。

トレイメニューの項目構成（この順で配置）：

- 「Show WinLauncher」：**メニュー項目のクリックは常に**ウィンドウ表示（`window.center()` → `show()` → `set_focus()`）。**トレイアイコン本体への左クリックはこれとは別処理**で、`on_tray_icon_event`が`window.is_visible()`を見て、表示中なら`"request-hide"`イベントをフロントエンドへemitして隠し（`App.tsx`が受信し`hideWindow()`を呼ぶ）、非表示中のみメニュー項目と同じ表示処理を行うトグル動作
- 「Check for Updates」：ウィンドウを表示（メニュー項目「Show WinLauncher」と同じ）したうえで `"check-for-update-requested"` イベントを emit する。実際のチェック処理はフロントエンド（`useUpdater`）が行う
- 「Start with Windows」：チェック付きメニュー項目。現在の自動起動状態を反映し、クリックで `tauri-plugin-autostart` の有効/無効をトグルしてチェック状態を更新
- 「Restart」：`app.request_restart()`（`tauri-plugin-process` プラグイン登録後に `AppHandle` が持つメソッド）でアプリケーションを再起動する
- 「Quit」：`app.exit(0)` でアプリケーションを終了する

ツールチップは `"WinLauncher — {hotkey}"` 形式（`{hotkey}` は `appSettings.hotkey`）。

- トレイは `TrayIconBuilder::with_id("main-tray")` で構築するため、`app.tray_by_id("main-tray")` で後から `TrayIcon` ハンドルを取得できる
- アプリ起動時（`setup`）：登録した起動ホットキー文字列（パース失敗時はデフォルトへフォールバック後の値）でツールチップを組み立てて `.tooltip(...)` に渡す
- ホットキー変更成功直後のツールチップ即時更新は [window-and-hotkey.md](window-and-hotkey.md#hotkey-registration) を参照

<a id="autostart"></a>

### 自動起動

`tauri-plugin-autostart` でレジストリ登録。起動時に `is_enabled()` で現在の状態を取得し、トレイメニューのチェック状態に反映する。トレイメニューの「Start with Windows」クリックで `enable()` / `disable()` をトグルする。

<a id="auto-update"></a>

### 自動アップデート機能（Rust / フロントエンド）

`tauri-plugin-updater` を使用。配信方式は GitHub Releases + 静的 `latest.json`（`tauri.conf.json` の `plugins.updater.endpoints` に URL を設定）。

- 署名鍵は `tauri signer generate`（minisign 方式）で生成し、秘密鍵は `src-tauri/keys/`（`.gitignore` 対象、コミットしない）に保存する。公開鍵（`.pub` ファイルの中身をそのまま）を `tauri.conf.json` の `plugins.updater.pubkey` に設定する
- `tauri.conf.json` の `plugins.updater.windows.installMode` は `"passive"`（進捗バーのみ表示する無人インストール）
- `tauri.conf.json` の `bundle.createUpdaterArtifacts: true` により、`npm run tauri build` 時に NSIS インストーラー本体（`.exe`）に対して署名済み `.exe.sig` が直接生成される（現行の `@tauri-apps/cli` v2 は Windows 向け updater アーティファクトとして zip ラッピングを行わない）。この成果物から `latest.json` を生成し GitHub Releases へアップロードするリリース手順の詳細は `.claude/skills/winlauncher-ad/references/process/ad_app_600_release.md` を参照

**Rust コマンド**：

- `check_for_update()`：`app.updater().check()` を呼び、`{ available, version, notes }`（`UpdateCheckResult`）を返す。見つかった `tauri_plugin_updater::Update` は次の `download_and_install_update` 呼び出しに備えて `PendingUpdate`（`Mutex<Option<Update>>`、`app.manage()` で管理）に保持する（再チェックを避けるため）
- `download_and_install_update()`：`PendingUpdate` から取り出した `Update` の `download_and_install()` を呼ぶ。Windows 実装は内部でダウンロード完了後にインストーラーを起動し `std::process::exit(0)` でプロセスごと終了するため、成功時はこの呼び出しから制御が戻らない（＝フロントエンドの `invoke` の Promise は解決されない）
- `on_before_exit` フックは明示的な上書きを行わない。`UpdaterExt::updater_builder()`（`app.updater()` の内部実装）が既定で `AppHandle::cleanup_before_exit()` を呼ぶよう配線済みであり、これがトレイアイコン・各ウィンドウ・リソーステーブルの後片付けを行う。個別のトレイ後片付けコードは不要と判断した
- ダウンロード進捗のコールバック（`on_chunk`/`on_download_finish` 引数）は no-op（フロントエンドへの進捗通知は行わない。UI 側はスピナー表示のみ）

**設定**：`appSettings.checkUpdateOnStartup`（デフォルト `true`）。`set_check_update_on_startup(enabled)` は他の `set_*` と同一パターンで実装する。

**起動時チェック（フロントエンド）**：`useSettings` が公開する `settingsLoaded` フラグが `true` になった時点（＝ `get_app_settings` の初回取得完了時）で一度だけ、`appSettings.checkUpdateOnStartup` が `true` の場合のみ `useUpdater().runCheck({ silent: true })` を呼ぶ（`App.tsx` の `didStartupUpdateCheckRef` で一度きりに制御）。`silent: true` はチェック失敗時・「更新なし」時のダイアログ表示を抑制する（コンソールログのみ）。新しいバージョンが見つかった場合は `silent` に関わらずダイアログを表示する。

**手動チェック（トレイ）**：トレイの「Check for Updates」クリックで Rust が emit する `"check-for-update-requested"` イベントを `useUpdater` が `listen` で受信し、`runCheck({ silent: false })` を呼ぶ（＝見つからなかった場合や失敗時も結果をダイアログで表示する）。

**ダイアログ**：`useUpdater` フックが返す `dialog` state（`UpdateDialogState`：`checking` / `upToDate` / `error` / `available` / `installing` の判別共用体）を `UpdateDialog` コンポーネントが描画する。表示は `SystemCommandModal` と同じオーバーレイ＋カードの見た目（`absolute inset-0 bg-black/30 backdrop-blur-sm` ＋白いカード）を踏襲し、新規デザインパターンは作らない。

- `available`：新バージョン番号とリリースノート（GitHub Releases の本文をそのまま、長い場合は内部スクロール）を表示し、「後で」（ダイアログを閉じるのみ）と「今すぐ更新」（`download_and_install_update` を呼ぶ）の2ボタンを出す
- `installing`：スピナー＋「ダウンロード中です…」「完了後、更新を適用するためアプリを再起動します。」を表示する。ダウンロード完了後は Rust 側でプロセスごと終了するため、これ以降の画面遷移は作り込まない
- `checking` / `upToDate` / `error` は手動チェック時のみ経由する（起動時チェックは `silent: true` のためこれらの state を経由しない）

## 経緯

このファイルの内容は現時点で仕様説明が中心で、大きな設計転換や却下案の記録は無い。今後、トレイメニュー項目の再編・アップデート配信方式の変更等があった場合はここに追記する。

## 今後の指針

- トレイメニューに新しい項目を追加する場合、既存の並び順（Show → Check for Updates → Start with Windows → Restart → Quit）を踏まえた位置に追加する
- アップデートダイアログの新しい状態を追加する場合、`SystemCommandModal` と同じオーバーレイ＋カードのデザインパターンを踏襲し、新規デザインパターンを作らない
- ダウンロード完了後にプロセスが終了する（`download_and_install_update` から制御が戻らない）という前提は変わらないため、この呼び出しの後続処理を書き足さない
