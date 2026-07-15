use serde::Serialize;

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RecentFile {
    pub name: String,
    /// `.lnk` 由来ならリンク先のローカルパス、`.url` 由来なら OneDrive のローカル同期先
    /// パスへの変換に成功したローカルパス（`resolve_onedrive_local_path` を参照）。
    /// 変換に失敗した `.url` は一覧に含めないため、ここに含まれるのは常に実在確認済みの
    /// ローカルパスであり、起動処理側で由来による分岐は不要。
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

/// レジストリ `HKEY_CURRENT_USER\Software\Microsoft\OneDrive\Accounts` 配下の
/// すべてのサブキー（`Personal`・`Business1`・`Business2` 等。個数は環境依存）を列挙し、
/// 各サブキーの `UserFolder` 値（ローカル同期先パス）を読み取る。サブキー名を決め打ちに
/// せず動的に列挙することで、個人・会社・複数アカウントいずれの構成にも対応する。
/// 失敗箇所は `eprintln!` でログ出力したうえでスキップする（黙って握りつぶさない）。
#[cfg(windows)]
fn onedrive_local_roots() -> Vec<String> {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    use windows::core::PCWSTR;
    use windows::Win32::Foundation::{ERROR_NO_MORE_ITEMS, ERROR_SUCCESS};
    use windows::Win32::System::Registry::{
        RegCloseKey, RegEnumKeyExW, RegOpenKeyExW, HKEY, HKEY_CURRENT_USER, KEY_READ,
    };

    fn wide(s: &str) -> Vec<u16> {
        OsStr::new(s).encode_wide().chain(std::iter::once(0)).collect()
    }

    let mut roots = Vec::new();

    let accounts_path = wide("Software\\Microsoft\\OneDrive\\Accounts");
    let mut accounts_key = HKEY::default();
    let open_result = unsafe {
        RegOpenKeyExW(
            HKEY_CURRENT_USER,
            PCWSTR(accounts_path.as_ptr()),
            None,
            KEY_READ,
            &mut accounts_key as *mut HKEY,
        )
    };
    if open_result != ERROR_SUCCESS {
        eprintln!(
            "[recent_files] failed to open OneDrive Accounts registry key: {open_result:?}"
        );
        return roots;
    }

    let mut index = 0u32;
    loop {
        let mut name_buf = [0u16; 256];
        let mut name_len = name_buf.len() as u32;
        let enum_result = unsafe {
            RegEnumKeyExW(
                accounts_key,
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
                eprintln!(
                    "[recent_files] failed to enumerate OneDrive account key at index {index}: {enum_result:?}"
                );
            }
            break;
        }

        let subkey_name = String::from_utf16_lossy(&name_buf[..name_len as usize]);
        let subkey_path = wide(&subkey_name);
        let mut subkey = HKEY::default();
        let open_sub = unsafe {
            RegOpenKeyExW(
                accounts_key,
                PCWSTR(subkey_path.as_ptr()),
                None,
                KEY_READ,
                &mut subkey as *mut HKEY,
            )
        };
        if open_sub == ERROR_SUCCESS {
            match read_registry_string(subkey, "UserFolder") {
                Some(user_folder) => roots.push(user_folder),
                None => eprintln!(
                    "[recent_files] OneDrive account key '{subkey_name}' has no readable UserFolder value"
                ),
            }
            unsafe {
                let _ = RegCloseKey(subkey);
            }
        } else {
            eprintln!(
                "[recent_files] failed to open OneDrive account subkey '{subkey_name}': {open_sub:?}"
            );
        }

        index += 1;
    }

    unsafe {
        let _ = RegCloseKey(accounts_key);
    }
    roots
}

/// レジストリの文字列値（`REG_SZ`）を読み取る。
#[cfg(windows)]
fn read_registry_string(
    key: windows::Win32::System::Registry::HKEY,
    value_name: &str,
) -> Option<String> {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    use windows::core::PCWSTR;
    use windows::Win32::Foundation::ERROR_SUCCESS;
    use windows::Win32::System::Registry::{RegQueryValueExW, REG_SZ, REG_VALUE_TYPE};

    let name_wide: Vec<u16> = OsStr::new(value_name)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();

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
    if read_result != ERROR_SUCCESS || value_type != REG_SZ {
        return None;
    }

    let wide: Vec<u16> = buffer
        .chunks_exact(2)
        .map(|c| u16::from_le_bytes([c[0], c[1]]))
        .collect();
    Some(String::from_utf16_lossy(&wide).trim_end_matches('\0').to_string())
}

const ONEDRIVE_URL_PREFIX: &str = "https://d.docs.live.net/";

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

/// `.url` の `URL=` 値を OneDrive のローカル同期先パスへ変換する。
/// `https://d.docs.live.net/` で始まらない URL は変換対象外として `None` を返す。
/// プレフィックスの直後のアカウント識別子セグメント（次の `/` まで）を読み飛ばし、
/// 残りをパーセントデコードしたうえで OneDrive ルートからの相対パスとして扱う。
/// `roots` の候補それぞれについて実在チェックを行い、最初に見つかったローカルパスを返す。
#[cfg(windows)]
fn resolve_onedrive_local_path(url: &str, roots: &[String]) -> Option<String> {
    let Some(after_prefix) = url.strip_prefix(ONEDRIVE_URL_PREFIX) else {
        eprintln!("[recent_files] unsupported .url target (not a OneDrive URL): {url}");
        return None;
    };
    let Some(slash_pos) = after_prefix.find('/') else {
        eprintln!("[recent_files] OneDrive URL is missing the relative path segment: {url}");
        return None;
    };
    let relative_encoded = &after_prefix[slash_pos + 1..];
    if relative_encoded.is_empty() {
        return None;
    }
    let Some(relative_decoded) = percent_decode(relative_encoded) else {
        eprintln!("[recent_files] failed to percent-decode OneDrive relative path: {url}");
        return None;
    };
    let relative = relative_decoded.replace('/', "\\");

    for root in roots {
        let candidate = if root.ends_with('\\') {
            format!("{root}{relative}")
        } else {
            format!("{root}\\{relative}")
        };
        if std::path::Path::new(&candidate).is_file() {
            return Some(candidate);
        }
    }

    eprintln!(
        "[recent_files] no local OneDrive sync root contains the file for: {url}"
    );
    None
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

/// `.lnk` を1件処理する。リンク先の実在チェック・フォルダ除外はここで行う。
/// `ShellLink::open`/`link_target` のエラー・panic は握りつぶさず、原因調査用に
/// `eprintln!` でログ出力したうえで `None`（一覧から除外）を返す。
#[cfg(windows)]
fn process_lnk(lnk_path: &std::path::Path, encoding: &'static encoding_rs::Encoding) -> Option<RecentFile> {
    use lnk::ShellLink;
    use std::fs;
    use std::path::PathBuf;

    let shortcut = match ShellLink::open(lnk_path, encoding) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("[recent_files] failed to parse {}: {e}", lnk_path.display());
            return None;
        }
    };

    // link_target() は LinkInfo の構造次第で内部的に .expect() による panic を起こしうる
    // （lnk クレート側の既知の制約）。1件の異常な .lnk がアプリ全体を巻き込まないよう
    // catch_unwind で保護する（release ビルドは panic = "abort" のため、素通しだと
    // プロセスごと終了してしまう）。
    let target = match std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        shortcut.link_target()
    })) {
        Ok(Some(t)) => t,
        Ok(None) => {
            eprintln!("[recent_files] no link target in {}", lnk_path.display());
            return None;
        }
        Err(_) => {
            eprintln!(
                "[recent_files] panicked while resolving link target of {}",
                lnk_path.display()
            );
            return None;
        }
    };

    let target_path = PathBuf::from(&target);
    let Ok(metadata) = fs::metadata(&target_path) else {
        return None;
    };
    if metadata.is_dir() {
        return None;
    }

    let lnk_metadata = fs::metadata(lnk_path).ok()?;
    let name = target_path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| target.clone());

    Some(RecentFile {
        name,
        path: target,
        last_accessed: file_mtime_ms(&lnk_metadata),
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
        eprintln!(
            "[recent_files] failed to decode {} as UTF-8 or system codepage",
            path.display()
        );
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

/// `.url`（インターネットショートカット）を1件処理する。テキスト（INI形式）として
/// パースし `URL=` 行の値を取得したうえで、OneDrive のローカル同期先パスへの変換を
/// 試みる（`resolve_onedrive_local_path` を参照）。変換に成功したものだけを一覧に含め、
/// 以降は `.lnk` 由来のエントリと全く同じ扱い（実在確認済みのローカルファイル）にする。
/// 変換できなかったものは削除済みファイルと同じ扱いとして一覧から除外する。
#[cfg(windows)]
fn process_url(
    url_path: &std::path::Path,
    fallback_encoding: &'static encoding_rs::Encoding,
    onedrive_roots: &[String],
) -> Option<RecentFile> {
    let content = read_text_file_lossy(url_path, fallback_encoding)?;
    let url = content
        .lines()
        .map(str::trim)
        .find_map(|line| line.strip_prefix("URL="))
        .map(str::trim)
        .filter(|v| !v.is_empty())?;

    let local_path = resolve_onedrive_local_path(url, onedrive_roots)?;

    // ファイル名から末尾の拡張子 ".url" を1つ取り除いたものを表示名とする
    // （Windows のエクスプローラーが .url を隠して表示するのと同じ見た目にするため）。
    let display_name = url_path.file_stem()?.to_string_lossy().to_string();

    // 拡張子を取り除いた結果、表示名に拡張子が残らないもの（OneDrive 上のフォルダ的な
    // 参照）は「ファイルのみを対象とし、フォルダは除外する」既存ルールに従い除外する。
    if !has_plausible_extension(&display_name) {
        return None;
    }

    // ソートキーは変換の成否に関わらず .url 自体の更新日時のまま（既存仕様）。
    let metadata = std::fs::metadata(url_path).ok()?;

    Some(RecentFile {
        name: display_name,
        path: local_path,
        last_accessed: file_mtime_ms(&metadata),
    })
}

/// Windows の Recent フォルダと Office の Recent フォルダ、双方の直下（各フォルダの
/// `AutomaticDestinations`/`CustomDestinations` 等のサブフォルダは `read_dir` が非再帰の
/// ため自然に対象外となる）の `.lnk`/`.url` を列挙する。`.url` はローカルパスへの変換に
/// 成功したものだけを対象に含め、`.lnk` と同じ扱い（ローカルパスによる重複統合）で
/// 1つの一覧にマージしたうえで最終アクセス日時（由来ファイル自体の更新日時）降順で返す。
#[cfg(windows)]
pub fn get_recent_files(max_results: usize) -> Vec<RecentFile> {
    use std::collections::HashMap;

    let encoding = system_default_encoding();
    let onedrive_roots = onedrive_local_roots();

    // .lnk・.url（ローカルパスへの変換に成功したもの）を問わず、同一のローカルパスを
    // 指すエントリは1件に統合する（mtime が新しい方を採用）。
    let mut entries_by_path: HashMap<String, RecentFile> = HashMap::new();

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

            let file = if ext.eq_ignore_ascii_case("lnk") {
                process_lnk(&entry_path, encoding)
            } else if ext.eq_ignore_ascii_case("url") {
                process_url(&entry_path, encoding, &onedrive_roots)
            } else {
                continue;
            };
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
    }

    let mut files: Vec<RecentFile> = entries_by_path.into_values().collect();
    files.sort_by(|a, b| b.last_accessed.cmp(&a.last_accessed));
    files.truncate(max_results);
    files
}

#[cfg(not(windows))]
pub fn get_recent_files(_max_results: usize) -> Vec<RecentFile> {
    Vec::new()
}
