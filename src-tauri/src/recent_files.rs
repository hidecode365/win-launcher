use serde::Serialize;

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RecentFile {
    pub name: String,
    /// `.lnk` 由来ならリンク先のローカルパス、`.url` 由来なら同期ライブラリのローカル
    /// 同期先パスへの変換に成功したローカルパス（`resolve_sync_engine_local_path` を
    /// 参照）。変換に失敗した `.url` は一覧に含めないため、ここに含まれるのは常に
    /// 実在確認済み（UNC パスは実在チェック自体をスキップしたもの。「実在チェックと
    /// ネットワークパス（UNC）の扱い」を参照）のローカルパスであり、起動処理側で
    /// 由来による分岐は不要。
    pub path: String,
    /// リンク先ファイルではなく `.lnk`/`.url` ショートカット自体の更新日時（UNIX ms）。
    /// Recent フォルダのショートカットは同じファイルを開くたびに上書きされる仕様のため、
    /// リンク先実ファイルのタイムスタンプより「最近開いた順」を正確に反映する。
    pub last_accessed: u64,
}

/// Windows の Recent フォルダ（Known Folder API）と Office の Recent フォルダ
/// （`%APPDATA%\Microsoft\Office\Recent`。対応する Known Folder API が存在しないため
/// 環境変数から組み立てる）の絶対パスを取得する。環境によって実際のパスが異なり得るため
/// ハードコードしない。
#[cfg(windows)]
mod known_folder {
    use windows::Win32::System::Com::CoTaskMemFree;
    use windows::Win32::UI::Shell::{FOLDERID_Recent, SHGetKnownFolderPath, KF_FLAG_DEFAULT};

    pub fn recent_folder_path() -> Option<String> {
        unsafe {
            let pwstr = SHGetKnownFolderPath(&FOLDERID_Recent, KF_FLAG_DEFAULT, None).ok()?;
            let path = pwstr.to_string().ok();
            CoTaskMemFree(Some(pwstr.0 as *const core::ffi::c_void));
            path
        }
    }

    pub fn office_recent_folder_path() -> Option<String> {
        let appdata = std::env::var("APPDATA").ok()?;
        Some(format!("{appdata}\\Microsoft\\Office\\Recent"))
    }
}

#[cfg(not(windows))]
mod known_folder {
    pub fn recent_folder_path() -> Option<String> {
        None
    }
    pub fn office_recent_folder_path() -> Option<String> {
        None
    }
}

/// UTF-16（null 終端）文字列に変換する。
#[cfg(windows)]
fn wide(s: &str) -> Vec<u16> {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    OsStr::new(s).encode_wide().chain(std::iter::once(0)).collect()
}

/// レジストリ `HKEY_CURRENT_USER\Software\SyncEngines\Providers\OneDrive` 配下の
/// すべてのサブキーを列挙し、各サブキーの `UrlNamespace`（そのライブラリのクラウド上
/// URLのルート）と `MountPoint`（対応するローカル同期先フォルダのパス）の組を取得する。
/// 個人のOneDrive本体・OneDrive for Businessの個人領域・SharePointチームサイトの
/// 共有ライブラリ・OneDriveに追加したショートカットのいずれも、この同じレジストリ配下に
/// 登録されることが実地検証で確認されている。サブキー名を決め打ちにせず動的に列挙する
/// ことで、個人・組織・複数ライブラリいずれの構成にも対応する。失敗箇所は
/// `crate::log_debug` でログ出力したうえでスキップする（黙って握りつぶさない）。
#[cfg(windows)]
fn sync_engine_mount_points() -> Vec<(String, String)> {
    use windows::core::PCWSTR;
    use windows::Win32::Foundation::{ERROR_NO_MORE_ITEMS, ERROR_SUCCESS};
    use windows::Win32::System::Registry::{
        RegCloseKey, RegEnumKeyExW, RegOpenKeyExW, HKEY, HKEY_CURRENT_USER, KEY_READ,
    };

    let mut mounts = Vec::new();

    let providers_path = wide("Software\\SyncEngines\\Providers\\OneDrive");
    let mut providers_key = HKEY::default();
    let open_result = unsafe {
        RegOpenKeyExW(
            HKEY_CURRENT_USER,
            PCWSTR(providers_path.as_ptr()),
            None,
            KEY_READ,
            &mut providers_key as *mut HKEY,
        )
    };
    if open_result != ERROR_SUCCESS {
        crate::log_debug(&format!(
            "[recent_files] failed to open SyncEngines\\Providers\\OneDrive registry key: {open_result:?}"
        ));
        return mounts;
    }

    let mut index = 0u32;
    loop {
        let mut name_buf = [0u16; 256];
        let mut name_len = name_buf.len() as u32;
        let enum_result = unsafe {
            RegEnumKeyExW(
                providers_key,
                index,
                Some(windows::core::PWSTR(name_buf.as_mut_ptr())),
                &mut name_len as *mut u32,
                None,
                None,
                None,
                None,
            )
        };
        if enum_result != ERROR_SUCCESS {
            if enum_result != ERROR_NO_MORE_ITEMS {
                crate::log_debug(&format!(
                    "[recent_files] failed to enumerate SyncEngines provider key at index {index}: {enum_result:?}"
                ));
            }
            break;
        }

        let subkey_name = String::from_utf16_lossy(&name_buf[..name_len as usize]);
        let subkey_path = wide(&subkey_name);
        let mut subkey = HKEY::default();
        let open_sub = unsafe {
            RegOpenKeyExW(
                providers_key,
                PCWSTR(subkey_path.as_ptr()),
                None,
                KEY_READ,
                &mut subkey as *mut HKEY,
            )
        };
        if open_sub == ERROR_SUCCESS {
            let namespace = read_registry_string_expand(subkey, "UrlNamespace");
            let mount_point = read_registry_string_expand(subkey, "MountPoint");
            match (namespace, mount_point) {
                (Some(ns), Some(mp)) => mounts.push((ns, mp)),
                _ => crate::log_debug(&format!(
                    "[recent_files] SyncEngines provider key '{subkey_name}' is missing UrlNamespace or MountPoint"
                )),
            }
            unsafe {
                let _ = RegCloseKey(subkey);
            }
        } else {
            crate::log_debug(&format!(
                "[recent_files] failed to open SyncEngines provider subkey '{subkey_name}': {open_sub:?}"
            ));
        }

        index += 1;
    }

    unsafe {
        let _ = RegCloseKey(providers_key);
    }
    mounts
}

/// レジストリの文字列値（`REG_SZ` または `REG_EXPAND_SZ`）を読み取る。`REG_EXPAND_SZ`
/// の場合は `%UserProfile%` 等の環境変数プレースホルダーを `ExpandEnvironmentStringsW`
/// で展開してから返す（実環境での検証で、`MountPoint` の値がこの型で登録され、
/// 展開されないまま返ってくるケースが確認されているため）。
#[cfg(windows)]
fn read_registry_string_expand(
    key: windows::Win32::System::Registry::HKEY,
    value_name: &str,
) -> Option<String> {
    use windows::core::PCWSTR;
    use windows::Win32::Foundation::ERROR_SUCCESS;
    use windows::Win32::System::Registry::{RegQueryValueExW, REG_EXPAND_SZ, REG_SZ, REG_VALUE_TYPE};

    let name_wide = wide(value_name);

    let mut data_len: u32 = 0;
    let size_result = unsafe {
        RegQueryValueExW(
            key,
            PCWSTR(name_wide.as_ptr()),
            None,
            None,
            None,
            Some(&mut data_len as *mut u32),
        )
    };
    if size_result != ERROR_SUCCESS || data_len == 0 {
        return None;
    }

    let mut buffer = vec![0u8; data_len as usize];
    let mut value_type = REG_VALUE_TYPE(0);
    let read_result = unsafe {
        RegQueryValueExW(
            key,
            PCWSTR(name_wide.as_ptr()),
            None,
            Some(&mut value_type as *mut REG_VALUE_TYPE),
            Some(buffer.as_mut_ptr()),
            Some(&mut data_len as *mut u32),
        )
    };
    if read_result != ERROR_SUCCESS || (value_type != REG_SZ && value_type != REG_EXPAND_SZ) {
        return None;
    }

    let wide_value: Vec<u16> = buffer
        .chunks_exact(2)
        .map(|c| u16::from_le_bytes([c[0], c[1]]))
        .collect();
    let raw = String::from_utf16_lossy(&wide_value)
        .trim_end_matches('\0')
        .to_string();

    if value_type == REG_EXPAND_SZ {
        match expand_environment_string(&raw) {
            Some(expanded) => Some(expanded),
            None => Some(raw),
        }
    } else {
        Some(raw)
    }
}

/// `%UserProfile%` 等の環境変数プレースホルダーを含む文字列を Win32 API
/// `ExpandEnvironmentStringsW` で展開する。プレースホルダーを含まない文字列を渡しても
/// 害はない（そのまま返る）。
#[cfg(windows)]
fn expand_environment_string(s: &str) -> Option<String> {
    use windows::core::PCWSTR;
    use windows::Win32::System::Environment::ExpandEnvironmentStringsW;

    let wide_in = wide(s);
    let needed = unsafe { ExpandEnvironmentStringsW(PCWSTR(wide_in.as_ptr()), None) };
    if needed == 0 {
        crate::log_debug(&format!(
            "[recent_files] ExpandEnvironmentStringsW failed to size: {s}"
        ));
        return None;
    }

    let mut buffer = vec![0u16; needed as usize];
    let written =
        unsafe { ExpandEnvironmentStringsW(PCWSTR(wide_in.as_ptr()), Some(&mut buffer)) };
    if written == 0 {
        crate::log_debug(&format!(
            "[recent_files] ExpandEnvironmentStringsW failed to expand: {s}"
        ));
        return None;
    }

    let len = (written as usize).saturating_sub(1).min(buffer.len());
    Some(String::from_utf16_lossy(&buffer[..len]))
}

/// `%XX` 形式のパーセントエンコーディングをデコードする自前実装（`percent-encoding` 等の
/// 追加クレートは使わない）。バイト単位でデコードしたうえで UTF-8 として組み立て直す。
#[cfg(windows)]
fn percent_decode(s: &str) -> Option<String> {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' {
            let hex = s.get(i + 1..i + 3)?;
            let byte = u8::from_str_radix(hex, 16).ok()?;
            out.push(byte);
            i += 3;
        } else {
            out.push(bytes[i]);
            i += 1;
        }
    }
    String::from_utf8(out).ok()
}

/// パスが `\\` で始まる UNC 形式（ネットワークパス）かどうかを判定する。UNC パスは
/// 実在チェック自体をスキップする対象になる（「実在チェックとネットワークパス（UNC）の
/// 扱い」を参照）。
#[cfg(windows)]
fn is_unc_path(path: &str) -> bool {
    path.starts_with("\\\\")
}

/// `UrlNamespace` がホスト名のみ（それ以上のパス階層を含まない）かどうかを判定する。
/// 個人 OneDrive（`https://d.docs.live.net`）はこの形式でレジストリに登録される一方、
/// 実際の `.url` の URL 側にはホスト名の直後にアカウント識別子セグメントが1つ挟まる
/// （例: `https://d.docs.live.net/{account_id}/{relative_path}`）。OneDrive for
/// Business の個人領域や SharePoint チームサイトの `UrlNamespace`（例:
/// `https://contoso-my.sharepoint.com/personal/user_contoso_com/Documents`）は
/// 既により深い階層を含んでおり、この識別子セグメントを持たないため対象外とする。
#[cfg(windows)]
fn namespace_is_host_only(namespace: &str) -> bool {
    let after_scheme = namespace
        .split_once("://")
        .map(|(_, rest)| rest)
        .unwrap_or(namespace);
    !after_scheme.trim_end_matches('/').contains('/')
}

/// `.url` の `URL=` 値を、同期ライブラリのローカル同期先パスへ変換する。
/// `mounts`（`UrlNamespace` → `MountPoint` の対応表）の中から `UrlNamespace` が URL に
/// 前方一致するエントリを探し、複数該当する場合は最も長く一致するものを採用する
/// （最長一致優先）。一致したら URL から `UrlNamespace` 部分を除いた残りを相対パスとする。
/// ただし `UrlNamespace` がホスト名のみの場合（`namespace_is_host_only`）は、個人
/// OneDrive のアカウント識別子セグメントを追加で1つ読み飛ばしてから相対パスとして扱う
/// （詳細は `namespace_is_host_only` のドキュメントコメントを参照）。相対パスの末尾が
/// `/` の場合はファイルではなくフォルダへの参照とみなし、ローカルパスを組み立てずに
/// `None` を返す（「ファイルのみを対象とし、フォルダは除外する」既存ルールに従う）。
/// それ以外はパーセントデコードしたうえで `MountPoint` と結合してローカルパスを
/// 組み立てる。実在チェックは呼び出し元（`process_url`）が行う。
#[cfg(windows)]
fn resolve_sync_engine_local_path(url: &str, mounts: &[(String, String)]) -> Option<String> {
    let mut best: Option<&(String, String)> = None;
    for pair in mounts {
        let (namespace, _) = pair;
        if !url.starts_with(namespace.as_str()) {
            continue;
        }
        let is_longer_match = match best {
            Some((current_ns, _)) => namespace.len() > current_ns.len(),
            None => true,
        };
        if is_longer_match {
            best = Some(pair);
        }
    }

    let Some((namespace, mount_point)) = best else {
        crate::log_debug(&format!(
            "[recent_files] no matching sync engine UrlNamespace for: {url}"
        ));
        return None;
    };

    let mut remainder = url[namespace.len()..].trim_start_matches('/');

    if namespace_is_host_only(namespace) {
        // 個人 OneDrive 等、UrlNamespace がホスト名のみの場合は、その直後に挟まる
        // アカウント識別子セグメント（次の "/" まで）を追加で読み飛ばす。
        let Some(slash_pos) = remainder.find('/') else {
            crate::log_debug(&format!(
                "[recent_files] OneDrive URL is missing the relative path segment after the account id: {url}"
            ));
            return None;
        };
        remainder = &remainder[slash_pos + 1..];
    }

    if remainder.is_empty() {
        return None;
    }

    if remainder.ends_with('/') {
        // 相対パスの末尾が "/" の場合、ファイルではなくフォルダ（場所）への参照。
        // 実在チェック自体が不要かつ不適切なため、ここで確定的に除外する
        // （「ファイルのみを対象とし、フォルダは除外する」既存ルールに従う）。
        crate::log_debug(&format!(
            "[recent_files] url points to a folder, not a file, excluding: {url}"
        ));
        return None;
    }

    let Some(decoded) = percent_decode(remainder) else {
        crate::log_debug(&format!(
            "[recent_files] failed to percent-decode url path: {url}"
        ));
        return None;
    };
    let relative = decoded.replace('/', "\\");
    let mount_trimmed = mount_point.trim_end_matches('\\');
    Some(format!("{mount_trimmed}\\{relative}"))
}

/// システムの既定 ANSI コードページ（`GetACP()`）に対応する `encoding_rs` の静的値を返す。
///
/// 【日本語パス欠落バグの原因と修正】
/// `lnk` クレートの `LinkInfo` 構造体は、Unicode 版フィールド（`local_base_path_unicode` 等。
/// `link_target()` はこちらを優先利用する）とは別に、常に ANSI フォールバック文字列
/// （`local_base_path` 等）も読み込む。このフォールバック文字列は呼び出し元が
/// `ShellLink::open()` に渡した `encoding` 引数でデコードされ、デコードに失敗すると
/// （`had_errors == true`）`LinkInfo` 全体、ひいては `ShellLink::open()` 自体が `Err` を
/// 返す。以前は固定で `WINDOWS_1252`（西欧）を渡していたため、日本語（既定コードページ
/// 932 = Shift-JIS）のパスが書き込んだ ANSI フォールバックのバイト列（例: 0x81 等の
/// Shift-JIS のリード バイト）が windows-1252 では未定義コードポイントとなりデコード
/// エラーとなっていた。この結果、Unicode フィールド自体は正しく存在するにも関わらず
/// `ShellLink::open()` が `Err` を返し、呼び出し側で静かに `continue` されて一覧から
/// 欠落していた。実際のシステム既定 ANSI コードページを `GetACP()` で取得し、対応する
/// エンコーディングを渡すことでこの問題を解消する。
#[cfg(windows)]
fn system_default_encoding() -> &'static encoding_rs::Encoding {
    use windows::Win32::Globalization::GetACP;

    let codepage = unsafe { GetACP() };
    match codepage {
        932 => encoding_rs::SHIFT_JIS,
        936 => encoding_rs::GBK,
        949 => encoding_rs::EUC_KR,
        950 => encoding_rs::BIG5,
        874 => encoding_rs::WINDOWS_874,
        1250 => encoding_rs::WINDOWS_1250,
        1251 => encoding_rs::WINDOWS_1251,
        1253 => encoding_rs::WINDOWS_1253,
        1254 => encoding_rs::WINDOWS_1254,
        1255 => encoding_rs::WINDOWS_1255,
        1256 => encoding_rs::WINDOWS_1256,
        1257 => encoding_rs::WINDOWS_1257,
        1258 => encoding_rs::WINDOWS_1258,
        20866 => encoding_rs::KOI8_R,
        21866 => encoding_rs::KOI8_U,
        10000 => encoding_rs::MACINTOSH,
        _ => encoding_rs::WINDOWS_1252,
    }
}

#[cfg(windows)]
fn file_mtime_ms(metadata: &std::fs::Metadata) -> u64 {
    metadata
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// `.lnk` のリンク先ローカルパスのみを解決する（実在チェック・フォルダ除外は行わない）。
/// `process_lnk`（一覧生成用。実在チェック・フォルダ除外込み）と、通常のファイル検索
/// 結果に対する「格納フォルダを開く（Shift+Enter）」機能（`main.rs` の
/// `open_containing_folder`。`.lnk` 自身のフォルダではなくリンク先実ファイルの
/// フォルダを開くために、`.lnk` 自体は実在確認済みである前提でリンク先のみを知りたい）
/// の両方から使う共通ロジック。`ShellLink::open`/`link_target` のエラー・panic は
/// 握りつぶさず、原因調査用に `crate::log_debug` でログ出力したうえで `None` を返す
/// （文字コード処理・`catch_unwind` による panic 対策の詳細は `system_default_encoding`
/// のドキュメントコメントを参照）。
#[cfg(windows)]
pub fn resolve_lnk_target_path(lnk_path: &std::path::Path) -> Option<String> {
    use lnk::ShellLink;

    let encoding = system_default_encoding();
    let shortcut = match ShellLink::open(lnk_path, encoding) {
        Ok(s) => s,
        Err(e) => {
            crate::log_debug(&format!(
                "[recent_files] failed to parse {}: {e}",
                lnk_path.display()
            ));
            return None;
        }
    };

    // link_target() は LinkInfo の構造次第で内部的に .expect() による panic を起こしうる
    // （lnk クレート側の既知の制約）。1件の異常な .lnk がアプリ全体を巻き込まないよう
    // catch_unwind で保護する（release ビルドは panic = "abort" のため、素通しだと
    // プロセスごと終了してしまう）。
    match std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| shortcut.link_target())) {
        Ok(Some(t)) => Some(t),
        Ok(None) => {
            crate::log_debug(&format!("[recent_files] no link target in {}", lnk_path.display()));
            None
        }
        Err(_) => {
            crate::log_debug(&format!(
                "[recent_files] panicked while resolving link target of {}",
                lnk_path.display()
            ));
            None
        }
    }
}

#[cfg(not(windows))]
pub fn resolve_lnk_target_path(_lnk_path: &std::path::Path) -> Option<String> {
    None
}

/// `.lnk` を1件処理する。`last_accessed` は列挙段階（`get_recent_files` の手順1）で
/// 既に取得済みの `.lnk` 自体の更新日時をそのまま使う（ここで再取得しない）。
/// リンク先がローカルパスの場合のみ実在チェック・フォルダ除外を行う。UNC 形式
/// （ネットワークパス）の場合は実在チェックそのものをスキップし、無条件で一覧に含める
/// （「実在チェックとネットワークパス（UNC）の扱い」を参照）。
#[cfg(windows)]
fn process_lnk(lnk_path: &std::path::Path, last_accessed: u64) -> Option<RecentFile> {
    use std::path::PathBuf;

    let target = resolve_lnk_target_path(lnk_path)?;
    let target_path = PathBuf::from(&target);

    if !is_unc_path(&target) {
        let Ok(metadata) = std::fs::metadata(&target_path) else {
            return None;
        };
        if metadata.is_dir() {
            return None;
        }
    }

    let name = target_path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| target.clone());

    Some(RecentFile {
        name,
        path: target,
        last_accessed,
    })
}

/// UTF-8（BOM 付きを含む）として読み込みを試み、失敗した場合はシステム既定の ANSI
/// コードページとして読み込む。`.url` はどちらの形式で保存されているかまちまちなため。
#[cfg(windows)]
fn read_text_file_lossy(
    path: &std::path::Path,
    fallback_encoding: &'static encoding_rs::Encoding,
) -> Option<String> {
    let bytes = std::fs::read(path).ok()?;
    if let Ok(s) = String::from_utf8(bytes.clone()) {
        return Some(s.trim_start_matches('\u{feff}').to_string());
    }
    let (cow, _, had_errors) = fallback_encoding.decode(&bytes);
    if had_errors {
        crate::log_debug(&format!(
            "[recent_files] failed to decode {} as UTF-8 or system codepage",
            path.display()
        ));
        return None;
    }
    Some(cow.to_string())
}

/// 拡張子除去後の表示名が「もっともらしい拡張子」で終わっているかを判定する。
/// 実在するファイル拡張子は空白を含まない ASCII 英数字のみで構成されるため、これを
/// 「フォルダ的な参照」（例: `d.docs.live.net の 20260402_教育論`）との判別に使う。
#[cfg(windows)]
fn has_plausible_extension(name: &str) -> bool {
    match name.rsplit_once('.') {
        Some((_, ext)) => !ext.is_empty() && ext.chars().all(|c| c.is_ascii_alphanumeric()),
        None => false,
    }
}

/// `.url`（インターネットショートカット）を1件処理する。`last_accessed` は列挙段階
/// （`get_recent_files` の手順1）で既に取得済みの `.url` 自体の更新日時をそのまま使う
/// （変換の成否に関わらず変わらない、既存仕様）。テキスト（INI形式）としてパースし
/// `URL=` 行の値を取得したうえで、同期ライブラリのローカルパスへの変換を試みる
/// （`resolve_sync_engine_local_path` を参照）。ローカルパスがドライブレター形式の
/// 場合のみ実在チェックを行い、UNC 形式（ネットワークパス）の場合はスキップして
/// 無条件で採用する（「実在チェックとネットワークパス（UNC）の扱い」を参照）。
/// 変換に成功し実在確認も済んだものだけを一覧に含め、以降は `.lnk` 由来のエントリと
/// 全く同じ扱い（実在確認済みのローカルファイル）にする。それ以外は削除済みファイルと
/// 同じ扱いとして一覧から除外する。
#[cfg(windows)]
fn process_url(
    url_path: &std::path::Path,
    fallback_encoding: &'static encoding_rs::Encoding,
    mounts: &[(String, String)],
    last_accessed: u64,
) -> Option<RecentFile> {
    let content = read_text_file_lossy(url_path, fallback_encoding)?;
    let url = content
        .lines()
        .map(str::trim)
        .find_map(|line| line.strip_prefix("URL="))
        .map(str::trim)
        .filter(|v| !v.is_empty())?;

    let local_path = resolve_sync_engine_local_path(url, mounts)?;

    if !is_unc_path(&local_path) && !std::path::Path::new(&local_path).is_file() {
        crate::log_debug(&format!(
            "[recent_files] resolved local path does not exist: {local_path}"
        ));
        return None;
    }

    // ファイル名から末尾の拡張子 ".url" を1つ取り除いたものを表示名とする
    // （Windows のエクスプローラーが .url を隠して表示するのと同じ見た目にするため）。
    let display_name = url_path.file_stem()?.to_string_lossy().to_string();

    // 拡張子を取り除いた結果、表示名に拡張子が残らないもの（OneDrive 上のフォルダ的な
    // 参照）は「ファイルのみを対象とし、フォルダは除外する」既存ルールに従い除外する。
    if !has_plausible_extension(&display_name) {
        return None;
    }

    Some(RecentFile {
        name: display_name,
        path: local_path,
        last_accessed,
    })
}

/// 一覧に表示する最終アクセス日時の上限（`max_age_days` 日前）を UNIX ms で返す。
/// これより前のエントリは件数上限に余裕があっても除外する。`max_age_days` は
/// `AppSettings.recent_max_age_days`（設定画面から変更可能。デフォルト180日）を
/// 呼び出し元（`get_recent_files` コマンド）が渡す。
#[cfg(windows)]
fn recent_file_cutoff_ms(max_age_days: i64) -> u64 {
    let now_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    let max_age_ms = (max_age_days.max(0) as u64) * 24 * 60 * 60 * 1000;
    now_ms.saturating_sub(max_age_ms)
}

/// 列挙段階（`get_recent_files` の手順1）で拾った `.lnk`/`.url` 1件分。この時点では
/// リンク先解決・ローカルパス変換・実在チェックは一切行わず、ソート・足切りに必要な
/// 情報（自身の更新日時）のみを保持する。
#[cfg(windows)]
enum ShortcutKind {
    Lnk,
    Url,
}

#[cfg(windows)]
struct ShortcutCandidate {
    path: std::path::PathBuf,
    kind: ShortcutKind,
    last_accessed: u64,
}

/// Windows の Recent フォルダと Office の Recent フォルダ、双方の直下（各フォルダの
/// `AutomaticDestinations`/`CustomDestinations` 等のサブフォルダは `read_dir` が非再帰の
/// ため自然に対象外となる）の `.lnk`/`.url` から最近使ったファイル一覧を組み立てる。
///
/// パフォーマンス上の理由（リンク先解決・ローカルパス変換・実在チェックはファイル I/O や
/// レジストリアクセスを伴い、対象がネットワークパスの場合は特に高コストになる）から、
/// 必ず以下の順序で処理する。
/// 1. `.lnk`/`.url` を列挙する（変換・実在チェックは行わない。ファイル名・自身の更新日時
///    のみ取得する）
/// 2. 更新日時で降順ソートする
/// 3. 更新日時が `max_age_days` より前のものを除外する
/// 4. `max_results` で足切りする
/// 5. ここまで絞り込んだ候補のみ、リンク先解決・ローカルパス変換・実在チェック
///    （UNC 除外ルールを含む）を行う
/// 6. 5 の結果、実在しない・変換失敗のものはこの時点で除外する（3・4 で切り捨てた候補
///    まで遡って再チェックしない。最終的な表示件数が `max_results` よりやや少なくなる
///    ことがあるが、許容する仕様）
///
/// `max_results`（表示件数上限）・`max_age_days`（保持期間）はいずれも
/// `AppSettings` の設定画面から変更可能な値を呼び出し元（`get_recent_files` コマンド）
/// が渡す。
#[cfg(windows)]
pub fn get_recent_files(max_results: usize, max_age_days: i64) -> Vec<RecentFile> {
    use std::collections::HashMap;

    // 1. 列挙する（変換・実在チェックなし）
    let mut candidates: Vec<ShortcutCandidate> = Vec::new();
    let dirs = [
        known_folder::recent_folder_path(),
        known_folder::office_recent_folder_path(),
    ];
    for dir in dirs.into_iter().flatten() {
        let Ok(entries) = std::fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries.flatten() {
            let entry_path = entry.path();
            let Some(ext) = entry_path.extension().and_then(|e| e.to_str()) else {
                continue;
            };
            let kind = if ext.eq_ignore_ascii_case("lnk") {
                ShortcutKind::Lnk
            } else if ext.eq_ignore_ascii_case("url") {
                ShortcutKind::Url
            } else {
                continue;
            };
            let Ok(metadata) = entry.metadata() else {
                continue;
            };
            candidates.push(ShortcutCandidate {
                path: entry_path,
                kind,
                last_accessed: file_mtime_ms(&metadata),
            });
        }
    }

    // 2. 更新日時の降順にソートする
    candidates.sort_by(|a, b| b.last_accessed.cmp(&a.last_accessed));

    // 3. 保持期間より前のものを除外する
    let cutoff = recent_file_cutoff_ms(max_age_days);
    candidates.retain(|c| c.last_accessed >= cutoff);

    // 4. 表示件数上限で足切りする
    candidates.truncate(max_results);

    // 5. 絞り込んだ候補のみリンク先解決・ローカルパス変換・実在チェックを行う
    let encoding = system_default_encoding();
    let mounts = sync_engine_mount_points();

    // .lnk・.url を問わず、同一のローカルパスを指すエントリは1件に統合する
    // （last_accessed が新しい方を採用）。
    let mut entries_by_path: HashMap<String, RecentFile> = HashMap::new();
    for candidate in &candidates {
        let file = match candidate.kind {
            ShortcutKind::Lnk => process_lnk(&candidate.path, candidate.last_accessed),
            ShortcutKind::Url => {
                process_url(&candidate.path, encoding, &mounts, candidate.last_accessed)
            }
        };
        // 6. 実在しない・変換失敗のものはここで除外する（切り捨てた候補までは遡らない）
        let Some(file) = file else {
            continue;
        };

        let key = file.path.to_lowercase();
        let should_replace = entries_by_path
            .get(&key)
            .is_none_or(|existing| file.last_accessed > existing.last_accessed);
        if should_replace {
            entries_by_path.insert(key, file);
        }
    }

    let mut files: Vec<RecentFile> = entries_by_path.into_values().collect();
    files.sort_by(|a, b| b.last_accessed.cmp(&a.last_accessed));
    files
}

#[cfg(not(windows))]
pub fn get_recent_files(_max_results: usize, _max_age_days: i64) -> Vec<RecentFile> {
    Vec::new()
}
