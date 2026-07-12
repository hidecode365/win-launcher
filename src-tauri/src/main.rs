#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::collections::{HashMap, VecDeque};
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
use tauri_plugin_store::StoreExt;
use tauri_plugin_updater::UpdaterExt;
use walkdir::WalkDir;

const SETTINGS_STORE: &str = "settings.json";
const DEFAULT_HOTKEY: &str = "Alt+Space";
const DEFAULT_CLIPBOARD_PREFIX: &str = "cb";
const DEFAULT_CLIPBOARD_MAX_ITEMS: u32 = 50;
const CLIPBOARD_THUMBNAIL_MAX_WIDTH: u32 = 320;

/// クリップボード変更通知用のウィンドウサブクラスプロシージャ（`extern "system"`）は
/// クロージャで `AppHandle` を捕捉できないため、`setup()` で一度だけ設定したハンドルを
/// ここから取得する。
static APP_HANDLE: OnceLock<AppHandle> = OnceLock::new();

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
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

#[derive(Debug, Serialize, Deserialize, Clone)]
struct FolderEntry {
    path: String,
    enabled: bool,
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
fn pick_folder(app: AppHandle) -> Option<String> {
    app.dialog()
        .file()
        .blocking_pick_folder()
        .map(|p| p.to_string())
}

#[tauri::command]
fn add_folder(app: AppHandle, path: String) -> Result<Vec<FolderEntry>, String> {
    let mut folders = load_folders(&app);
    if !folders.iter().any(|f| f.path == path) {
        folders.push(FolderEntry { path, enabled: true });
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

// 新規追加フィールド用のデフォルト値。serde(default) を付けないと、旧バージョンで
// 保存された settings.json（このフィールドを持たない）の読み込み時に
// deserialize が失敗し、AppSettings 全体が Default::default() にフォールバックして
// 既存ユーザーの他の設定まで巻き添えで消えてしまうため付与する。
fn default_true() -> bool {
    true
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct AppSettings {
    hotkey: String,
    file_search_enabled: bool,
    calc_enabled: bool,
    system_command_enabled: bool,
    web_search_enabled: bool,
    copy_with_comma: bool,
    clipboard_enabled: bool,
    clipboard_prefix: String,
    clipboard_max_items: u32,
    ocr_enabled: bool,
    check_update_on_startup: bool,
    #[serde(default = "default_true")]
    url_convert_enabled: bool,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            hotkey: DEFAULT_HOTKEY.to_string(),
            file_search_enabled: true,
            calc_enabled: true,
            system_command_enabled: true,
            web_search_enabled: true,
            copy_with_comma: true,
            clipboard_enabled: true,
            clipboard_prefix: DEFAULT_CLIPBOARD_PREFIX.to_string(),
            clipboard_max_items: DEFAULT_CLIPBOARD_MAX_ITEMS,
            ocr_enabled: true,
            check_update_on_startup: true,
            url_convert_enabled: true,
        }
    }
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
    settings.clipboard_prefix = trimmed.to_string();
    save_app_settings(&app, &settings)?;
    Ok(settings)
}

#[tauri::command]
fn set_clipboard_max_items(app: AppHandle, max_items: u32) -> Result<AppSettings, String> {
    if max_items < 1 {
        return Err("1件以上を指定してください".to_string());
    }
    let mut settings = load_app_settings(&app);
    settings.clipboard_max_items = max_items;
    save_app_settings(&app, &settings)?;
    Ok(settings)
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

#[tauri::command]
fn search_files(app: AppHandle, query: String) -> Vec<FileEntry> {
    let enabled_dirs: Vec<String> = load_folders(&app)
        .into_iter()
        .filter(|f| f.enabled)
        .map(|f| f.path)
        .collect();

    let mut results = Vec::new();
    if enabled_dirs.is_empty() {
        return results;
    }

    let query_lower = query.to_lowercase();

    'outer: for dir in &enabled_dirs {
        let search_dir = Path::new(dir);
        if !search_dir.exists() {
            continue;
        }
        for entry in WalkDir::new(search_dir).follow_links(true).max_depth(5) {
            let Ok(entry) = entry else { continue };
            if !entry.file_type().is_file() {
                continue;
            }
            let name = entry.file_name().to_string_lossy().to_string();
            if query_lower.is_empty() || name.to_lowercase().contains(&query_lower) {
                let path = entry.path().to_string_lossy().to_string();
                let icon = shell_icon::get_icon_data_url(&path);
                results.push(FileEntry { name, path, icon });
                if results.len() >= 50 {
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

#[tauri::command]
fn execute_system_command(action: String) -> Result<(), String> {
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

    // factor := ('+' | '-')* number
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
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        if let Some(window) = app.get_webview_window("main") {
                            if window.is_visible().unwrap_or(false) {
                                let _ = window.hide();
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

            // クリップボード変更の監視。画像はバイナリのまま Rust 側メモリにキャッシュし、
            // フロントエンドには ID とサムネイルのみを渡す（詳細はキャッシュ・関数のコメント参照）
            app.manage(ClipboardImageCache::new());
            app.manage(PendingUpdate(Mutex::new(None)));
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
                                let _ = w.hide();
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
            calculate,
            copy_to_clipboard,
            get_folders,
            pick_folder,
            add_folder,
            remove_folder,
            toggle_folder,
            execute_system_command,
            get_app_settings,
            set_file_search_enabled,
            set_calc_enabled,
            set_system_command_enabled,
            set_web_search_enabled,
            set_copy_with_comma,
            set_url_convert_enabled,
            set_clipboard_enabled,
            set_clipboard_prefix,
            set_clipboard_max_items,
            paste_clipboard_image,
            set_hotkey,
            set_ocr_enabled,
            ocr_from_clipboard,
            set_check_update_on_startup,
            check_for_update,
            download_and_install_update
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
