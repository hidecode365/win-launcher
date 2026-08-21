#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet, VecDeque};
use std::path::Path;
use std::str::FromStr;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, OnceLock};
use tauri::{
    image::Image,
    menu::{CheckMenuItemBuilder, MenuBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, LogicalSize, Manager,
};
use tauri_plugin_autostart::ManagerExt;
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};
use tauri_plugin_notification::NotificationExt;
use tauri_plugin_store::StoreExt;
use tauri_plugin_updater::UpdaterExt;
use walkdir::WalkDir;

mod path_paste;
mod recent_files;

const SETTINGS_STORE: &str = "settings.json";
const DEFAULT_HOTKEY: &str = "Alt+Space";
const DEFAULT_SHUTDOWN_KEYWORD: &str = "shutdown";
const DEFAULT_RESTART_KEYWORD: &str = "restart";
const DEFAULT_SLEEP_KEYWORD: &str = "sleep";
const DEFAULT_CLIPBOARD_PREFIX: &str = "cb";
const DEFAULT_CLIPBOARD_MAX_ITEMS: u32 = 50;
const DEFAULT_RECENT_KEYWORD: &str = "recent";
const DEFAULT_FAVORITE_KEYWORD: &str = "favorite";
const DEFAULT_MEMO_KEYWORD: &str = "memo";
// 最近使ったファイル一覧専用の保持期間（日数）・表示件数上限のデフォルト値。
// いずれも設定画面から変更可能（`AppSettings.recent_max_age_days` /
// `recent_max_results`）。
const DEFAULT_RECENT_MAX_AGE_DAYS: u32 = 180;
const DEFAULT_RECENT_MAX_RESULTS: u32 = 50;
const CLIPBOARD_THUMBNAIL_MAX_WIDTH: u32 = 320;
// ファイル検索結果の表示件数上限。
const MAX_SEARCH_RESULTS: usize = 50;

// アプリ専用のログ用ディレクトリ（`app_log_dir()`）配下に置くログファイル名。
const RECENT_DEBUG_LOG_FILENAME: &str = "recent_debug.log";
const PANIC_LOG_FILENAME: &str = "panic.log";
// panic.log の肥大化防止用サイズ上限。これを超えていたら書き込み前にクリアする。
const PANIC_LOG_MAX_BYTES: u64 = 5 * 1024 * 1024;
// 400_テスト・バグ修正：システムコマンド確認モーダルのEnter二重keydown調査用の
// 暫定調査ログファイル名（log_ui_event を参照）。原因特定・暫定対処後も、恒久的な
// 構造化ログ機能（別途100〜200工程で着手予定）の参考実装として意図的に残して
// いる。詳細は src/lib/uiDebugLog.ts のコメントを参照。
const UI_DEBUG_LOG_FILENAME: &str = "ui_debug.log";

/// クリップボード変更通知用のウィンドウサブクラスプロシージャ（`extern "system"`）は
/// クロージャで `AppHandle` を捕捉できないため、`setup()` で一度だけ設定したハンドルを
/// ここから取得する。
static APP_HANDLE: OnceLock<AppHandle> = OnceLock::new();

/// アプリ専用のログ用ディレクトリ（`tauri::path::PathResolver::app_log_dir()`）を
/// `setup()` 内（`init_log_dir` 呼び出し時）に一度だけ解決してキャッシュする。
/// `log_debug`/パニックフックは `AppHandle` を経由せずここから読む。
static LOG_DIR: OnceLock<std::path::PathBuf> = OnceLock::new();

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// アプリ専用のログ用ディレクトリを解決し（存在しなければ作成し）、`LOG_DIR` に
/// キャッシュする。あわせて `recent_debug.log` を新規作成（＝前回起動分を上書き）する。
/// `setup()` 内で一度だけ呼び出すこと。解決・作成に失敗した場合は `LOG_DIR` を未設定の
/// ままにする（以降 `log_debug`/パニックフックは静かに no-op になる。パニックしない）。
fn init_log_dir(app: &tauri::App) {
    let Ok(dir) = app.path().app_log_dir() else {
        return;
    };
    if std::fs::create_dir_all(&dir).is_err() {
        return;
    }
    let _ = std::fs::OpenOptions::new()
        .create(true)
        .write(true)
        .truncate(true)
        .open(dir.join(RECENT_DEBUG_LOG_FILENAME));
    // 400_テスト・バグ修正：ui_debug.log も同様に起動のたびに新規作成し、前回起動分の
    // ログと混ざらないようにする（log_ui_event を参照）。
    let _ = std::fs::OpenOptions::new()
        .create(true)
        .write(true)
        .truncate(true)
        .open(dir.join(UI_DEBUG_LOG_FILENAME));
    let _ = LOG_DIR.set(dir);
}

/// 調査用のデバッグログを安全に書き出す。`eprintln!` は書き込み失敗時に内部で
/// `.expect()` 相当の処理を行いパニックする仕様があり、トレイからの再起動後など
/// stderr の書き込み先を失った状態でこれが連鎖し、`catch_unwind` で保護できない
/// WebView2 のコールバック境界内でプロセス全体を巻き込んで強制終了した実績がある。
/// そのためファイル書き込みの失敗（`Result`）は握りつぶし、絶対にパニックしない
/// （`unwrap()`/`expect()` は使わない）。`LOG_DIR` が未解決の場合は何もしない。
/// `recent_debug.log` は起動のたびに `init_log_dir` が新規作成するため、ここでは
/// 追記のみを行う。
fn log_debug(msg: &str) {
    let Some(dir) = LOG_DIR.get() else {
        return;
    };
    let Ok(mut file) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(dir.join(RECENT_DEBUG_LOG_FILENAME))
    else {
        return;
    };
    use std::io::Write;
    let _ = writeln!(file, "[{}] {msg}", now_ms());
}

/// 400_テスト・バグ修正：システムコマンド確認モーダルのEnter二重keydown調査用の
/// 暫定調査ログコマンド。`log_debug` と異なり、書き込み後に `file.sync_all()`
/// （fsync）を呼んでから戻る。フロントエンド側はこの invoke の Promise を必ず
/// `await` し、その後にのみ `execute_system_command` を発火させることで、
/// 「OS操作（シャットダウン/再起動/スリープ）の発火前にログのディスク書き込みが
/// 完了していること」を保証する。原因特定・暫定対処後もこの計測自体は、恒久的な
/// 構造化ログ機能（別途100〜200工程で着手予定）の参考実装として意図的に残して
/// いる。詳細は src/lib/uiDebugLog.ts のコメントを参照。
#[tauri::command]
fn log_ui_event(line: String) -> Result<(), String> {
    let dir = LOG_DIR
        .get()
        .ok_or_else(|| "log dir not initialized".to_string())?;
    let mut file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(dir.join(UI_DEBUG_LOG_FILENAME))
        .map_err(|e| e.to_string())?;
    use std::io::Write;
    writeln!(file, "[{}] {line}", now_ms()).map_err(|e| e.to_string())?;
    file.sync_all().map_err(|e| e.to_string())?;
    Ok(())
}

/// パニック発生時の情報を、アプリ専用ログディレクトリ（`LOG_DIR`）配下の `panic.log` に
/// 追記するフックを登録する。バックトレースは `RUST_BACKTRACE` 環境変数に関わらず
/// `force_capture` で無条件に取得する。デフォルトのフック（stderr 出力）は維持した
/// うえで追加で呼び出す。
///
/// `LOG_DIR` は `setup()` 内の `init_log_dir` でしか解決できない（`app_log_dir()` が
/// `AppHandle`/`App` を要求するため）。そのためこの関数自体も `setup()` 内、
/// `init_log_dir` の直後に呼び出すこと。これより前（プラグイン登録処理など）で
/// 発生したパニックは記録できない点に留意する。
fn install_panic_hook() {
    let default_hook = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        if let Some(dir) = LOG_DIR.get() {
            let backtrace = std::backtrace::Backtrace::force_capture();
            let log_line = format!("[{}] {info}\n{backtrace}\n\n", now_ms());
            let log_path = dir.join(PANIC_LOG_FILENAME);
            // 肥大化防止：上限サイズ以上になっていたら追記ではなくクリアしてから書く。
            let should_truncate = std::fs::metadata(&log_path)
                .map(|m| m.len() >= PANIC_LOG_MAX_BYTES)
                .unwrap_or(false);
            let opened = if should_truncate {
                std::fs::OpenOptions::new()
                    .create(true)
                    .write(true)
                    .truncate(true)
                    .open(&log_path)
            } else {
                std::fs::OpenOptions::new()
                    .create(true)
                    .append(true)
                    .open(&log_path)
            };
            if let Ok(mut file) = opened {
                use std::io::Write;
                let _ = file.write_all(log_line.as_bytes());
            }
        }
        default_hook(info);
    }));
}

/// `catch_unwind` が返す panic payload（`Box<dyn Any + Send>`）から、可能であれば
/// メッセージ文字列を取り出す。`panic!("...")` / `panic!("{}", x)` は `&str` または
/// `String` を積むことがほとんどのため、それ以外の型は固定メッセージにフォールバックする。
fn panic_payload_message(payload: &(dyn std::any::Any + Send)) -> String {
    if let Some(s) = payload.downcast_ref::<&str>() {
        (*s).to_string()
    } else if let Some(s) = payload.downcast_ref::<String>() {
        s.clone()
    } else {
        "unknown panic payload".to_string()
    }
}

static CLIPBOARD_IMAGE_ID_COUNTER: AtomicU64 = AtomicU64::new(0);

fn generate_clipboard_image_id() -> String {
    let n = CLIPBOARD_IMAGE_ID_COUNTER.fetch_add(1, Ordering::SeqCst);
    format!("{}-{}", now_ms(), n)
}

/// クリップボードの画像バイナリ（PNG エンコード済み）をプロセス内メモリにキャッシュする。
/// フロントエンドには ID とサムネイルの dataURL のみを渡し、巨大な画像データが
/// JS ⇄ Rust の IPC（JSON シリアライズ）を通過しないようにするための仕組み。
struct ClipboardImageCache {
    inner: Mutex<ClipboardImageCacheInner>,
}

#[derive(Default)]
struct ClipboardImageCacheInner {
    map: HashMap<String, Vec<u8>>,
    order: VecDeque<String>,
}

impl ClipboardImageCache {
    fn new() -> Self {
        Self {
            inner: Mutex::new(ClipboardImageCacheInner::default()),
        }
    }

    fn insert(&self, id: String, png_bytes: Vec<u8>, max_items: usize) {
        let mut inner = self.inner.lock().unwrap();
        inner.map.insert(id.clone(), png_bytes);
        inner.order.push_back(id);
        while inner.order.len() > max_items.max(1) {
            if let Some(oldest) = inner.order.pop_front() {
                inner.map.remove(&oldest);
            }
        }
    }

    fn get(&self, id: &str) -> Option<Vec<u8>> {
        self.inner.lock().unwrap().map.get(id).cloned()
    }
}

#[derive(Serialize, Clone)]
#[serde(tag = "type", rename_all = "camelCase")]
enum ClipboardChangedPayload {
    #[serde(rename = "text")]
    Text,
    // `rename_all` on the enum only renames the variant tags (already overridden above
    // via `rename`), not this struct variant's own fields — it does not cascade into
    // struct-variant fields. Without a variant-level `rename_all` here, `thumbnail_data_url`
    // would be serialized as-is (snake_case), leaving `payload.thumbnailDataUrl` undefined
    // on the frontend.
    #[serde(rename = "image", rename_all = "camelCase")]
    Image {
        id: String,
        thumbnail_data_url: String,
        width: u32,
        height: u32,
        timestamp: u64,
    },
}

#[derive(Debug, Serialize, Clone)]
struct FileEntry {
    name: String,
    path: String,
    icon: Option<String>,
}

#[cfg(windows)]
mod shell_icon {
    use std::ffi::{c_void, OsStr};
    use std::os::windows::ffi::OsStrExt;
    use windows::core::PCWSTR;
    use windows::Win32::Graphics::Gdi::{
        CreateCompatibleDC, DeleteDC, DeleteObject, GetDIBits, GetObjectW, BITMAP, BITMAPINFO,
        BITMAPINFOHEADER, DIB_RGB_COLORS, HBITMAP,
    };
    use windows::Win32::Storage::FileSystem::FILE_FLAGS_AND_ATTRIBUTES;
    use windows::Win32::UI::Shell::{SHGetFileInfoW, SHFILEINFOW, SHGFI_ICON, SHGFI_SMALLICON};
    use windows::Win32::UI::WindowsAndMessaging::{DestroyIcon, GetIconInfo, HICON, ICONINFO};

    struct IconGuard(HICON);
    impl Drop for IconGuard {
        fn drop(&mut self) {
            unsafe {
                let _ = DestroyIcon(self.0);
            }
        }
    }

    struct BitmapGuard(HBITMAP);
    impl Drop for BitmapGuard {
        fn drop(&mut self) {
            if !self.0.is_invalid() {
                unsafe {
                    let _ = DeleteObject(self.0.into());
                }
            }
        }
    }

    /// ファイルパスから Windows シェルアイコン（エクスプローラーと同じアイコン）を
    /// 取得し、`data:image/png;base64,...` 形式の文字列として返す。
    pub fn get_icon_data_url(path: &str) -> Option<String> {
        let wide: Vec<u16> = OsStr::new(path)
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();

        unsafe {
            let mut shfi = SHFILEINFOW::default();
            let result = SHGetFileInfoW(
                PCWSTR(wide.as_ptr()),
                FILE_FLAGS_AND_ATTRIBUTES(0),
                Some(&mut shfi),
                std::mem::size_of::<SHFILEINFOW>() as u32,
                SHGFI_ICON | SHGFI_SMALLICON,
            );
            if result == 0 || shfi.hIcon.is_invalid() {
                return None;
            }
            let _icon_guard = IconGuard(shfi.hIcon);

            let mut icon_info = ICONINFO::default();
            GetIconInfo(shfi.hIcon, &mut icon_info).ok()?;
            let _mask_guard = BitmapGuard(icon_info.hbmMask);
            let _color_guard = BitmapGuard(icon_info.hbmColor);

            let mut bmp = BITMAP::default();
            let written = GetObjectW(
                icon_info.hbmColor.into(),
                std::mem::size_of::<BITMAP>() as i32,
                Some(&mut bmp as *mut _ as *mut c_void),
            );
            if written == 0 || bmp.bmWidth <= 0 || bmp.bmHeight <= 0 {
                return None;
            }
            let width = bmp.bmWidth;
            let height = bmp.bmHeight;

            let hdc = CreateCompatibleDC(None);
            if hdc.is_invalid() {
                return None;
            }

            let mut bmi = BITMAPINFO {
                bmiHeader: BITMAPINFOHEADER {
                    biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                    biWidth: width,
                    biHeight: -height,
                    biPlanes: 1,
                    biBitCount: 32,
                    biCompression: 0,
                    ..Default::default()
                },
                ..Default::default()
            };
            let mut buffer = vec![0u8; (width as usize) * (height as usize) * 4];
            let lines = GetDIBits(
                hdc,
                icon_info.hbmColor,
                0,
                height as u32,
                Some(buffer.as_mut_ptr() as *mut c_void),
                &mut bmi,
                DIB_RGB_COLORS,
            );
            let _ = DeleteDC(hdc);

            if lines == 0 {
                return None;
            }

            // Windows の 32bpp DIB は BGRA 順なので RGBA に並べ替える
            for px in buffer.chunks_exact_mut(4) {
                px.swap(0, 2);
            }

            let img = image::RgbaImage::from_raw(width as u32, height as u32, buffer)?;
            let mut png_bytes = Vec::new();
            image::DynamicImage::ImageRgba8(img)
                .write_to(&mut std::io::Cursor::new(&mut png_bytes), image::ImageFormat::Png)
                .ok()?;

            use base64::Engine;
            Some(format!(
                "data:image/png;base64,{}",
                base64::engine::general_purpose::STANDARD.encode(&png_bytes)
            ))
        }
    }
}

#[cfg(not(windows))]
mod shell_icon {
    pub fn get_icon_data_url(_path: &str) -> Option<String> {
        None
    }
}

// 検索フォルダごとの詳細設定（検索階層数・拡張子フィルタリング等）で使うデフォルト値。
// 新規追加フィールドのため、旧バージョンの settings.json（これらのキーを持たない）を
// 読み込んだ際に deserialize が失敗しないよう `serde(default = ...)` で個別に補う。
// 既存の登録済みフォルダはこのデフォルト値が自動的に適用される。
fn default_folder_max_depth() -> u32 {
    3
}

fn default_extension_filter_mode() -> ExtensionFilterMode {
    ExtensionFilterMode::Blacklist
}

/// 拡張子フィルタリングのモード。ホワイトリスト/ブラックリストは排他（同時に両方は
/// 効かせない）。ブラックリストのデフォルトは空リスト（＝全拡張子許可）。ホワイトリストに
/// 切り替えた場合、`*` のような全許可を意味する特殊タグは用意しないため、タグを1件も
/// 追加していない状態では検索対象が0件になる（意図した挙動）。
#[derive(Debug, Serialize, Deserialize, Clone, Copy, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(crate) enum ExtensionFilterMode {
    Blacklist,
    Whitelist,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct FolderEntry {
    path: String,
    enabled: bool,
    #[serde(default = "default_folder_max_depth")]
    max_depth: u32,
    #[serde(default)]
    include_folders: bool,
    #[serde(default = "default_extension_filter_mode")]
    extension_filter_mode: ExtensionFilterMode,
    // ブラックリスト用・ホワイトリスト用を独立したフィールドとして保持する
    // （モード切替時に互いの入力内容を消さないため。詳細は「検索フォルダごとの
    // 詳細設定」節を参照）。v0.8.0 時点の単一 `extensions` フィールドから移行する
    // 既存データは、複雑な引き継ぎ処理を行わずどちらも空にリセットする
    // （フィールド名変更により旧キー `extensions` は deserialize 時に単純に
    // 無視され、`#[serde(default)]` で両方とも空リストになる）。
    #[serde(default)]
    blacklist_extensions: Vec<String>,
    #[serde(default)]
    whitelist_extensions: Vec<String>,
}

impl FolderEntry {
    /// 新規フォルダ登録用のコンストラクタ。詳細設定は上記デフォルト値（3階層・
    /// フォルダ非対象・ブラックリスト空・ホワイトリスト空）で初期化する。
    /// `add_folder`／`add_search_folder_from_paste` の両方から使う。
    fn new(path: String) -> Self {
        Self {
            path,
            enabled: true,
            max_depth: default_folder_max_depth(),
            include_folders: false,
            extension_filter_mode: default_extension_filter_mode(),
            blacklist_extensions: Vec::new(),
            whitelist_extensions: Vec::new(),
        }
    }
}

fn load_folders(app: &AppHandle) -> Vec<FolderEntry> {
    let Ok(store) = app.store(SETTINGS_STORE) else {
        return Vec::new();
    };
    store
        .get("folders")
        .and_then(|v| serde_json::from_value(v.clone()).ok())
        .unwrap_or_default()
}

fn save_folders(app: &AppHandle, folders: &[FolderEntry]) -> Result<(), String> {
    let store = app.store(SETTINGS_STORE).map_err(|e| e.to_string())?;
    store.set("folders", serde_json::json!(folders));
    store.save().map_err(|e| e.to_string())
}

#[tauri::command]
fn get_folders(app: AppHandle) -> Vec<FolderEntry> {
    load_folders(&app)
}

#[tauri::command]
async fn pick_folder(window: tauri::WebviewWindow) -> Option<String> {
    window
        .dialog()
        .file()
        .set_parent(&window)
        .blocking_pick_folder()
        .map(|p| p.to_string())
}

#[tauri::command]
fn add_folder(app: AppHandle, path: String) -> Result<Vec<FolderEntry>, String> {
    let mut folders = load_folders(&app);
    if !folders.iter().any(|f| f.path == path) {
        folders.push(FolderEntry::new(path));
    }
    save_folders(&app, &folders)?;
    Ok(folders)
}

#[tauri::command]
fn remove_folder(app: AppHandle, path: String) -> Result<Vec<FolderEntry>, String> {
    let mut folders = load_folders(&app);
    folders.retain(|f| f.path != path);
    save_folders(&app, &folders)?;
    Ok(folders)
}

#[tauri::command]
fn toggle_folder(app: AppHandle, path: String) -> Result<Vec<FolderEntry>, String> {
    let mut folders = load_folders(&app);
    if let Some(f) = folders.iter_mut().find(|f| f.path == path) {
        f.enabled = !f.enabled;
    }
    save_folders(&app, &folders)?;
    Ok(folders)
}

/// 拡張子タグ配列を正規化する（前後の空白除去・先頭の `.` 除去・小文字化・重複除去）。
/// ブラックリスト・ホワイトリストの双方、かつ「検索フォルダの詳細設定」「/recent の
/// 表示対象設定」の両機能で同じ正規化ルールを適用するため共通化している
/// （`recent_files.rs` からも `crate::normalize_extensions` として呼ぶ）。
pub(crate) fn normalize_extensions(extensions: Vec<String>) -> Vec<String> {
    let mut normalized_extensions: Vec<String> = Vec::new();
    for ext in extensions {
        let normalized = ext.trim().trim_start_matches('.').to_lowercase();
        if !normalized.is_empty() && !normalized_extensions.contains(&normalized) {
            normalized_extensions.push(normalized);
        }
    }
    normalized_extensions
}

/// 検索フォルダごとの詳細設定（検索階層数・フォルダ自体の検索対象可否・拡張子
/// フィルタリング）をまとめて保存する。設定ダイアログの「保存」ボタン押下時にのみ
/// 呼ばれ、フォームの4項目を一括で反映する（個別の `set_*` コマンドには分割しない）。
/// 拡張子タグは前後の空白除去・先頭の `.` 除去・小文字化・重複除去のうえで保存する。
#[tauri::command]
fn set_folder_settings(
    app: AppHandle,
    path: String,
    max_depth: u32,
    include_folders: bool,
    extension_filter_mode: ExtensionFilterMode,
    blacklist_extensions: Vec<String>,
    whitelist_extensions: Vec<String>,
) -> Result<Vec<FolderEntry>, String> {
    if !(1..=20).contains(&max_depth) {
        return Err("検索階層数は1以上20以下の整数を指定してください".to_string());
    }

    let normalized_blacklist = normalize_extensions(blacklist_extensions);
    let normalized_whitelist = normalize_extensions(whitelist_extensions);

    let mut folders = load_folders(&app);
    let Some(f) = folders.iter_mut().find(|f| f.path == path) else {
        return Err("フォルダが見つかりません".to_string());
    };
    f.max_depth = max_depth;
    f.include_folders = include_folders;
    f.extension_filter_mode = extension_filter_mode;
    f.blacklist_extensions = normalized_blacklist;
    f.whitelist_extensions = normalized_whitelist;
    save_folders(&app, &folders)?;
    Ok(folders)
}

/// 拡張子フィルタリングの判定。ディレクトリには適用しない（呼び出し側でファイルのみに
/// 限定して呼ぶこと）。ブラックリストは空リストの場合に全許可、ホワイトリストは
/// `*` 相当の特殊タグを持たないため空リストの場合は全拒否になる。拡張子を持たない
/// ファイルは、ブラックリストのどのタグにも一致し得ないため許可、ホワイトリストの
/// どのタグにも一致し得ないため拒否となる。ファイル検索（`search_files`）・
/// `/recent`（`recent_files::get_recent_files`）の両方から共有する（`recent_files.rs`
/// からは `crate::passes_extension_filter` として呼ぶ）。
pub(crate) fn passes_extension_filter(
    path: &Path,
    mode: &ExtensionFilterMode,
    extensions: &[String],
) -> bool {
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase());
    match mode {
        ExtensionFilterMode::Blacklist => {
            if extensions.is_empty() {
                return true;
            }
            match ext {
                Some(ext) => !extensions.iter().any(|e| e == &ext),
                None => true,
            }
        }
        ExtensionFilterMode::Whitelist => match ext {
            Some(ext) => extensions.iter().any(|e| e == &ext),
            None => false,
        },
    }
}

/// Windows のトースト通知を1件表示する。失敗（通知権限なし等）は無視する
/// （通知はあくまで補助的なフィードバックであり、失敗してもフォルダ追加・
/// ショートカット作成自体は成功しているため、エラーとして扱う必要はない）。
fn show_toast(app: &AppHandle, message: &str) {
    let _ = app
        .notification()
        .builder()
        .title("WinLauncher")
        .body(message)
        .show();
}

/// パス貼り付け候補の既存データ操作（ピン止め・お気に入り）完了後に、フロントエンド
/// から成功通知を表示するための薄いコマンド。保存成功の後にだけ呼び出す。
#[tauri::command]
fn show_path_paste_toast(app: AppHandle, message: String) {
    show_toast(&app, &message);
}

/// パス貼り付けによる検索フォルダ管理：検索ボックスへの貼り付けイベント発生時に呼ぶ。
/// クリップボードに `CF_HDROP` が存在し、かつパスが単一の場合のみそのパス文字列を
/// 返す（呼び出し側はこれをそのまま検索ボックスへ流し込む）。`appSettings.pathPasteEnabled`
/// が無効な場合は判定自体を行わない。
#[tauri::command]
fn read_pasted_hdrop_path(app: AppHandle) -> Option<String> {
    let settings = load_app_settings(&app);
    if !settings.path_paste_enabled {
        return None;
    }
    path_paste::read_hdrop_single_path()
}

/// パス貼り付けによる検索フォルダ管理：検索ボックスの文字列（`CF_HDROP` からの
/// 流し込み・通常のテキスト貼り付け・手入力のいずれも区別しない）に対して、実在する
/// ファイル/フォルダのパスかどうかを判定する。`calculate`/`search_files` と同様に
/// クエリ変更のたびフロントエンドから呼ばれる想定のため、他の `set_*` 系コマンドとは
/// 異なりここでは `path_paste_enabled` を確認しない（呼び出し自体はフロントエンド側の
/// `appSettings.pathPasteEnabled` で制御する）。
#[tauri::command]
fn judge_pasted_path(text: String) -> Option<path_paste::PastedPathInfo> {
    path_paste::judge_pasted_path(&text)
}

/// 機能1: 検索フォルダとして追加。既に登録済みの場合は追加処理をスキップし、
/// その旨をトースト通知で伝える（エラー扱いにはしない）。
#[tauri::command]
fn add_search_folder_from_paste(app: AppHandle, path: String) -> Result<(), String> {
    let mut folders = load_folders(&app);
    let name = Path::new(&path)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| path.clone());

    if folders.iter().any(|f| f.path == path) {
        show_toast(&app, "既に登録済みです");
        return Ok(());
    }

    folders.push(FolderEntry::new(path));
    save_folders(&app, &folders)?;
    show_toast(&app, &format!("検索フォルダに追加しました: {name}"));
    Ok(())
}

/// 機能2: 検索フォルダにショートカットとして追加。同名の `.lnk` が既に存在する場合は
/// Explorer 標準の挙動に倣い「名前 (2).lnk」のように連番を付与する（上書きしない）。
#[tauri::command]
fn create_shortcut(
    app: AppHandle,
    target_path: String,
    folder_path: String,
    name: String,
) -> Result<(), String> {
    let trimmed_name = name.trim();
    if trimmed_name.is_empty() {
        return Err("名前を入力してください".to_string());
    }

    let dest_dir = Path::new(&folder_path);
    let final_name = path_paste::unique_lnk_name(dest_dir, trimmed_name);
    let lnk_path = dest_dir.join(format!("{final_name}.lnk"));

    path_paste::write_shortcut_file(&target_path, &lnk_path)?;

    show_toast(&app, &format!("ショートカットを配置しました: {final_name}"));
    Ok(())
}

// ==================== ピン止め・お気に入り・メモ機能 ====================
//
// ピン止め・お気に入り・メモの3機能を、単一のツリー構造で管理する `FavoriteNode` として
// 定義する。`children` を持つ入れ子構造ではなく `parentId` を持つフラットな配列
// （隣接リスト方式）とすることで、既存の `FolderEntry`（folders: FolderEntry[]）と
// 同じく `Vec<T>` として素直に扱え、Rust側に再帰的な型定義を導入する必要がない
// （詳細は 00-requirements.md「ピン止め・お気に入り・メモ機能」節を参照）。
// 今回実装するのは「ピン止め」のみで、「お気に入り」「メモ」は予約フォルダ（器）のみを
// 生成し、機能は実装しない。

const FAVORITES_STORE_KEY: &str = "favorites";

// ルート直下に生成する3つの予約フォルダの固定ID。表示名（`name`。ユーザーが変更可能）
// ではなく固定IDで参照することで、参照時に名前で検索する必要をなくす。
const PINNED_FOLDER_ID: &str = "__pinned__";
const FAVORITES_FOLDER_ID: &str = "__favorites__";
const MEMO_FOLDER_ID: &str = "__memo__";
const MEMO_TRASH_ID: &str = "__memo_trash__";

/// `FavoriteNode.type` の値。`clipboard`・`command` は型定義のみ用意し、今回は
/// 生成・使用しない（将来のお気に入り・メモ機能実装時に使う）。
#[derive(Debug, Serialize, Deserialize, Clone, Copy, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
enum FavoriteNodeType {
    Folder,
    #[default]
    File,
    Clipboard,
    Command,
    Memo,
}

const MEMO_DOCUMENTS_STORE_KEY: &str = "memoDocuments";

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct MemoDraft {
    content: String,
    updated_at: u64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct MemoDocument {
    #[serde(default = "default_memo_revision")]
    revision: u64,
    #[serde(default)]
    content: String,
    #[serde(default)]
    saved_at: u64,
    #[serde(default)]
    draft: Option<MemoDraft>,
}

fn default_memo_revision() -> u64 { 1 }

struct FavoriteNodesWriteLock(Mutex<()>);
struct MemoDocumentsWriteLock(Mutex<()>);

fn load_memo_documents(app: &AppHandle) -> HashMap<String, MemoDocument> {
    let Ok(store) = app.store(SETTINGS_STORE) else { return HashMap::new(); };
    store.get(MEMO_DOCUMENTS_STORE_KEY)
        .and_then(|v| serde_json::from_value(v.clone()).ok())
        .unwrap_or_default()
}

fn save_memo_documents(app: &AppHandle, documents: &HashMap<String, MemoDocument>) -> Result<(), String> {
    let store = app.store(SETTINGS_STORE).map_err(|e| e.to_string())?;
    store.set(MEMO_DOCUMENTS_STORE_KEY, serde_json::json!(documents));
    store.save().map_err(|e| e.to_string())
}

/// ピン止め・お気に入り・メモの共通ノード。`children` を持たないフラットな配列
/// （隣接リスト方式）のまま `Vec<FavoriteNode>` として settings.json に永続化する。
/// 将来 `clipboard`/`command` 型のフィールドを追加する際の後方互換のため、
/// 全フィールドに `#[serde(default)]` を付与している。
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct FavoriteNode {
    #[serde(default)]
    id: String,
    #[serde(default)]
    parent_id: String,
    #[serde(default, rename = "type")]
    node_type: FavoriteNodeType,
    #[serde(default)]
    name: String,
    #[serde(default)]
    value: String,
    #[serde(default)]
    order: u32,
    // フォルダの開閉状態（軸3）。folder 型ノードのみ意味を持つ（file 型では未使用の
    // まま false 固定でよい）。デフォルト false（展開）。既存の settings.json
    // （このキーを持たない）を読み込んだ際に deserialize が失敗しないよう
    // #[serde(default)] を付与する（他の後方互換フィールドと同じ方針）。
    #[serde(default)]
    collapsed: bool,
}

fn load_favorites(app: &AppHandle) -> Vec<FavoriteNode> {
    let Ok(store) = app.store(SETTINGS_STORE) else {
        return Vec::new();
    };
    store
        .get(FAVORITES_STORE_KEY)
        .and_then(|v| serde_json::from_value(v.clone()).ok())
        .unwrap_or_default()
}

fn save_favorites(app: &AppHandle, favorites: &[FavoriteNode]) -> Result<(), String> {
    let store = app.store(SETTINGS_STORE).map_err(|e| e.to_string())?;
    store.set(FAVORITES_STORE_KEY, serde_json::json!(favorites));
    store.save().map_err(|e| e.to_string())
}

/// 予約フォルダ（固定ID・固定名・folder型・ルート直下）の正しい定義。
fn reserved_folder_definitions() -> [FavoriteNode; 4] {
    [
        FavoriteNode {
            id: PINNED_FOLDER_ID.to_string(),
            parent_id: String::new(),
            node_type: FavoriteNodeType::Folder,
            name: "ピン止め".to_string(),
            value: String::new(),
            order: 0,
            collapsed: false,
        },
        FavoriteNode {
            id: FAVORITES_FOLDER_ID.to_string(),
            parent_id: String::new(),
            node_type: FavoriteNodeType::Folder,
            name: "お気に入り".to_string(),
            value: String::new(),
            order: 1,
            collapsed: false,
        },
        FavoriteNode {
            id: MEMO_FOLDER_ID.to_string(),
            parent_id: String::new(),
            node_type: FavoriteNodeType::Folder,
            name: "メモ".to_string(),
            value: String::new(),
            order: 2,
            collapsed: false,
        },
        FavoriteNode {
            id: MEMO_TRASH_ID.to_string(),
            parent_id: String::new(),
            node_type: FavoriteNodeType::Folder,
            name: "ゴミ箱".to_string(),
            value: String::new(),
            order: 3,
            collapsed: false,
        },
    ]
}

/// `favorites` 内に3つの予約フォルダが正しい状態（固定ID・固定名・folder型・
/// ルート直下）で存在することを保証する。存在しなければ末尾に追加し、既存でも
/// 内容が改変されていれば（ユーザーによる削除・リネーム・移動はできない仕様のため）
/// 正しい値へ上書きする。フロントエンドはUI上でこれらのノードを編集不可にするが、
/// この関数はその制約が破られた場合にもRust側で確実に是正するための防御である。
/// 変更が発生した場合のみ `true` を返す（呼び出し側の保存要否判定に使う）。
fn enforce_reserved_folders(favorites: &mut Vec<FavoriteNode>) -> bool {
    let mut changed = false;
    for reserved in reserved_folder_definitions() {
        match favorites.iter_mut().find(|f| f.id == reserved.id) {
            Some(existing) => {
                if existing.parent_id != reserved.parent_id
                    || existing.node_type != reserved.node_type
                    || existing.name != reserved.name
                    || existing.value != reserved.value
                {
                    *existing = reserved;
                    changed = true;
                }
            }
            None => {
                favorites.push(reserved);
                changed = true;
            }
        }
    }
    changed
}

/// アプリ起動時（`setup`）に一度呼び、予約フォルダが存在しなければ生成する
/// （新規ユーザー・既存ユーザーの初回起動のいずれも対象）。
fn ensure_reserved_folders(app: &AppHandle) {
    let mut favorites = load_favorites(app);
    if enforce_reserved_folders(&mut favorites) {
        let _ = save_favorites(app, &favorites);
    }
}

#[tauri::command]
fn get_favorites(app: AppHandle) -> Vec<FavoriteNode> {
    load_favorites(&app)
}

/// 書き込み頻度が低いため、部分更新ではなく配列全量の置き換えとする（ピン止めの
/// 追加・解除・並び替えのいずれも、フロントエンドが手元の配列を更新したうえで
/// この1コマンドを呼ぶ）。予約フォルダは、送信された内容に関わらずRust側で強制的に
/// 正しい状態へ是正してから保存する（`enforce_reserved_folders`。ユーザーによる
/// 削除・リネーム・移動ができない制約を、UI側の制限だけでなくRust側でも防御する）。
#[tauri::command]
fn set_favorites(app: AppHandle, favorite_lock: tauri::State<'_, FavoriteNodesWriteLock>, favorites: Vec<FavoriteNode>) -> Result<Vec<FavoriteNode>, String> {
    let _guard = favorite_lock.0.lock().unwrap();
    let mut favorites = favorites;
    enforce_reserved_folders(&mut favorites);
    save_favorites(&app, &favorites)?;
    Ok(favorites)
}

/// ピン止めブロック表示用に、「ピン止め」予約フォルダ直下（`file` 型）のノードだけを
/// `order` 順に抽出し、ファイル検索結果と同じ `FileEntry`（シェルアイコン付き）へ
/// 変換して返す。件数上限は設けない（`MAX_SEARCH_RESULTS` とは独立させる）。
#[tauri::command]
fn get_pinned_files(app: AppHandle) -> Vec<FileEntry> {
    let mut pinned: Vec<FavoriteNode> = load_favorites(&app)
        .into_iter()
        .filter(|f| f.parent_id == PINNED_FOLDER_ID && f.node_type == FavoriteNodeType::File)
        .collect();
    pinned.sort_by_key(|f| f.order);
    pinned
        .into_iter()
        .map(|f| {
            let icon = shell_icon::get_icon_data_url(&f.value);
            FileEntry {
                name: f.name,
                path: f.value,
                icon,
            }
        })
        .collect()
}

/// ピン止めブロックの実体確認用。渡されたパス配列と同じ順序・同じ長さで、各パスが
/// 実在するかどうかの真偽値配列を返す。呼び出し元（フロントエンド）は、ピン止め
/// ブロックの表示時とウィンドウのフォーカス復帰時にこのコマンドを呼ぶ想定。
#[tauri::command]
fn check_paths_exist(paths: Vec<String>) -> Vec<bool> {
    paths.iter().map(|p| Path::new(p).exists()).collect()
}

// ==================== お気に入り機能（段階2 ①） ====================
//
// お気に入りは「お気に入り」予約フォルダ配下にツリー構造（folder型ノードを挟んだ
// 入れ子）で整理できる点がピン止め（フラット構造）と異なる。そのため、ある
// FavoriteNode が「お気に入り」ツリーに属するかどうかは、parentId を1つ辿るだけの
// ピン止め（`parent_id == PINNED_FOLDER_ID`）とは違い、祖先を再帰的に辿って判定する
// 必要がある（詳細は 00-requirements.md「お気に入り機能」節を参照）。

static FAVORITE_NODE_ID_COUNTER: AtomicU64 = AtomicU64::new(0);

/// 新規 FavoriteNode の id を生成する。`generate_clipboard_image_id` と同じ
/// 「現在時刻 + プロセス内カウンタ」方式（新規のUUID等のクレート依存を増やさない）。
fn generate_favorite_node_id() -> String {
    let n = FAVORITE_NODE_ID_COUNTER.fetch_add(1, Ordering::SeqCst);
    format!("fav-{}-{}", now_ms(), n)
}

/// `parent_id` から祖先を辿り、`ancestor_id` に到達するかどうかを判定する。
/// ユーザー操作で循環参照を作れる経路は現状存在しないが、防御的に探索深さの
/// 上限を設けている。
fn is_descendant_of(favorites: &[FavoriteNode], parent_id: &str, ancestor_id: &str) -> bool {
    let mut current = parent_id.to_string();
    for _ in 0..64 {
        if current == ancestor_id {
            return true;
        }
        match favorites.iter().find(|f| f.id == current) {
            Some(parent) => current = parent.parent_id.clone(),
            None => return false,
        }
    }
    false
}

/// 指定したパス文字列が、「お気に入り」ツリー配下に既に登録済みかどうかを判定する。
/// 実体の同一性ではなく、パス文字列の完全一致で判定する（00-requirements.md
/// 「お気に入り機能」節「★アイコン」の重複判定基準を参照。ピン止め機能の
/// 「/recent からのピン止め」節と同様、取得元によってパス文字列が異なれば
/// 別エントリとして扱うため、実体単位ではなくパス文字列単位で判定する）。
fn is_path_favorited(favorites: &[FavoriteNode], path: &str) -> bool {
    favorites.iter().any(|f| {
        f.node_type == FavoriteNodeType::File
            && f.value == path
            && is_descendant_of(favorites, &f.parent_id, FAVORITES_FOLDER_ID)
    })
}

#[tauri::command]
fn is_favorited(app: AppHandle, path: String) -> bool {
    is_path_favorited(&load_favorites(&app), &path)
}

/// 「お気に入り」予約フォルダ配下のノードを、フォルダ構造込みでフラットに取得する
/// （`folder`型・`file`型の両方を含む。ツリー構造自体は既存の `parentId` を辿ることで
/// 呼び出し側が再構築する）。予約フォルダ自体（ルートコンテナ）は含まない。
#[tauri::command]
fn get_favorite_nodes(app: AppHandle) -> Vec<FavoriteNode> {
    let favorites = load_favorites(&app);
    let mut nodes: Vec<FavoriteNode> = favorites
        .iter()
        .filter(|f| is_descendant_of(&favorites, &f.parent_id, FAVORITES_FOLDER_ID))
        .cloned()
        .collect();
    nodes.sort_by_key(|f| f.order);
    nodes
}

/// 指定したパス文字列・表示名・保存先フォルダIDで `file` 型ノードを1件追加する。
/// 同一パス文字列が「お気に入り」ツリー配下に既に登録済みの場合は何もせず、
/// 現在の配列をそのまま返す（`add_folder` の「既に登録済みなら追加しない」実装と
/// 同じ、既存の冪等な追加パターンを踏襲）。
#[tauri::command]
fn add_favorite(
    app: AppHandle,
    favorite_lock: tauri::State<'_, FavoriteNodesWriteLock>,
    path: String,
    name: String,
    folder_id: String,
) -> Result<Vec<FavoriteNode>, String> {
    let _guard = favorite_lock.0.lock().unwrap();
    let mut favorites = load_favorites(&app);
    if !is_path_favorited(&favorites, &path) {
        let max_order = favorites
            .iter()
            .filter(|f| f.parent_id == folder_id)
            .map(|f| f.order)
            .max();
        favorites.push(FavoriteNode {
            id: generate_favorite_node_id(),
            parent_id: folder_id,
            node_type: FavoriteNodeType::File,
            name,
            value: path,
            order: max_order.map(|m| m + 1).unwrap_or(0),
            collapsed: false,
        });
        save_favorites(&app, &favorites)?;
    }
    Ok(favorites)
}

/// 同一 parent_id・同一 node_type 内での重複名チェック（トリム＋大文字小文字を
/// 区別しない一致判定。既存の validate_unique_keyword と同じ方針）。node_type を
/// 条件に含めるため、フォルダとアイテムの間での同名は自然に許容される（種別が
/// 異なれば見分けがつくため）。`exclude_id` はリネーム時に対象ノード自身を
/// 重複判定から除外するために使う（新規作成時は None を渡す）。
/// add_favorite_folder（新規フォルダ作成）・rename_favorite_node（4d：リネーム）の
/// 両方から共有する。
fn has_duplicate_favorite_name(
    favorites: &[FavoriteNode],
    parent_id: &str,
    node_type: FavoriteNodeType,
    name: &str,
    exclude_id: Option<&str>,
) -> bool {
    favorites.iter().any(|f| {
        f.parent_id == parent_id
            && f.node_type == node_type
            && Some(f.id.as_str()) != exclude_id
            && f.name.trim().to_lowercase() == name.to_lowercase()
    })
}

/// 登録ダイアログの「新規フォルダ作成」から呼ばれる。指定した親フォルダの直下に
/// `folder` 型ノードを1件追加する（`add_favorite` と同じ「Rust側でid・orderを
/// 採番し、更新後の配列を返す」パターン）。空文字列はエラーとし保存しない
/// （他の `set_*` コマンドの空文字列バリデーションと同様、フロントエンドだけでなく
/// Rust側でも検証する）。
#[tauri::command]
fn add_favorite_folder(
    app: AppHandle,
    favorite_lock: tauri::State<'_, FavoriteNodesWriteLock>,
    name: String,
    parent_id: String,
) -> Result<Vec<FavoriteNode>, String> {
    let _guard = favorite_lock.0.lock().unwrap();
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err("フォルダ名を入力してください".to_string());
    }
    let mut favorites = load_favorites(&app);
    // 同一 parent_id 配下での重複フォルダ名チェック。file 型の兄弟ノードとの
    // 重複は対象外（フォルダ同士の重複のみを禁止する）。
    if has_duplicate_favorite_name(
        &favorites,
        &parent_id,
        FavoriteNodeType::Folder,
        trimmed,
        None,
    ) {
        return Err("同じ名前のフォルダが既に存在します".to_string());
    }
    let max_order = favorites
        .iter()
        .filter(|f| f.parent_id == parent_id)
        .map(|f| f.order)
        .max();
    favorites.push(FavoriteNode {
        id: generate_favorite_node_id(),
        parent_id,
        node_type: FavoriteNodeType::Folder,
        name: trimmed.to_string(),
        value: String::new(),
        order: max_order.map(|m| m + 1).unwrap_or(0),
        collapsed: false,
    });
    save_favorites(&app, &favorites)?;
    Ok(favorites)
}

/// お気に入り編集ビューでのリネーム（4d）。フォルダ・アイテム（file型）の
/// どちらの `FavoriteNode.name` も変更できる。空文字列はエラーとし保存しない
/// （add_favorite_folder と同様のバリデーション）。
///
/// 重複チェックは対象ノードの型ごとに独立させる（has_duplicate_favorite_name を
/// 共有）：
/// - フォルダの場合：同一親配下の他フォルダとの重複を禁止（add_favorite_folder と
///   同じ判定）
/// - アイテムの場合：同一親配下の他アイテムとの重複を禁止（新規のチェック。
///   同一階層内で似た表示名のファイルが複数あると /favorite 一覧で意図と異なる
///   ファイルを誤って起動するリスクがあるため、フォルダと同じ「取り違え防止」の
///   原則を適用する）
/// - フォルダとアイテムの間の重複は許容する（種別が異なれば見分けがつくため）
///
/// 予約フォルダ（ピン止め／お気に入り／メモ）はリネームできない
/// （enforce_reserved_folders・remove_favorite_folder と同様、UI側の制限だけでなく
/// Rust側でも防御する）。
#[tauri::command]
fn rename_favorite_node(
    app: AppHandle,
    favorite_lock: tauri::State<'_, FavoriteNodesWriteLock>,
    id: String,
    new_name: String,
) -> Result<Vec<FavoriteNode>, String> {
    let _guard = favorite_lock.0.lock().unwrap();
    if id == PINNED_FOLDER_ID || id == FAVORITES_FOLDER_ID || id == MEMO_FOLDER_ID || id == MEMO_TRASH_ID {
        return Err("予約フォルダの名前は変更できません".to_string());
    }
    let trimmed = new_name.trim();
    if trimmed.is_empty() {
        return Err("名前を入力してください".to_string());
    }
    let mut favorites = load_favorites(&app);
    let target_index = favorites
        .iter()
        .position(|f| f.id == id)
        .ok_or_else(|| "指定したノードが見つかりません".to_string())?;
    let parent_id = favorites[target_index].parent_id.clone();
    let node_type = favorites[target_index].node_type;

    if has_duplicate_favorite_name(&favorites, &parent_id, node_type, trimmed, Some(&id)) {
        let message = if node_type == FavoriteNodeType::Folder {
            "同じ名前のフォルダが既に存在します"
        } else {
            "同じ名前のファイルが既に存在します"
        };
        return Err(message.to_string());
    }

    favorites[target_index].name = trimmed.to_string();
    save_favorites(&app, &favorites)?;
    Ok(favorites)
}

/// フォルダの開閉状態（軸3）の永続化。/favorite ブラウジング・お気に入り編集ビューの
/// 両方が同じ collapsed フィールドを共有する（別々の開閉状態を持たせない。
/// 00-requirements.md「フォルダの開閉状態（collapsed）の永続化と絞り込みとの関係」節を
/// 参照）。フロント側は現在値をトグルした結果をそのまま渡す（この関数自体は
/// トグルせず、指定された値をそのまま設定する単純な setter）。folder 型以外の
/// ノードに対して呼ばれることは無い想定だが、値を設定するだけの安全な操作のため
/// 型チェックは行わない。
#[tauri::command]
fn set_favorite_folder_collapsed(
    app: AppHandle,
    favorite_lock: tauri::State<'_, FavoriteNodesWriteLock>,
    id: String,
    collapsed: bool,
) -> Result<Vec<FavoriteNode>, String> {
    let _guard = favorite_lock.0.lock().unwrap();
    let mut favorites = load_favorites(&app);
    let target = favorites
        .iter_mut()
        .find(|f| f.id == id)
        .ok_or_else(|| "指定したノードが見つかりません".to_string())?;
    target.collapsed = collapsed;
    save_favorites(&app, &favorites)?;
    Ok(favorites)
}

/// 指定したノードIDのエントリを削除する（1件のみ。子孫を持つ folder 型ノードの
/// カスケード削除は未対応。folder 型ノードを削除するUI自体が現時点では存在せず
/// （新規フォルダ作成のみ）、実際に発生し得ない状況のため今回は対応しない）。
#[tauri::command]
fn remove_favorite(app: AppHandle, favorite_lock: tauri::State<'_, FavoriteNodesWriteLock>, id: String) -> Result<Vec<FavoriteNode>, String> {
    let _guard = favorite_lock.0.lock().unwrap();
    let mut favorites = load_favorites(&app);
    favorites.retain(|f| f.id != id);
    save_favorites(&app, &favorites)?;
    Ok(favorites)
}

/// /favorite モードのフォルダ削除（段階3の本格的なツリー編集UIの前倒しではなく、
/// 動作確認に必要な最小限のコア機能）。指定したフォルダノード自身と、その配下
/// （再帰。サブフォルダ・ファイルエントリを問わない）を丸ごと削除する。
/// 既存の `is_descendant_of`（祖先を辿るヘルパー）をそのまま再利用し、削除対象の
/// 判定ロジックを重複させない。
///
/// これは「お気に入りへの登録情報（参照）」を削除するだけであり、実ファイル自体は
/// 一切操作しない（`FavoriteNode.value` が指すパスには触れない）。
///
/// 予約フォルダ（ピン止め／お気に入り／メモの3つのルート）は削除対象に含めない
/// （`enforce_reserved_folders` と同様、UI側の制限だけでなくRust側でも防御する）。
#[tauri::command]
fn remove_favorite_folder(app: AppHandle, favorite_lock: tauri::State<'_, FavoriteNodesWriteLock>, id: String) -> Result<Vec<FavoriteNode>, String> {
    let _guard = favorite_lock.0.lock().unwrap();
    if id == PINNED_FOLDER_ID || id == FAVORITES_FOLDER_ID || id == MEMO_FOLDER_ID || id == MEMO_TRASH_ID {
        return Err("予約フォルダは削除できません".to_string());
    }
    let favorites = load_favorites(&app);
    let target_is_folder = favorites
        .iter()
        .any(|f| f.id == id && f.node_type == FavoriteNodeType::Folder);
    if !target_is_folder {
        return Err("指定したフォルダが見つかりません".to_string());
    }
    let kept: Vec<FavoriteNode> = favorites
        .iter()
        .filter(|f| f.id != id && !is_descendant_of(&favorites, &f.parent_id, &id))
        .cloned()
        .collect();
    save_favorites(&app, &kept)?;
    Ok(kept)
}

/// お気に入り編集ビューのドラッグ&ドロップによる並び替え・再親化（4e）。
/// 隣接スワップ専用（up/downのみ）の `move_favorite_node` を段階3当初の暫定実装
/// として持っていたが、/favorite ブラウジング側の暫定UI撤去とともに呼び出し元が
/// 無くなったため削除した（経緯は docs/internal-design/favorites-data-model.md
/// #favorite-mode-provisional-features を参照）。1回の呼び出しで移動先の親
/// （`new_parent_id`）と、移動先の兄弟内での挿入位置（`target_index`。自分自身を
/// 除いた兄弟一覧を order 昇順に並べたときの添字。同じ親内での並び替えも
/// フォルダをまたぐ再親化も同じロジックで扱える）を同時に指定できる。
///
/// バリデーション（フロント側の制限だけでなくRust側でも防御する）：
/// - 予約フォルダ（ピン止め／お気に入り／メモ）自体は移動できない
/// - 移動先の親は「お気に入り」ツリー配下（FAVORITES_FOLDER_ID 自身、または
///   その子孫の folder 型ノード）でなければならない（ピン止め・メモへの移動を禁止）
/// - 循環参照防止：フォルダを自分自身、または自分の子孫の中へ移動することはできない
///   （既存の is_descendant_of を再利用する）
/// - 移動先の親配下に、同じ node_type で同名（トリム＋大文字小文字を区別しない）の
///   ノードが既に存在する場合は拒否する（add_favorite_folder・rename_favorite_node と
///   同じ has_duplicate_favorite_name を共有し、取り違え防止の原則を一貫させる）
///
/// order の再計算は、移動先の兄弟（自分自身を除く）を order 昇順に並べたリストへ
/// target_index の位置で挿入し、そのリスト全体の order を 0 始まりの連番へ振り直す
/// ことで完結させる（フロント側で全量を計算して set_favorites へ渡す一括保存方式は
/// 採らない。既存の「1操作＝1即時Rustコマンド呼び出し」方式を踏襲する）。
#[tauri::command]
fn move_favorite_node_to(
    app: AppHandle,
    favorite_lock: tauri::State<'_, FavoriteNodesWriteLock>,
    id: String,
    new_parent_id: String,
    target_index: usize,
) -> Result<Vec<FavoriteNode>, String> {
    let _guard = favorite_lock.0.lock().unwrap();
    if id == PINNED_FOLDER_ID || id == FAVORITES_FOLDER_ID || id == MEMO_FOLDER_ID || id == MEMO_TRASH_ID {
        return Err("予約フォルダは移動できません".to_string());
    }
    let mut favorites = load_favorites(&app);
    let target_pos = favorites
        .iter()
        .position(|f| f.id == id)
        .ok_or_else(|| "指定したノードが見つかりません".to_string())?;
    let node_type = favorites[target_pos].node_type;
    let node_name = favorites[target_pos].name.clone();

    let parent_is_folder_in_favorites_tree = new_parent_id == FAVORITES_FOLDER_ID
        || (favorites
            .iter()
            .any(|f| f.id == new_parent_id && f.node_type == FavoriteNodeType::Folder)
            && is_descendant_of(&favorites, &new_parent_id, FAVORITES_FOLDER_ID));
    if !parent_is_folder_in_favorites_tree {
        return Err("移動先が不正です".to_string());
    }

    if node_type == FavoriteNodeType::Folder
        && (new_parent_id == id || is_descendant_of(&favorites, &new_parent_id, &id))
    {
        return Err("フォルダを自分自身の中に移動することはできません".to_string());
    }

    if has_duplicate_favorite_name(&favorites, &new_parent_id, node_type, &node_name, Some(&id))
    {
        let message = if node_type == FavoriteNodeType::Folder {
            "同じ名前のフォルダが既に存在します"
        } else {
            "同じ名前のファイルが既に存在します"
        };
        return Err(message.to_string());
    }

    let mut sibling_ids: Vec<String> = favorites
        .iter()
        .filter(|f| f.parent_id == new_parent_id && f.id != id)
        .map(|f| f.id.clone())
        .collect();
    sibling_ids.sort_by_key(|sid| {
        favorites
            .iter()
            .find(|f| &f.id == sid)
            .map(|f| f.order)
            .unwrap_or(0)
    });
    let insert_at = target_index.min(sibling_ids.len());
    sibling_ids.insert(insert_at, id.clone());

    favorites[target_pos].parent_id = new_parent_id;
    for (order, sid) in sibling_ids.iter().enumerate() {
        if let Some(node) = favorites.iter_mut().find(|f| &f.id == sid) {
            node.order = order as u32;
        }
    }

    save_favorites(&app, &favorites)?;
    Ok(favorites)
}

fn is_memo_node(favorites: &[FavoriteNode], node: &FavoriteNode) -> bool {
    node.node_type == FavoriteNodeType::Memo
        && is_descendant_of(favorites, &node.parent_id, MEMO_FOLDER_ID)
        && !is_descendant_of(favorites, &node.parent_id, MEMO_TRASH_ID)
}

#[tauri::command]
fn get_memo_nodes(app: AppHandle) -> Vec<FavoriteNode> {
    let favorites = load_favorites(&app);
    let mut nodes: Vec<_> = favorites.iter()
        .filter(|node| is_descendant_of(&favorites, &node.parent_id, MEMO_FOLDER_ID)
            && !is_descendant_of(&favorites, &node.parent_id, MEMO_TRASH_ID))
        .cloned().collect();
    nodes.sort_by_key(|node| node.order);
    nodes
}

#[tauri::command]
fn get_memo_manage_nodes(app: AppHandle) -> Vec<FavoriteNode> {
    let favorites = load_favorites(&app);
    let mut nodes: Vec<_> = favorites.iter()
        .filter(|node| node.id == MEMO_TRASH_ID || is_descendant_of(&favorites, &node.parent_id, MEMO_FOLDER_ID) || is_descendant_of(&favorites, &node.parent_id, MEMO_TRASH_ID))
        .cloned().collect();
    nodes.sort_by_key(|node| node.order);
    nodes
}

#[tauri::command]
fn get_memo_document(app: AppHandle, id: String) -> Result<MemoDocument, String> {
    let favorites = load_favorites(&app);
    let node = favorites.iter().find(|node| node.id == id)
        .ok_or_else(|| "指定したメモが見つかりません".to_string())?;
    if !is_memo_node(&favorites, node) { return Err("指定したメモは編集できません".to_string()); }
    let documents = load_memo_documents(&app);
    Ok(documents.get(&id).cloned().unwrap_or(MemoDocument {
        revision: 1, content: String::new(), saved_at: now_ms(), draft: None,
    }))
}

#[tauri::command]
fn add_memo(
    app: AppHandle,
    favorite_lock: tauri::State<'_, FavoriteNodesWriteLock>,
    memo_lock: tauri::State<'_, MemoDocumentsWriteLock>,
    name: String,
    content: String,
    parent_id: String,
) -> Result<Vec<FavoriteNode>, String> {
    let _favorite_guard = favorite_lock.0.lock().unwrap();
    let _memo_guard = memo_lock.0.lock().unwrap();
    let mut favorites = load_favorites(&app);
    let parent_valid = parent_id == MEMO_FOLDER_ID || (favorites.iter().any(|node| node.id == parent_id && node.node_type == FavoriteNodeType::Folder)
        && is_descendant_of(&favorites, &parent_id, MEMO_FOLDER_ID)
        && !is_descendant_of(&favorites, &parent_id, MEMO_TRASH_ID));
    if !parent_valid { return Err("メモの保存先が不正です".to_string()); }
    let id = generate_favorite_node_id();
    let order = favorites.iter().filter(|node| node.parent_id == parent_id).map(|node| node.order).max().map(|v| v + 1).unwrap_or(0);
    favorites.push(FavoriteNode { id: id.clone(), parent_id, node_type: FavoriteNodeType::Memo, name: name.trim().to_string(), value: String::new(), order, collapsed: false });
    save_favorites(&app, &favorites)?;
    let mut documents = load_memo_documents(&app);
    documents.insert(id, MemoDocument { revision: 1, content, saved_at: now_ms(), draft: None });
    save_memo_documents(&app, &documents)?;
    show_toast(&app, "メモに登録しました");
    Ok(favorites)
}

#[tauri::command]
fn save_memo_draft(
    app: AppHandle,
    memo_lock: tauri::State<'_, MemoDocumentsWriteLock>,
    id: String,
    content: String,
    expected_revision: u64,
) -> Result<MemoDocument, String> {
    let _memo_guard = memo_lock.0.lock().unwrap();
    let favorites = load_favorites(&app);
    let node = favorites.iter().find(|node| node.id == id).ok_or_else(|| "指定したメモが見つかりません".to_string())?;
    if !is_memo_node(&favorites, node) { return Err("指定したメモは編集できません".to_string()); }
    let mut documents = load_memo_documents(&app);
    let document = documents.entry(id).or_insert(MemoDocument { revision: 1, content: String::new(), saved_at: now_ms(), draft: None });
    if document.revision != expected_revision { return Err("メモの版が更新されています".to_string()); }
    document.draft = if document.content == content {
        None
    } else {
        Some(MemoDraft {
            content,
            updated_at: now_ms(),
        })
    };
    let result = document.clone();
    save_memo_documents(&app, &documents)?;
    Ok(result)
}

#[tauri::command]
fn save_memo_final(
    app: AppHandle,
    memo_lock: tauri::State<'_, MemoDocumentsWriteLock>,
    id: String,
    content: String,
    expected_revision: u64,
) -> Result<MemoDocument, String> {
    let _memo_guard = memo_lock.0.lock().unwrap();
    let favorites = load_favorites(&app);
    let node = favorites.iter().find(|node| node.id == id).ok_or_else(|| "指定したメモが見つかりません".to_string())?;
    if !is_memo_node(&favorites, node) { return Err("指定したメモは編集できません".to_string()); }
    let mut documents = load_memo_documents(&app);
    let document = documents.entry(id).or_insert(MemoDocument { revision: 1, content: String::new(), saved_at: now_ms(), draft: None });
    if document.revision != expected_revision { return Err("メモの版が更新されています".to_string()); }
    if document.content != content { document.revision += 1; document.content = content; document.saved_at = now_ms(); }
    document.draft = None;
    let result = document.clone();
    save_memo_documents(&app, &documents)?;
    Ok(result)
}

#[tauri::command]
fn add_memo_folder(
    app: AppHandle,
    favorite_lock: tauri::State<'_, FavoriteNodesWriteLock>,
    name: String,
    parent_id: String,
) -> Result<Vec<FavoriteNode>, String> {
    let _guard = favorite_lock.0.lock().unwrap();
    let trimmed = name.trim();
    if trimmed.is_empty() { return Err("フォルダ名を入力してください".to_string()); }
    let mut favorites = load_favorites(&app);
    let parent_valid = parent_id == MEMO_FOLDER_ID || (favorites.iter().any(|node| node.id == parent_id && node.node_type == FavoriteNodeType::Folder)
        && is_descendant_of(&favorites, &parent_id, MEMO_FOLDER_ID)
        && !is_descendant_of(&favorites, &parent_id, MEMO_TRASH_ID));
    if !parent_valid { return Err("メモの保存先が不正です".to_string()); }
    if has_duplicate_favorite_name(&favorites, &parent_id, FavoriteNodeType::Folder, trimmed, None) { return Err("同じ名前のフォルダが既に存在します".to_string()); }
    let order = favorites.iter().filter(|node| node.parent_id == parent_id).map(|node| node.order).max().map(|v| v + 1).unwrap_or(0);
    favorites.push(FavoriteNode { id: generate_favorite_node_id(), parent_id, node_type: FavoriteNodeType::Folder, name: trimmed.to_string(), value: String::new(), order, collapsed: false });
    save_favorites(&app, &favorites)?;
    Ok(favorites)
}

#[tauri::command]
fn move_memo_node_to(
    app: AppHandle,
    favorite_lock: tauri::State<'_, FavoriteNodesWriteLock>,
    id: String,
    new_parent_id: String,
    target_index: usize,
) -> Result<Vec<FavoriteNode>, String> {
    let _guard = favorite_lock.0.lock().unwrap();
    if [PINNED_FOLDER_ID, FAVORITES_FOLDER_ID, MEMO_FOLDER_ID, MEMO_TRASH_ID].contains(&id.as_str()) { return Err("予約フォルダは移動できません".to_string()); }
    let mut favorites = load_favorites(&app);
    let target_pos = favorites.iter().position(|node| node.id == id).ok_or_else(|| "指定したノードが見つかりません".to_string())?;
    let source_in_memo = is_descendant_of(&favorites, &favorites[target_pos].parent_id, MEMO_FOLDER_ID)
        || is_descendant_of(&favorites, &favorites[target_pos].parent_id, MEMO_TRASH_ID);
    let destination_valid = new_parent_id == MEMO_FOLDER_ID || new_parent_id == MEMO_TRASH_ID || (favorites.iter().any(|node| node.id == new_parent_id && node.node_type == FavoriteNodeType::Folder)
        && (is_descendant_of(&favorites, &new_parent_id, MEMO_FOLDER_ID) || is_descendant_of(&favorites, &new_parent_id, MEMO_TRASH_ID)));
    if !source_in_memo || !destination_valid { return Err("移動先が不正です".to_string()); }
    if favorites[target_pos].node_type == FavoriteNodeType::Folder && (id == new_parent_id || is_descendant_of(&favorites, &new_parent_id, &id)) { return Err("フォルダを自分自身の中に移動することはできません".to_string()); }
    let mut siblings: Vec<String> = favorites.iter().filter(|node| node.parent_id == new_parent_id && node.id != id).map(|node| node.id.clone()).collect();
    siblings.sort_by_key(|sid| favorites.iter().find(|node| node.id == *sid).map(|node| node.order).unwrap_or(0));
    siblings.insert(target_index.min(siblings.len()), id.clone());
    favorites[target_pos].parent_id = new_parent_id;
    for (order, sibling_id) in siblings.iter().enumerate() { if let Some(node) = favorites.iter_mut().find(|node| node.id == *sibling_id) { node.order = order as u32; } }
    save_favorites(&app, &favorites)?;
    Ok(favorites)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum MemoDeleteMode {
    MoveToTrash,
    PermanentlyDelete,
}

fn memo_delete_mode(
    favorites: &[FavoriteNode],
    node: &FavoriteNode,
) -> Result<MemoDeleteMode, String> {
    let in_trash = is_descendant_of(favorites, &node.parent_id, MEMO_TRASH_ID);
    if in_trash {
        return Ok(MemoDeleteMode::PermanentlyDelete);
    }
    if is_descendant_of(favorites, &node.parent_id, MEMO_FOLDER_ID) {
        return Ok(MemoDeleteMode::MoveToTrash);
    }
    Err("指定したノードはメモではありません".to_string())
}

fn memo_subtree_node_ids(favorites: &[FavoriteNode], id: &str) -> HashSet<String> {
    favorites
        .iter()
        .filter(|item| item.id == id || is_descendant_of(favorites, &item.parent_id, id))
        .map(|item| item.id.clone())
        .collect()
}

#[tauri::command]
fn delete_memo_node(
    app: AppHandle,
    favorite_lock: tauri::State<'_, FavoriteNodesWriteLock>,
    memo_lock: tauri::State<'_, MemoDocumentsWriteLock>,
    id: String,
) -> Result<Vec<FavoriteNode>, String> {
    let _favorite_guard = favorite_lock.0.lock().unwrap();
    let _memo_guard = memo_lock.0.lock().unwrap();
    if [PINNED_FOLDER_ID, FAVORITES_FOLDER_ID, MEMO_FOLDER_ID, MEMO_TRASH_ID].contains(&id.as_str()) { return Err("予約フォルダは削除できません".to_string()); }
    let mut favorites = load_favorites(&app);
    let node = favorites.iter().find(|node| node.id == id).cloned().ok_or_else(|| "指定したノードが見つかりません".to_string())?;
    let delete_mode = memo_delete_mode(&favorites, &node)?;
    if delete_mode == MemoDeleteMode::MoveToTrash {
        let next_order = favorites.iter().filter(|item| item.parent_id == MEMO_TRASH_ID).map(|item| item.order).max().unwrap_or(0) + 1;
        let target = favorites.iter_mut().find(|item| item.id == id).unwrap();
        target.parent_id = MEMO_TRASH_ID.to_string();
        target.order = next_order;
        save_favorites(&app, &favorites)?;
        return Ok(favorites);
    }
    let deleted = memo_subtree_node_ids(&favorites, &id);
    favorites.retain(|item| !deleted.contains(&item.id));
    save_favorites(&app, &favorites)?;
    let mut documents = load_memo_documents(&app);
    documents.retain(|memo_id, _| !deleted.contains(memo_id));
    save_memo_documents(&app, &documents)?;
    Ok(favorites)
}

#[cfg(test)]
mod memo_delete_tests {
    use super::*;

    fn node(id: &str, parent_id: &str, node_type: FavoriteNodeType) -> FavoriteNode {
        FavoriteNode {
            id: id.to_string(),
            parent_id: parent_id.to_string(),
            node_type,
            name: id.to_string(),
            value: String::new(),
            order: 0,
            collapsed: false,
        }
    }

    fn memo_tree() -> Vec<FavoriteNode> {
        vec![
            node(MEMO_FOLDER_ID, "", FavoriteNodeType::Folder),
            node(MEMO_TRASH_ID, "", FavoriteNodeType::Folder),
            node("active-memo", MEMO_FOLDER_ID, FavoriteNodeType::Memo),
            node("active-folder", MEMO_FOLDER_ID, FavoriteNodeType::Folder),
            node("trash-memo", MEMO_TRASH_ID, FavoriteNodeType::Memo),
            node("trash-folder", MEMO_TRASH_ID, FavoriteNodeType::Folder),
            node("nested-memo", "trash-folder", FavoriteNodeType::Memo),
        ]
    }

    #[test]
    fn active_memo_tree_nodes_move_to_trash() {
        let favorites = memo_tree();
        for id in ["active-memo", "active-folder"] {
            let node = favorites.iter().find(|item| item.id == id).unwrap();
            assert_eq!(
                memo_delete_mode(&favorites, node),
                Ok(MemoDeleteMode::MoveToTrash)
            );
        }
    }

    #[test]
    fn trashed_memo_is_permanently_deleted() {
        let favorites = memo_tree();
        let node = favorites.iter().find(|item| item.id == "trash-memo").unwrap();
        assert_eq!(
            memo_delete_mode(&favorites, node),
            Ok(MemoDeleteMode::PermanentlyDelete)
        );
        assert_eq!(
            memo_subtree_node_ids(&favorites, &node.id),
            HashSet::from([node.id.clone()])
        );
    }

    #[test]
    fn trashed_folder_deletes_descendant_memo_documents() {
        let favorites = memo_tree();
        let folder = favorites.iter().find(|item| item.id == "trash-folder").unwrap();
        assert_eq!(
            memo_delete_mode(&favorites, folder),
            Ok(MemoDeleteMode::PermanentlyDelete)
        );

        let deleted = memo_subtree_node_ids(&favorites, &folder.id);
        assert!(deleted.contains("trash-folder"));
        assert!(deleted.contains("nested-memo"));
        assert!(!deleted.contains("trash-memo"));

        let mut documents = HashMap::from([
            ("nested-memo".to_string(), ()),
            ("trash-memo".to_string(), ()),
        ]);
        documents.retain(|memo_id, _| !deleted.contains(memo_id));
        assert!(!documents.contains_key("nested-memo"));
        assert!(documents.contains_key("trash-memo"));
    }
}

// 新規追加フィールド用のデフォルト値。serde(default) を付けないと、旧バージョンで
// 保存された settings.json（このフィールドを持たない）の読み込み時に
// deserialize が失敗し、AppSettings 全体が Default::default() にフォールバックして
// 既存ユーザーの他の設定まで巻き添えで消えてしまうため付与する。
fn default_true() -> bool {
    true
}

// shutdown/restart/sleep_keyword は既存の url_convert_enabled 等と同様、後から追加した
// フィールド。旧バージョンの settings.json（このキーを持たない）を読み込んだ際に
// deserialize が失敗して AppSettings 全体がデフォルトへフォールバックしないよう、
// serde(default) で個別にデフォルト値を補う。
fn default_shutdown_keyword() -> String {
    DEFAULT_SHUTDOWN_KEYWORD.to_string()
}

fn default_restart_keyword() -> String {
    DEFAULT_RESTART_KEYWORD.to_string()
}

fn default_sleep_keyword() -> String {
    DEFAULT_SLEEP_KEYWORD.to_string()
}

fn default_recent_keyword() -> String {
    DEFAULT_RECENT_KEYWORD.to_string()
}

fn default_favorite_keyword() -> String {
    DEFAULT_FAVORITE_KEYWORD.to_string()
}

fn default_memo_keyword() -> String {
    DEFAULT_MEMO_KEYWORD.to_string()
}

fn default_recent_max_age_days() -> u32 {
    DEFAULT_RECENT_MAX_AGE_DAYS
}

fn default_recent_max_results() -> u32 {
    DEFAULT_RECENT_MAX_RESULTS
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct AppSettings {
    hotkey: String,
    file_search_enabled: bool,
    calc_enabled: bool,
    system_command_enabled: bool,
    #[serde(default = "default_shutdown_keyword")]
    shutdown_keyword: String,
    #[serde(default = "default_restart_keyword")]
    restart_keyword: String,
    #[serde(default = "default_sleep_keyword")]
    sleep_keyword: String,
    web_search_enabled: bool,
    copy_with_comma: bool,
    clipboard_enabled: bool,
    clipboard_prefix: String,
    clipboard_max_items: u32,
    ocr_enabled: bool,
    check_update_on_startup: bool,
    #[serde(default = "default_true")]
    url_convert_enabled: bool,
    #[serde(default)]
    url_convert_keep_space_encoded: bool,
    #[serde(default = "default_true")]
    recent_files_enabled: bool,
    #[serde(default = "default_recent_keyword")]
    recent_keyword: String,
    #[serde(default = "default_recent_max_age_days")]
    recent_max_age_days: u32,
    #[serde(default = "default_recent_max_results")]
    recent_max_results: u32,
    // `/recent` の「表示対象設定」。ファイル検索の `FolderEntry` はフォルダごとの設定だが、
    // こちらは /recent 機能全体で共有する単一のグローバル設定のため、AppSettings に
    // 直接持たせる（データ構造上分離。詳細は「/recent の表示対象設定」節を参照）。
    #[serde(default)]
    recent_include_folders: bool,
    #[serde(default = "default_extension_filter_mode")]
    recent_extension_filter_mode: ExtensionFilterMode,
    #[serde(default)]
    recent_blacklist_extensions: Vec<String>,
    #[serde(default)]
    recent_whitelist_extensions: Vec<String>,
    #[serde(default = "default_true")]
    path_paste_enabled: bool,
    #[serde(default = "default_true")]
    pin_enabled: bool,
    #[serde(default = "default_true")]
    favorite_enabled: bool,
    #[serde(default = "default_favorite_keyword")]
    favorite_keyword: String,
    #[serde(default = "default_true")]
    memo_enabled: bool,
    #[serde(default = "default_memo_keyword")]
    memo_keyword: String,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            hotkey: DEFAULT_HOTKEY.to_string(),
            file_search_enabled: true,
            calc_enabled: true,
            system_command_enabled: true,
            shutdown_keyword: DEFAULT_SHUTDOWN_KEYWORD.to_string(),
            restart_keyword: DEFAULT_RESTART_KEYWORD.to_string(),
            sleep_keyword: DEFAULT_SLEEP_KEYWORD.to_string(),
            web_search_enabled: true,
            copy_with_comma: true,
            clipboard_enabled: true,
            clipboard_prefix: DEFAULT_CLIPBOARD_PREFIX.to_string(),
            clipboard_max_items: DEFAULT_CLIPBOARD_MAX_ITEMS,
            ocr_enabled: true,
            check_update_on_startup: true,
            url_convert_enabled: true,
            url_convert_keep_space_encoded: false,
            recent_files_enabled: true,
            recent_keyword: DEFAULT_RECENT_KEYWORD.to_string(),
            recent_max_age_days: DEFAULT_RECENT_MAX_AGE_DAYS,
            recent_max_results: DEFAULT_RECENT_MAX_RESULTS,
            recent_include_folders: false,
            recent_extension_filter_mode: default_extension_filter_mode(),
            recent_blacklist_extensions: Vec::new(),
            recent_whitelist_extensions: Vec::new(),
            path_paste_enabled: true,
            pin_enabled: true,
            favorite_enabled: true,
            favorite_keyword: DEFAULT_FAVORITE_KEYWORD.to_string(),
            memo_enabled: true,
            memo_keyword: DEFAULT_MEMO_KEYWORD.to_string(),
        }
    }
}

// システムコマンド3キーワード＋クリップボード／最近使ったファイル／お気に入りの
// 呼び出しキーワードは、"/" に続く文字列として互いに重複してはならない（重複すると
// 前方一致判定でどちらのモードか一意に決まらないため）。`changing` には変更しようと
// しているフィールドの識別子（"shutdown"/"restart"/"sleep"/"clipboard"/"recent"/
// "favorite"）を渡し、自分自身は比較対象から除外する。大文字小文字の区別は、
// フロントエンドの前方一致判定ロジック（`toLowerCase()` による比較）に合わせて行わない。
fn validate_unique_keyword(
    settings: &AppSettings,
    changing: &str,
    new_value: &str,
) -> Result<(), String> {
    let entries: [(&str, &str); 7] = [
        ("shutdown", settings.shutdown_keyword.as_str()),
        ("restart", settings.restart_keyword.as_str()),
        ("sleep", settings.sleep_keyword.as_str()),
        ("clipboard", settings.clipboard_prefix.as_str()),
        ("recent", settings.recent_keyword.as_str()),
        ("favorite", settings.favorite_keyword.as_str()),
        ("memo", settings.memo_keyword.as_str()),
    ];
    let conflict = entries
        .iter()
        .any(|(name, kw)| *name != changing && kw.to_lowercase() == new_value.to_lowercase());
    if conflict {
        return Err("他のキーワードと重複しています".to_string());
    }
    Ok(())
}

fn load_app_settings(app: &AppHandle) -> AppSettings {
    let Ok(store) = app.store(SETTINGS_STORE) else {
        return AppSettings::default();
    };
    store
        .get("appSettings")
        .and_then(|v| serde_json::from_value(v.clone()).ok())
        .unwrap_or_default()
}

fn save_app_settings(app: &AppHandle, settings: &AppSettings) -> Result<(), String> {
    let store = app.store(SETTINGS_STORE).map_err(|e| e.to_string())?;
    store.set("appSettings", serde_json::json!(settings));
    store.save().map_err(|e| e.to_string())
}

#[tauri::command]
fn get_app_settings(app: AppHandle) -> AppSettings {
    load_app_settings(&app)
}

#[tauri::command]
fn set_file_search_enabled(app: AppHandle, enabled: bool) -> Result<AppSettings, String> {
    let mut settings = load_app_settings(&app);
    settings.file_search_enabled = enabled;
    save_app_settings(&app, &settings)?;
    Ok(settings)
}

#[tauri::command]
fn set_calc_enabled(app: AppHandle, enabled: bool) -> Result<AppSettings, String> {
    let mut settings = load_app_settings(&app);
    settings.calc_enabled = enabled;
    save_app_settings(&app, &settings)?;
    Ok(settings)
}

#[tauri::command]
fn set_system_command_enabled(app: AppHandle, enabled: bool) -> Result<AppSettings, String> {
    let mut settings = load_app_settings(&app);
    settings.system_command_enabled = enabled;
    save_app_settings(&app, &settings)?;
    Ok(settings)
}

#[tauri::command]
fn set_system_command_keyword(
    app: AppHandle,
    command: String,
    keyword: String,
) -> Result<AppSettings, String> {
    let trimmed = keyword.trim();
    if trimmed.is_empty() {
        return Err("キーワードを入力してください".to_string());
    }
    let mut settings = load_app_settings(&app);
    validate_unique_keyword(&settings, command.as_str(), trimmed)?;
    match command.as_str() {
        "shutdown" => settings.shutdown_keyword = trimmed.to_string(),
        "restart" => settings.restart_keyword = trimmed.to_string(),
        "sleep" => settings.sleep_keyword = trimmed.to_string(),
        _ => return Err(format!("unknown command: {command}")),
    }
    save_app_settings(&app, &settings)?;
    Ok(settings)
}

#[tauri::command]
fn set_web_search_enabled(app: AppHandle, enabled: bool) -> Result<AppSettings, String> {
    let mut settings = load_app_settings(&app);
    settings.web_search_enabled = enabled;
    save_app_settings(&app, &settings)?;
    Ok(settings)
}

#[tauri::command]
fn set_copy_with_comma(app: AppHandle, enabled: bool) -> Result<AppSettings, String> {
    let mut settings = load_app_settings(&app);
    settings.copy_with_comma = enabled;
    save_app_settings(&app, &settings)?;
    Ok(settings)
}

#[tauri::command]
fn set_url_convert_enabled(app: AppHandle, enabled: bool) -> Result<AppSettings, String> {
    let mut settings = load_app_settings(&app);
    settings.url_convert_enabled = enabled;
    save_app_settings(&app, &settings)?;
    Ok(settings)
}

#[tauri::command]
fn set_url_convert_keep_space_encoded(
    app: AppHandle,
    enabled: bool,
) -> Result<AppSettings, String> {
    let mut settings = load_app_settings(&app);
    settings.url_convert_keep_space_encoded = enabled;
    save_app_settings(&app, &settings)?;
    Ok(settings)
}

#[tauri::command]
fn set_clipboard_enabled(app: AppHandle, enabled: bool) -> Result<AppSettings, String> {
    let mut settings = load_app_settings(&app);
    settings.clipboard_enabled = enabled;
    save_app_settings(&app, &settings)?;
    Ok(settings)
}

#[tauri::command]
fn set_clipboard_prefix(app: AppHandle, prefix: String) -> Result<AppSettings, String> {
    let trimmed = prefix.trim();
    if trimmed.is_empty() {
        return Err("プレフィックスを入力してください".to_string());
    }
    let mut settings = load_app_settings(&app);
    validate_unique_keyword(&settings, "clipboard", trimmed)?;
    settings.clipboard_prefix = trimmed.to_string();
    save_app_settings(&app, &settings)?;
    Ok(settings)
}

#[tauri::command]
fn set_clipboard_max_items(app: AppHandle, max_items: u32) -> Result<AppSettings, String> {
    if !(1..=200).contains(&max_items) {
        return Err("1件以上200件以下の整数を指定してください".to_string());
    }
    let mut settings = load_app_settings(&app);
    settings.clipboard_max_items = max_items;
    save_app_settings(&app, &settings)?;
    Ok(settings)
}

#[tauri::command]
fn set_recent_files_enabled(app: AppHandle, enabled: bool) -> Result<AppSettings, String> {
    let mut settings = load_app_settings(&app);
    settings.recent_files_enabled = enabled;
    save_app_settings(&app, &settings)?;
    Ok(settings)
}

#[tauri::command]
fn set_recent_keyword(app: AppHandle, keyword: String) -> Result<AppSettings, String> {
    let trimmed = keyword.trim();
    if trimmed.is_empty() {
        return Err("キーワードを入力してください".to_string());
    }
    let mut settings = load_app_settings(&app);
    validate_unique_keyword(&settings, "recent", trimmed)?;
    settings.recent_keyword = trimmed.to_string();
    save_app_settings(&app, &settings)?;
    Ok(settings)
}

#[tauri::command]
fn set_recent_max_age_days(app: AppHandle, days: u32) -> Result<AppSettings, String> {
    if !(1..=3650).contains(&days) {
        return Err("1日以上3650日以下の整数を指定してください".to_string());
    }
    let mut settings = load_app_settings(&app);
    settings.recent_max_age_days = days;
    save_app_settings(&app, &settings)?;
    Ok(settings)
}

#[tauri::command]
fn set_recent_max_results(app: AppHandle, max_results: u32) -> Result<AppSettings, String> {
    if !(1..=200).contains(&max_results) {
        return Err("1件以上200件以下の整数を指定してください".to_string());
    }
    let mut settings = load_app_settings(&app);
    settings.recent_max_results = max_results;
    save_app_settings(&app, &settings)?;
    Ok(settings)
}

/// `/recent` の「表示対象設定」（フォルダを対象に含めるか・拡張子フィルタリング）を
/// まとめて保存する。ファイル検索の `set_folder_settings` と同じ「一括保存」パターン
/// だが、対象がフォルダ単位ではなく `/recent` 機能全体の単一設定である点が異なる
/// （`FolderEntry` とは独立したグローバル設定。詳細は「/recent の表示対象設定」節を参照）。
/// 拡張子タグの正規化は `normalize_extensions` を共有する。
#[tauri::command]
fn set_recent_display_settings(
    app: AppHandle,
    include_folders: bool,
    extension_filter_mode: ExtensionFilterMode,
    blacklist_extensions: Vec<String>,
    whitelist_extensions: Vec<String>,
) -> Result<AppSettings, String> {
    let mut settings = load_app_settings(&app);
    settings.recent_include_folders = include_folders;
    settings.recent_extension_filter_mode = extension_filter_mode;
    settings.recent_blacklist_extensions = normalize_extensions(blacklist_extensions);
    settings.recent_whitelist_extensions = normalize_extensions(whitelist_extensions);
    save_app_settings(&app, &settings)?;
    Ok(settings)
}

#[tauri::command]
fn set_path_paste_enabled(app: AppHandle, enabled: bool) -> Result<AppSettings, String> {
    let mut settings = load_app_settings(&app);
    settings.path_paste_enabled = enabled;
    save_app_settings(&app, &settings)?;
    Ok(settings)
}

#[tauri::command]
fn set_pin_enabled(app: AppHandle, enabled: bool) -> Result<AppSettings, String> {
    let mut settings = load_app_settings(&app);
    settings.pin_enabled = enabled;
    save_app_settings(&app, &settings)?;
    Ok(settings)
}

#[tauri::command]
fn set_favorite_enabled(app: AppHandle, enabled: bool) -> Result<AppSettings, String> {
    let mut settings = load_app_settings(&app);
    settings.favorite_enabled = enabled;
    save_app_settings(&app, &settings)?;
    Ok(settings)
}

#[tauri::command]
fn set_favorite_keyword(app: AppHandle, keyword: String) -> Result<AppSettings, String> {
    let trimmed = keyword.trim();
    if trimmed.is_empty() {
        return Err("キーワードを入力してください".to_string());
    }
    let mut settings = load_app_settings(&app);
    validate_unique_keyword(&settings, "favorite", trimmed)?;
    settings.favorite_keyword = trimmed.to_string();
    save_app_settings(&app, &settings)?;
    Ok(settings)
}

#[tauri::command]
fn set_memo_enabled(app: AppHandle, enabled: bool) -> Result<AppSettings, String> {
    let mut settings = load_app_settings(&app);
    settings.memo_enabled = enabled;
    save_app_settings(&app, &settings)?;
    Ok(settings)
}

#[tauri::command]
fn set_memo_keyword(app: AppHandle, keyword: String) -> Result<AppSettings, String> {
    let trimmed = keyword.trim();
    if trimmed.is_empty() {
        return Err("キーワードを入力してください".to_string());
    }
    let mut settings = load_app_settings(&app);
    validate_unique_keyword(&settings, "memo", trimmed)?;
    settings.memo_keyword = trimmed.to_string();
    save_app_settings(&app, &settings)?;
    Ok(settings)
}

#[tauri::command]
fn get_recent_files(app: AppHandle) -> Result<Vec<recent_files::RecentFile>, String> {
    let settings = load_app_settings(&app);
    let max_results = settings.recent_max_results as usize;
    let max_age_days = settings.recent_max_age_days as i64;
    let include_folders = settings.recent_include_folders;
    let extension_filter_mode = settings.recent_extension_filter_mode;
    // 「表示対象設定」節の通り、拡張子フィルタリングはブラックリスト/ホワイトリストを
    // 独立管理しているため、現在のモードに対応する側のみを選んで渡す
    // （`search_files` の `active_extensions` 選択と同じパターン）。
    let extensions = match extension_filter_mode {
        ExtensionFilterMode::Blacklist => settings.recent_blacklist_extensions.clone(),
        ExtensionFilterMode::Whitelist => settings.recent_whitelist_extensions.clone(),
    };
    // レジストリ・.lnk/.url パース等、原因調査中の異常終了の疑いがある処理を
    // catch_unwind で保護する。1件の異常なエントリでアプリ全体を巻き込まないため
    // （dev ビルドは panic = "unwind" のため有効。release ビルドは
    // `[profile.release] panic = "abort"` のため catch_unwind は効かず、
    // このガードはあくまで開発時の安全対策であることに注意）。
    std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        recent_files::get_recent_files(
            max_results,
            max_age_days,
            include_folders,
            extension_filter_mode,
            &extensions,
        )
    }))
    .map_err(|payload| {
        let message = panic_payload_message(payload.as_ref());
        log_debug(&format!("[main] get_recent_files panicked: {message}"));
        format!("最近使ったファイル一覧の取得に失敗しました: {message}")
    })
}

#[tauri::command]
fn set_ocr_enabled(app: AppHandle, enabled: bool) -> Result<AppSettings, String> {
    let mut settings = load_app_settings(&app);
    settings.ocr_enabled = enabled;
    save_app_settings(&app, &settings)?;
    Ok(settings)
}

#[tauri::command]
fn set_check_update_on_startup(app: AppHandle, enabled: bool) -> Result<AppSettings, String> {
    let mut settings = load_app_settings(&app);
    settings.check_update_on_startup = enabled;
    save_app_settings(&app, &settings)?;
    Ok(settings)
}

/// Windows OCR API (Windows.Media.Ocr) 経由でテキスト抽出を行う。
/// COM の初期化とブロッキング WinRT 呼び出しが必要なため、spawn_blocking で呼ぶ。
#[cfg(windows)]
mod ocr {
    use windows::Globalization::Language;
    use windows::Graphics::Imaging::{BitmapPixelFormat, SoftwareBitmap};
    use windows::Media::Ocr::OcrEngine;
    use windows::Storage::Streams::{DataWriter, InMemoryRandomAccessStream};
    use windows::Win32::System::Com::{CoInitializeEx, CoUninitialize, COINIT_MULTITHREADED};
    use windows::core::HSTRING;

    /// CoInitializeEx の RAII ラッパー。成功した初期化（S_OK / S_FALSE）は
    /// Drop 時に CoUninitialize を呼ぶ。RPC_E_CHANGED_MODE はエラーのため呼ばない。
    struct ComInit(bool);
    impl ComInit {
        fn new() -> Self {
            let hr = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) };
            Self(hr.is_ok())
        }
    }
    impl Drop for ComInit {
        fn drop(&mut self) {
            if self.0 {
                unsafe { CoUninitialize() }
            }
        }
    }

    pub fn run(rgba: &[u8], width: u32, height: u32) -> Result<String, String> {
        let _com = ComInit::new();

        // RGBA bytes → IBuffer（DataWriter の内部バッファ経由。StoreAsync 不要）
        let stream = InMemoryRandomAccessStream::new().map_err(|e| e.to_string())?;
        let writer = DataWriter::CreateDataWriter(&stream).map_err(|e| e.to_string())?;
        writer.WriteBytes(rgba).map_err(|e| e.to_string())?;
        let buffer = writer.DetachBuffer().map_err(|e| e.to_string())?;
        drop(writer);
        drop(stream);

        // IBuffer → SoftwareBitmap (Rgba8 形式)
        let bitmap = SoftwareBitmap::CreateCopyFromBuffer(
            &buffer,
            BitmapPixelFormat::Rgba8,
            width as i32,
            height as i32,
        )
        .map_err(|e| e.to_string())?;

        // Bgra8 に変換（OcrEngine が推奨するフォーマット）
        let bitmap = SoftwareBitmap::Convert(&bitmap, BitmapPixelFormat::Bgra8)
            .map_err(|e| e.to_string())?;

        // OCR エンジン（日本語優先・英語フォールバック）
        let engine = try_lang("ja")
            .or_else(|| try_lang("en"))
            .ok_or_else(|| {
                "OCR言語パックが見つかりません。\
                 設定→時刻と言語→言語から日本語または英語のOCRパックをインストールしてください。"
                    .to_string()
            })?;

        // OCR 実行。.get() でブロッキング待機（spawn_blocking 内なので安全）
        let result = engine
            .RecognizeAsync(&bitmap)
            .map_err(|e| e.to_string())?
            .get()
            .map_err(|e| e.to_string())?;

        // 各行を (Y座標, テキスト) で収集し、縦位置昇順にソートして改行結合。
        // OcrLine 自体は BoundingRect を持たないため、先頭ワードの BoundingRect.Y を代用する。
        // 単語連結: 直前と現在の単語が両方とも ASCII 英数字のみの場合にのみスペースを挿入し、
        // それ以外（日本語・CJK 等を含む組み合わせ）はスペースなしで連結する。
        let lines = result.Lines().map_err(|e| e.to_string())?;
        let count = lines.Size().map_err(|e| e.to_string())?;
        let mut entries: Vec<(f32, String)> = Vec::with_capacity(count as usize);
        for i in 0..count {
            let line = lines.GetAt(i).map_err(|e| e.to_string())?;
            let words = line.Words().map_err(|e| e.to_string())?;
            let wc = words.Size().map_err(|e| e.to_string())?;

            let y = words
                .GetAt(0)
                .ok()
                .and_then(|w| w.BoundingRect().ok())
                .map(|r| r.Y)
                .unwrap_or(0.0);

            let mut line_text = String::new();
            let mut prev_ascii_alnum = false;
            for j in 0..wc {
                let w = words.GetAt(j).map_err(|e| e.to_string())?;
                let word = w.Text().map_err(|e| e.to_string())?.to_string();
                let curr_ascii_alnum = word.chars().all(|c| c.is_ascii_alphanumeric());
                if !line_text.is_empty() && prev_ascii_alnum && curr_ascii_alnum {
                    line_text.push(' ');
                }
                line_text.push_str(&word);
                prev_ascii_alnum = curr_ascii_alnum;
            }

            entries.push((y, line_text));
        }
        entries.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap_or(std::cmp::Ordering::Equal));
        Ok(entries.into_iter().map(|(_, t)| t).collect::<Vec<_>>().join("\n"))
    }

    fn try_lang(code: &str) -> Option<OcrEngine> {
        Language::CreateLanguage(&HSTRING::from(code))
            .ok()
            .and_then(|l| OcrEngine::TryCreateFromLanguage(&l).ok())
    }
}

#[cfg(windows)]
fn run_ocr(rgba: Vec<u8>, width: u32, height: u32) -> Result<String, String> {
    ocr::run(&rgba, width, height)
}

#[cfg(not(windows))]
fn run_ocr(_rgba: Vec<u8>, _width: u32, _height: u32) -> Result<String, String> {
    Err("Windows専用機能です".to_string())
}

#[tauri::command]
async fn ocr_from_clipboard(app: AppHandle) -> Result<String, String> {
    let settings = load_app_settings(&app);
    if !settings.ocr_enabled {
        return Err("OCR機能が無効です".to_string());
    }
    let image = app
        .clipboard()
        .read_image()
        .map_err(|_| "クリップボードに画像がありません".to_string())?;
    let width = image.width();
    let height = image.height();
    let rgba = image.rgba().to_vec();

    tauri::async_runtime::spawn_blocking(move || run_ocr(rgba, width, height))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
fn set_hotkey(app: AppHandle, accelerator: String) -> Result<AppSettings, String> {
    let new_shortcut = Shortcut::from_str(&accelerator).map_err(|e| e.to_string())?;
    if new_shortcut.mods.is_empty() {
        return Err("修飾キー（Ctrl/Alt/Shift/Win）を1つ以上含めてください".to_string());
    }

    let mut settings = load_app_settings(&app);
    let old_accelerator = settings.hotkey.clone();

    if old_accelerator != accelerator {
        app.global_shortcut()
            .unregister(old_accelerator.as_str())
            .map_err(|e| e.to_string())?;

        if let Err(e) = app.global_shortcut().register(accelerator.as_str()) {
            let _ = app.global_shortcut().register(old_accelerator.as_str());
            return Err(e.to_string());
        }
    }

    settings.hotkey = accelerator;
    save_app_settings(&app, &settings)?;

    if let Some(tray) = app.tray_by_id("main-tray") {
        let _ = tray.set_tooltip(Some(tray_tooltip(&settings.hotkey)));
    }

    Ok(settings)
}

fn tray_tooltip(hotkey: &str) -> String {
    format!("WinLauncher — {hotkey}")
}

/// ウィンドウサイズ（論理ピクセル）。位置とは異なり、サイズのみ永続化する。
/// 保存はフロントエンドが `onResized` イベントから直接 `settings.json` の
/// "windowSize" キーへ書き込み、適用はここで起動時に読み込んで行う。
#[derive(Debug, Deserialize)]
struct WindowSize {
    width: f64,
    height: f64,
}

fn load_window_size(app: &AppHandle) -> Option<WindowSize> {
    let store = app.store(SETTINGS_STORE).ok()?;
    store
        .get("windowSize")
        .and_then(|v| serde_json::from_value(v.clone()).ok())
}

/// メインウィンドウを `AddClipboardFormatListener` でクリップボード変更通知の受信者として
/// 登録する。`WM_CLIPBOARDUPDATE` 受信時はウィンドウのメッセージループ（メインスレッド）を
/// ブロックしないよう、即座に別スレッドへ処理を逃がして `handle_clipboard_change` を呼ぶ。
#[cfg(windows)]
fn register_clipboard_listener(window: &tauri::WebviewWindow) {
    use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, WPARAM};
    use windows::Win32::System::DataExchange::AddClipboardFormatListener;
    use windows::Win32::UI::Shell::{DefSubclassProc, SetWindowSubclass};
    use windows::Win32::UI::WindowsAndMessaging::WM_CLIPBOARDUPDATE;

    unsafe extern "system" fn subclass_proc(
        hwnd: HWND,
        msg: u32,
        wparam: WPARAM,
        lparam: LPARAM,
        _subclass_id: usize,
        _ref_data: usize,
    ) -> LRESULT {
        if msg == WM_CLIPBOARDUPDATE {
            if let Some(app) = APP_HANDLE.get() {
                let app = app.clone();
                std::thread::spawn(move || handle_clipboard_change(app));
            }
        }
        unsafe { DefSubclassProc(hwnd, msg, wparam, lparam) }
    }

    if let Ok(hwnd) = window.hwnd() {
        unsafe {
            let _ = SetWindowSubclass(hwnd, Some(subclass_proc), 2, 0);
            let _ = AddClipboardFormatListener(hwnd);
        }
    }
}

#[cfg(not(windows))]
fn register_clipboard_listener(_window: &tauri::WebviewWindow) {}

/// クリップボード変更検知後の実処理（別スレッド上で実行）。画像が取得できた場合は
/// Rust 側でバイナリのままキャッシュし、フロントエンドには ID とサムネイルのみを渡す。
/// 画像が取得できない場合（テキストなど）は種別のみを通知し、実際の取得は
/// フロントエンド側に委ねる（テキストは IPC を通っても軽量なため変更不要）。
fn handle_clipboard_change(app: AppHandle) {
    let settings = load_app_settings(&app);
    if !settings.clipboard_enabled {
        return;
    }

    match app.clipboard().read_image() {
        Ok(image) => {
            let width = image.width();
            let height = image.height();
            let Some(img_buf) = image::RgbaImage::from_raw(width, height, image.rgba().to_vec())
            else {
                return;
            };

            let mut png_bytes = Vec::new();
            if image::DynamicImage::ImageRgba8(img_buf.clone())
                .write_to(&mut std::io::Cursor::new(&mut png_bytes), image::ImageFormat::Png)
                .is_err()
            {
                return;
            }

            let thumb = if width > CLIPBOARD_THUMBNAIL_MAX_WIDTH {
                let scale = CLIPBOARD_THUMBNAIL_MAX_WIDTH as f32 / width as f32;
                let thumb_height = ((height as f32) * scale).round().max(1.0) as u32;
                image::imageops::resize(
                    &img_buf,
                    CLIPBOARD_THUMBNAIL_MAX_WIDTH,
                    thumb_height,
                    image::imageops::FilterType::Triangle,
                )
            } else {
                img_buf
            };

            let mut thumb_png = Vec::new();
            if image::DynamicImage::ImageRgba8(thumb)
                .write_to(&mut std::io::Cursor::new(&mut thumb_png), image::ImageFormat::Png)
                .is_err()
            {
                return;
            }

            use base64::Engine;
            let thumbnail_data_url = format!(
                "data:image/png;base64,{}",
                base64::engine::general_purpose::STANDARD.encode(&thumb_png)
            );

            let id = generate_clipboard_image_id();
            if let Some(cache) = app.try_state::<ClipboardImageCache>() {
                cache.insert(id.clone(), png_bytes, settings.clipboard_max_items as usize);
            }

            eprintln!(
                "[clipboard] emitting image id={id} thumbnail_data_url[..50]={:?}",
                &thumbnail_data_url[..thumbnail_data_url.len().min(50)]
            );

            let _ = app.emit(
                "clipboard-changed",
                ClipboardChangedPayload::Image {
                    id,
                    thumbnail_data_url,
                    width,
                    height,
                    timestamp: now_ms(),
                },
            );
        }
        Err(_) => {
            let _ = app.emit("clipboard-changed", ClipboardChangedPayload::Text);
        }
    }
}

/// `ClipboardImageCache` から取得した PNG バイナリを RGBA にデコードし、
/// Win32 API（`SetClipboardData(CF_DIB, ...)`）で直接クリップボードへ書き込む。
#[cfg(windows)]
fn write_image_to_clipboard(width: u32, height: u32, rgba: &[u8]) -> Result<(), String> {
    use windows::Win32::Foundation::HANDLE;
    use windows::Win32::Graphics::Gdi::BITMAPINFOHEADER;
    use windows::Win32::System::DataExchange::{
        CloseClipboard, EmptyClipboard, OpenClipboard, SetClipboardData,
    };
    use windows::Win32::System::Memory::{GlobalAlloc, GlobalLock, GlobalUnlock, GMEM_MOVEABLE};
    use windows::Win32::System::Ole::CF_DIB;

    let header_size = std::mem::size_of::<BITMAPINFOHEADER>();
    let row_size = (width as usize) * 4;
    let pixel_data_size = row_size * (height as usize);
    let total_size = header_size + pixel_data_size;

    // ボトムアップ DIB のため行を上下反転しつつ、RGBA → BGRA に並べ替える
    let mut bgra_bottom_up = vec![0u8; pixel_data_size];
    for y in 0..height as usize {
        let src_row = &rgba[y * row_size..(y + 1) * row_size];
        let dst_y = height as usize - 1 - y;
        let dst_row = &mut bgra_bottom_up[dst_y * row_size..(dst_y + 1) * row_size];
        for x in 0..width as usize {
            let i = x * 4;
            dst_row[i] = src_row[i + 2];
            dst_row[i + 1] = src_row[i + 1];
            dst_row[i + 2] = src_row[i];
            dst_row[i + 3] = src_row[i + 3];
        }
    }

    let header = BITMAPINFOHEADER {
        biSize: header_size as u32,
        biWidth: width as i32,
        biHeight: height as i32,
        biPlanes: 1,
        biBitCount: 32,
        biCompression: 0, // BI_RGB
        biSizeImage: pixel_data_size as u32,
        ..Default::default()
    };

    unsafe {
        let hglobal = GlobalAlloc(GMEM_MOVEABLE, total_size).map_err(|e| e.to_string())?;
        let ptr = GlobalLock(hglobal);
        if ptr.is_null() {
            return Err("クリップボード用メモリの確保に失敗しました".to_string());
        }
        std::ptr::copy_nonoverlapping(&header as *const _ as *const u8, ptr as *mut u8, header_size);
        std::ptr::copy_nonoverlapping(
            bgra_bottom_up.as_ptr(),
            (ptr as *mut u8).add(header_size),
            pixel_data_size,
        );
        let _ = GlobalUnlock(hglobal);

        OpenClipboard(None).map_err(|e| e.to_string())?;
        let _ = EmptyClipboard();
        let result = SetClipboardData(CF_DIB.0 as u32, Some(HANDLE(hglobal.0)));
        let _ = CloseClipboard();
        result.map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[cfg(not(windows))]
fn write_image_to_clipboard(_width: u32, _height: u32, _rgba: &[u8]) -> Result<(), String> {
    Err("unsupported platform".to_string())
}

#[tauri::command]
fn paste_clipboard_image(id: String, cache: tauri::State<ClipboardImageCache>) -> Result<(), String> {
    let png_bytes = cache
        .get(&id)
        .ok_or_else(|| "画像が見つかりません".to_string())?;
    let img = image::load_from_memory(&png_bytes)
        .map_err(|e| e.to_string())?
        .into_rgba8();
    let (width, height) = img.dimensions();
    write_image_to_clipboard(width, height, img.as_raw())
}

/// `exclude_paths` はピン止め済みファイルのパス一覧（「ピン止め・お気に入り・メモ機能」
/// 節を参照）。呼び出し元（フロントエンド）はクエリが空のときのみこの引数へピン止め
/// 済みパスを渡し、それ以外（クエリに文字が入力されている場合）は空配列を渡す。
/// この使い分けにより、クエリが空のときだけピン止めブロックとの重複表示を避け、
/// クエリ入力中はピン止め済みファイルも通常の関連度順のまま表示される
/// （00-requirements.md「ピン止め・お気に入り・メモ機能」節を参照）。
#[tauri::command]
fn search_files(app: AppHandle, query: String, exclude_paths: Vec<String>) -> Vec<FileEntry> {
    let enabled_dirs: Vec<FolderEntry> = load_folders(&app)
        .into_iter()
        .filter(|f| f.enabled)
        .collect();

    let mut results = Vec::new();
    if enabled_dirs.is_empty() {
        return results;
    }

    let exclude_set: HashSet<String> = exclude_paths.into_iter().collect();
    let query_lower = query.to_lowercase();

    'outer: for dir in &enabled_dirs {
        let search_dir = Path::new(&dir.path);
        if !search_dir.exists() {
            continue;
        }
        for entry in WalkDir::new(search_dir)
            .follow_links(true)
            .max_depth(dir.max_depth as usize)
        {
            let Ok(entry) = entry else { continue };
            // フォルダ自身（走査ルート、depth 0）は「フォルダ自体を検索対象に含める」
            // 設定に関わらず結果に含めない（既存の「フォルダは検索対象外」挙動と
            // 同様、検索フォルダ自身が結果に出るのは意図しない）。
            if entry.depth() == 0 {
                continue;
            }
            let is_file = entry.file_type().is_file();
            let is_dir = entry.file_type().is_dir();
            if !is_file && !(is_dir && dir.include_folders) {
                continue;
            }
            // 拡張子フィルタリングはファイルのみに適用する（フォルダは対象外）。
            let active_extensions = match dir.extension_filter_mode {
                ExtensionFilterMode::Blacklist => &dir.blacklist_extensions,
                ExtensionFilterMode::Whitelist => &dir.whitelist_extensions,
            };
            if is_file
                && !passes_extension_filter(
                    entry.path(),
                    &dir.extension_filter_mode,
                    active_extensions,
                )
            {
                continue;
            }
            let name = entry.file_name().to_string_lossy().to_string();
            if query_lower.is_empty() || name.to_lowercase().contains(&query_lower) {
                let path = entry.path().to_string_lossy().to_string();
                // ピン止め済みパスの除外（呼び出し元がクエリ空時のみ渡す。詳細は
                // 関数doc・「ピン止め・お気に入り・メモ機能」節を参照）。アイコン取得
                // （比較的コストのある処理）より前に判定し、除外対象では行わない。
                if exclude_set.contains(&path) {
                    continue;
                }
                let icon = shell_icon::get_icon_data_url(&path);
                results.push(FileEntry { name, path, icon });
                if results.len() >= MAX_SEARCH_RESULTS {
                    break 'outer;
                }
            }
        }
    }

    results
}

/// `cmd /C start "" <path>` は cmd.exe が `/C` 以降の引数を連結して1つの
/// コマンドラインとして再パースするため、ファイル名に `&` `|` `^` 等が含まれる場合に
/// コマンドインジェクションが発生し得る。`ShellExecuteW` はファイルパスを丸ごと1つの
/// 文字列として渡すだけで、シェルとしての再パース・特殊文字の解釈を行わないため安全。
/// `cfg(not(windows))` 側は `cargo build` を非Windows環境でも通すためのフォールバック
/// （このアプリ自体は Windows 専用）。
#[cfg(windows)]
fn open_file(path: &str) -> Result<(), String> {
    use std::os::windows::ffi::OsStrExt;
    use windows::core::PCWSTR;
    use windows::Win32::UI::Shell::ShellExecuteW;
    use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

    let wide_path: Vec<u16> = std::ffi::OsStr::new(path)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();

    let result = unsafe {
        ShellExecuteW(
            None,
            PCWSTR::null(),
            PCWSTR(wide_path.as_ptr()),
            PCWSTR::null(),
            PCWSTR::null(),
            SW_SHOWNORMAL,
        )
    };

    // ShellExecute の仕様：成功時は 32 を超える値、失敗時は 32 以下のエラーコードを返す
    if (result.0 as isize) <= 32 {
        return Err(format!(
            "ファイルを開けませんでした（エラーコード: {}）",
            result.0 as isize
        ));
    }
    Ok(())
}

#[cfg(not(windows))]
fn open_file(_path: &str) -> Result<(), String> {
    Err("unsupported platform".to_string())
}

#[tauri::command]
fn launch_file(path: String) -> Result<(), String> {
    open_file(&path)
}

/// 選択中のファイルの格納フォルダをエクスプローラーで開く（Shift+Enter）。
/// 対象が `.lnk` の場合は、`.lnk` 自身のフォルダではなくリンク先の実ファイルの
/// フォルダを開く（`recent_files::resolve_lnk_target_path` でリンク先解決を再利用し、
/// `/recent` 側のリンク解決ロジックと挙動を揃える）。リンク解決に失敗した場合は
/// `.lnk` 自身のフォルダを開くフォールバックとする。フォルダを開く処理自体は
/// `open_file`（`ShellExecuteW` にディレクトリパスを渡すとエクスプローラーが開く）を
/// そのまま流用する。
#[tauri::command]
fn open_containing_folder(path: String) -> Result<(), String> {
    let file_path = Path::new(&path);

    let is_lnk = file_path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.eq_ignore_ascii_case("lnk"))
        .unwrap_or(false);

    let resolved_path = if is_lnk {
        recent_files::resolve_lnk_target_path(file_path).unwrap_or(path)
    } else {
        path
    };

    let parent = Path::new(&resolved_path)
        .parent()
        .ok_or_else(|| "格納フォルダを取得できませんでした".to_string())?;

    open_file(&parent.to_string_lossy())
}

#[tauri::command]
fn execute_system_command(action: String) -> Result<(), String> {
    // 400_テスト・バグ修正：フロントエンド側の記録と突き合わせるため、実際にIPCで
    // action を受信した時点を、OS操作（プロセスspawn）より前に記録する。暫定計測の
    // 扱いは src/lib/uiDebugLog.ts のコメントを参照（意図的に残している）。
    let _ = log_ui_event(format!("[rust] execute_system_command received action={action}"));
    let result = match action.as_str() {
        "shutdown" => std::process::Command::new("shutdown")
            .args(["/s", "/t", "0"])
            .spawn(),
        "restart" => std::process::Command::new("shutdown")
            .args(["/r", "/t", "0"])
            .spawn(),
        "sleep" => std::process::Command::new("rundll32.exe")
            .args(["powrprof.dll,SetSuspendState", "0,1,0"])
            .spawn(),
        _ => return Err(format!("unknown action: {action}")),
    };
    result.map(|_| ()).map_err(|e| e.to_string())
}

#[derive(Debug, Clone, Copy)]
enum Token {
    Num(f64),
    Plus,
    Minus,
    Star,
    Slash,
    LParen,
    RParen,
}

fn tokenize(input: &str) -> Option<Vec<Token>> {
    let chars: Vec<char> = input.chars().collect();
    let mut tokens = Vec::new();
    let mut i = 0;
    while i < chars.len() {
        let c = chars[i];
        match c {
            _ if c.is_whitespace() => i += 1,
            '+' => {
                tokens.push(Token::Plus);
                i += 1;
            }
            '-' => {
                tokens.push(Token::Minus);
                i += 1;
            }
            '*' => {
                tokens.push(Token::Star);
                i += 1;
            }
            '/' => {
                tokens.push(Token::Slash);
                i += 1;
            }
            '(' => {
                tokens.push(Token::LParen);
                i += 1;
            }
            ')' => {
                tokens.push(Token::RParen);
                i += 1;
            }
            _ if c.is_ascii_digit() || c == '.' => {
                let start = i;
                while i < chars.len() && (chars[i].is_ascii_digit() || chars[i] == '.') {
                    i += 1;
                }
                let num_str: String = chars[start..i].iter().collect();
                tokens.push(Token::Num(num_str.parse().ok()?));
            }
            _ => return None,
        }
    }
    Some(tokens)
}

struct Parser {
    tokens: Vec<Token>,
    pos: usize,
}

impl Parser {
    fn peek(&self) -> Option<Token> {
        self.tokens.get(self.pos).copied()
    }

    // expr := term (('+' | '-') term)*
    fn parse_expr(&mut self) -> Option<f64> {
        let mut value = self.parse_term()?;
        loop {
            match self.peek() {
                Some(Token::Plus) => {
                    self.pos += 1;
                    value += self.parse_term()?;
                }
                Some(Token::Minus) => {
                    self.pos += 1;
                    value -= self.parse_term()?;
                }
                _ => break,
            }
        }
        Some(value)
    }

    // term := factor (('*' | '/') factor)*
    fn parse_term(&mut self) -> Option<f64> {
        let mut value = self.parse_factor()?;
        loop {
            match self.peek() {
                Some(Token::Star) => {
                    self.pos += 1;
                    value *= self.parse_factor()?;
                }
                Some(Token::Slash) => {
                    self.pos += 1;
                    let rhs = self.parse_factor()?;
                    if rhs == 0.0 {
                        return None;
                    }
                    value /= rhs;
                }
                _ => break,
            }
        }
        Some(value)
    }

    // factor := ('+' | '-')* (number | '(' expr ')')
    fn parse_factor(&mut self) -> Option<f64> {
        match self.peek()? {
            Token::Minus => {
                self.pos += 1;
                self.parse_factor().map(|v| -v)
            }
            Token::Plus => {
                self.pos += 1;
                self.parse_factor()
            }
            Token::Num(n) => {
                self.pos += 1;
                Some(n)
            }
            Token::LParen => {
                self.pos += 1;
                let value = self.parse_expr()?;
                match self.peek() {
                    Some(Token::RParen) => {
                        self.pos += 1;
                        Some(value)
                    }
                    _ => None,
                }
            }
            _ => None,
        }
    }
}

fn calculate_expr(input: &str) -> Option<f64> {
    let tokens = tokenize(input)?;
    if tokens.is_empty() {
        return None;
    }
    let mut parser = Parser { tokens, pos: 0 };
    let value = parser.parse_expr()?;
    if parser.pos != parser.tokens.len() {
        return None;
    }
    Some(value)
}

fn format_result(value: f64) -> String {
    if value == value.trunc() && value.abs() < 1e15 {
        format!("{}", value as i64)
    } else {
        let s = format!("{:.10}", value);
        s.trim_end_matches('0').trim_end_matches('.').to_string()
    }
}

#[tauri::command]
fn calculate(expr: String) -> Option<String> {
    let value = calculate_expr(&expr)?;
    if !value.is_finite() {
        return None;
    }
    Some(format_result(value))
}

#[tauri::command]
fn copy_to_clipboard(app: tauri::AppHandle, text: String) -> Result<(), String> {
    app.clipboard().write_text(text).map_err(|e| e.to_string())
}

/// `check_for_update` で見つかった更新は、ユーザーが同意して `download_and_install_update`
/// を呼ぶまでの間、確認済みの `Update` オブジェクトとして保持しておく（再チェックを避けるため）。
struct PendingUpdate(Mutex<Option<tauri_plugin_updater::Update>>);

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct UpdateCheckResult {
    available: bool,
    version: Option<String>,
    notes: Option<String>,
}

#[tauri::command]
async fn check_for_update(
    app: AppHandle,
    pending: tauri::State<'_, PendingUpdate>,
) -> Result<UpdateCheckResult, String> {
    let update = app
        .updater()
        .map_err(|e| e.to_string())?
        .check()
        .await
        .map_err(|e| e.to_string())?;

    let result = match &update {
        Some(u) => UpdateCheckResult {
            available: true,
            version: Some(u.version.clone()),
            notes: u.body.clone(),
        },
        None => UpdateCheckResult {
            available: false,
            version: None,
            notes: None,
        },
    };

    *pending.0.lock().unwrap() = update;
    Ok(result)
}

/// ダウンロード＆インストールを実行する。`Update::install`（Windows実装）は内部で
/// `updater_builder()` に既定で組み込まれている `on_before_exit` フック（後述）を
/// 呼んだ後、インストーラーを起動して `std::process::exit(0)` でアプリを終了させる
/// （呼び出し元に制御が戻ることはない）。
///
/// on_before_exit フックについて：`tauri_plugin_updater::UpdaterExt::updater_builder()` は
/// デフォルトで `AppHandle::cleanup_before_exit()` を呼ぶよう既に配線されている。この関数は
/// トレイアイコン（`tray-icon` feature 使用時）・各ウィンドウ・リソーステーブルの後片付けを
/// 行う実装になっており、本アプリのトレイ実装（`TrayIconBuilder::with_id("main-tray")` で
/// 登録した単一のトレイアイコン）はこの汎用クリーンアップの対象に含まれる。そのため
/// `app.updater()`（内部で `updater_builder().build()` を呼ぶだけ）を使う限り、個別の
/// トレイ後片付けコードを追加する必要はない。
#[tauri::command]
async fn download_and_install_update(pending: tauri::State<'_, PendingUpdate>) -> Result<(), String> {
    let update = pending
        .0
        .lock()
        .unwrap()
        .take()
        .ok_or_else(|| "確認済みのアップデートがありません".to_string())?;

    update
        .download_and_install(|_chunk_len, _content_len| {}, || {})
        .await
        .map_err(|e| e.to_string())
}

fn load_tray_icon() -> Image<'static> {
    // `npm run tauri icon` で生成される icons/32x32.png をコンパイル時に埋め込む。
    // include_bytes! はファイル内容に対する依存関係としてビルドに記録されるため、
    // アイコン差し替え後の cargo build で自動的に再コンパイルが走る。
    let bytes = include_bytes!("../icons/32x32.png");
    let img = image::load_from_memory(bytes)
        .expect("tray icon png should decode")
        .into_rgba8();
    let (width, height) = (img.width(), img.height());
    Image::new_owned(img.into_raw(), width, height)
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec![]),
        ))
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        if let Some(window) = app.get_webview_window("main") {
                            if window.is_visible().unwrap_or(false) {
                                let _ = app.emit("request-hide", ());
                            } else {
                                let _ = window.center();
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    }
                })
                .build(),
        )
        .setup(|app| {
            // ログ用ディレクトリの解決・パニックフックの登録は、他の初期化処理より前に
            // 最優先で行う（以降の処理でパニックが起きても記録できるようにするため）。
            init_log_dir(app);
            install_panic_hook();

            // グローバルホットキー登録（保存済み設定 → パース失敗時はデフォルトにフォールバック）
            let mut settings = load_app_settings(app.handle());
            let shortcut = match Shortcut::from_str(&settings.hotkey) {
                Ok(shortcut) => shortcut,
                Err(_) => {
                    settings.hotkey = DEFAULT_HOTKEY.to_string();
                    let _ = save_app_settings(app.handle(), &settings);
                    Shortcut::from_str(DEFAULT_HOTKEY).expect("default hotkey must parse")
                }
            };
            app.global_shortcut().register(shortcut)?;

            // ピン止め・お気に入り・メモの3予約フォルダが存在しなければ生成する
            // （新規ユーザー・既存ユーザーの初回起動のいずれも対象）。
            ensure_reserved_folders(app.handle());

            // クリップボード変更の監視。画像はバイナリのまま Rust 側メモリにキャッシュし、
            // フロントエンドには ID とサムネイルのみを渡す（詳細はキャッシュ・関数のコメント参照）
            app.manage(ClipboardImageCache::new());
            app.manage(PendingUpdate(Mutex::new(None)));
            app.manage(FavoriteNodesWriteLock(Mutex::new(())));
            app.manage(MemoDocumentsWriteLock(Mutex::new(())));
            let _ = APP_HANDLE.set(app.handle().clone());
            if let Some(window) = app.get_webview_window("main") {
                // 保存済みウィンドウサイズの復元（未保存ならデフォルトの 640x420 のまま）。
                // 表示前に確定させるため show() より前に適用する。
                if let Some(size) = load_window_size(app.handle()) {
                    let _ = window.set_size(LogicalSize::new(size.width, size.height));
                }
                register_clipboard_listener(&window);
            }

            // 現在の自動起動状態を取得してトレイメニューに反映
            let autostart_enabled = app.autolaunch().is_enabled().unwrap_or(false);
            let autostart_item = CheckMenuItemBuilder::with_id("autostart", "Start with Windows")
                .checked(autostart_enabled)
                .build(app)?;

            // システムトレイのメニュー
            let menu = MenuBuilder::new(app)
                .text("show", "Show WinLauncher")
                .text("check_for_updates", "Check for Updates")
                .item(&autostart_item)
                .text("restart", "Restart")
                .text("quit", "Quit")
                .build()?;

            // システムトレイ
            let _tray = TrayIconBuilder::with_id("main-tray")
                .icon(load_tray_icon())
                .menu(&menu)
                .tooltip(tray_tooltip(&settings.hotkey))
                .on_menu_event(move |app, event| match event.id().as_ref() {
                    "show" => {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.center();
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                    "check_for_updates" => {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.center();
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                        let _ = app.emit("check-for-update-requested", ());
                    }
                    "autostart" => {
                        let autolaunch = app.autolaunch();
                        let now_enabled = autolaunch.is_enabled().unwrap_or(false);
                        let result = if now_enabled {
                            autolaunch.disable()
                        } else {
                            autolaunch.enable()
                        };
                        if result.is_ok() {
                            let _ = autostart_item.set_checked(!now_enabled);
                        }
                    }
                    "restart" => app.request_restart(),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(w) = app.get_webview_window("main") {
                            if w.is_visible().unwrap_or(false) {
                                let _ = app.emit("request-hide", ());
                            } else {
                                let _ = w.center();
                                let _ = w.show();
                                let _ = w.set_focus();
                            }
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            search_files,
            launch_file,
            open_containing_folder,
            calculate,
            copy_to_clipboard,
            get_folders,
            pick_folder,
            add_folder,
            remove_folder,
            toggle_folder,
            set_folder_settings,
            execute_system_command,
            log_ui_event,
            get_app_settings,
            set_file_search_enabled,
            set_calc_enabled,
            set_system_command_enabled,
            set_system_command_keyword,
            set_web_search_enabled,
            set_copy_with_comma,
            set_url_convert_enabled,
            set_url_convert_keep_space_encoded,
            set_clipboard_enabled,
            set_clipboard_prefix,
            set_clipboard_max_items,
            paste_clipboard_image,
            set_hotkey,
            set_recent_files_enabled,
            set_recent_keyword,
            set_recent_max_age_days,
            set_recent_max_results,
            set_recent_display_settings,
            get_recent_files,
            set_ocr_enabled,
            ocr_from_clipboard,
            set_check_update_on_startup,
            check_for_update,
            download_and_install_update,
            set_path_paste_enabled,
            read_pasted_hdrop_path,
            judge_pasted_path,
            add_search_folder_from_paste,
            create_shortcut,
            show_path_paste_toast,
            set_pin_enabled,
            get_favorites,
            set_favorites,
            get_pinned_files,
            check_paths_exist,
            is_favorited,
            get_favorite_nodes,
            add_favorite,
            add_favorite_folder,
            remove_favorite,
            remove_favorite_folder,
            rename_favorite_node,
            move_favorite_node_to,
            set_favorite_folder_collapsed,
            set_favorite_enabled,
            set_favorite_keyword,
            set_memo_enabled,
            set_memo_keyword,
            get_memo_nodes,
            get_memo_manage_nodes,
            get_memo_document,
            add_memo,
            save_memo_draft,
            save_memo_final
            ,add_memo_folder
            ,move_memo_node_to
            ,delete_memo_node
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
