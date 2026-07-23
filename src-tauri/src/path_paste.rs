use serde::Serialize;
use std::path::Path;

/// 貼り付け判定の結果。フロントエンドはこの1件を「検索フォルダに追加」
/// 「検索フォルダにショートカット配置」の候補行として表示する。
#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PastedPathInfo {
    pub path: String,
    pub name: String,
    pub is_dir: bool,
}

fn from_path_str(raw: &str) -> Option<PastedPathInfo> {
    let path = Path::new(raw);
    if !path.exists() {
        return None;
    }
    let name = path.file_name()?.to_string_lossy().to_string();
    Some(PastedPathInfo {
        path: raw.to_string(),
        name,
        is_dir: path.is_dir(),
    })
}

/// テキスト形式の貼り付け内容からパスを判定するフォールバック。「パスのコピー」等で
/// クリップボードに入るダブルクォート付きの文字列（例: `"C:\Users\...\file.txt"`）を
/// 想定し、前後のダブルクォートのみを取り除く（クォートなしの単純なパス文字列もそのまま扱う）。
fn parse_text_path(text: &str) -> Option<String> {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return None;
    }
    let unquoted = trimmed
        .strip_prefix('"')
        .and_then(|s| s.strip_suffix('"'))
        .unwrap_or(trimmed);
    if unquoted.is_empty() {
        None
    } else {
        Some(unquoted.to_string())
    }
}

#[cfg(windows)]
mod detect {
    use clipboard_win::{formats, Clipboard, Getter};

    /// `CF_HDROP`（Explorer での通常コピー時に付与される実体パス一覧）のみを確認する。
    /// パスが単一の場合のみそのパス文字列をそのまま返す（クォート等の加工はしない）。
    /// 複数パスの場合、および `CF_HDROP` 自体が存在しない場合はいずれも `None` を返す
    /// （呼び出し側はこれを「検索ボックスへの流し込みを行わない」判断に使う。存在しない
    /// 場合と複数パスの場合を区別する必要はない。詳細は REQUIREMENTS.md
    /// 「パス貼り付けによる検索フォルダ管理」節の「貼り付け内容の判定方法」を参照）。
    /// テキスト形式（ダブルクォート付きパス文字列等）の判定はここでは行わない。検索
    /// ボックスに流し込んだ後、通常のテキスト貼り付け・手入力と同じ経路
    /// （`judge_pasted_path`）で判定する。
    pub fn read_hdrop_single_path() -> Option<String> {
        let _clip = Clipboard::new_attempts(3).ok()?;

        let mut file_list: Vec<String> = Vec::new();
        formats::FileList.read_clipboard(&mut file_list).ok()?;
        if file_list.len() != 1 {
            return None;
        }
        Some(file_list.into_iter().next()?)
    }
}

#[cfg(windows)]
pub fn read_hdrop_single_path() -> Option<String> {
    detect::read_hdrop_single_path()
}

#[cfg(not(windows))]
pub fn read_hdrop_single_path() -> Option<String> {
    None
}

/// 検索ボックスの文字列（CF_HDROP からの流し込み・通常のテキスト貼り付け・手入力の
/// いずれも区別しない）に対して、実在するファイル/フォルダのパスかどうかを判定する。
/// ダブルクォートの有無を問わず動作する（`parse_text_path` が前後のダブルクォートのみを
/// 取り除く）。
pub fn judge_pasted_path(text: &str) -> Option<PastedPathInfo> {
    let raw_path = parse_text_path(text)?;
    from_path_str(&raw_path)
}

/// Explorer 標準の連番付与規則（「名前 (2)」「名前 (3)」…）に倣い、`dir` 配下に
/// 同名の `.lnk` が既に存在する場合は自動的に連番を付与した名前（拡張子なし）を返す。
pub fn unique_lnk_name(dir: &Path, base_name: &str) -> String {
    if !dir.join(format!("{base_name}.lnk")).exists() {
        return base_name.to_string();
    }
    let mut n = 2;
    loop {
        let candidate = format!("{base_name} ({n})");
        if !dir.join(format!("{candidate}.lnk")).exists() {
            return candidate;
        }
        n += 1;
    }
}

/// `.lnk` ファイルの作成。Windows COM の `IShellLinkW`／`IPersistFile` を直接呼び出す
/// （`mslnk` クレートを使わない理由・経緯は CLAUDE.md「パス貼り付けによる検索フォルダ管理」
/// 節を参照。要点：`mslnk` はディレクトリを対象にした場合にリンク先情報を一切書き込まない
/// 未実装バグを持つ（上流 Issue #6 で既知・未対応）。標準 API は PIDL（ITEMIDLIST）の構築を
/// 内部で行うため、対象がファイルかディレクトリかで呼び出し側の処理を分岐する必要がない）。
#[cfg(windows)]
pub fn write_shortcut_file(target_path: &str, lnk_path: &Path) -> Result<(), String> {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    use windows::core::{Interface, PCWSTR};
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CoUninitialize, IPersistFile, CLSCTX_INPROC_SERVER,
        COINIT_MULTITHREADED,
    };
    use windows::Win32::UI::Shell::{IShellLinkW, ShellLink};

    fn wide(s: &str) -> Vec<u16> {
        OsStr::new(s).encode_wide().chain(std::iter::once(0)).collect()
    }

    // CoInitializeEx の RAII ラッパー。`ocr` モジュールの `ComInit` と同じ考え方（成功した
    // 初期化のみ Drop 時に CoUninitialize を呼ぶ）だが、モジュールが分かれているため
    // 個別に定義する（`ocr::ComInit` は private でここから再利用できない）。
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
    let _com = ComInit::new();

    let shell_link: IShellLinkW =
        unsafe { CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER) }
            .map_err(|e| e.to_string())?;

    let target_wide = wide(target_path);
    unsafe { shell_link.SetPath(PCWSTR(target_wide.as_ptr())) }.map_err(|e| e.to_string())?;

    // 作業フォルダーは対象の親フォルダに設定する（Explorer が作成する通常のショートカットと
    // 同じ挙動）。対象がドライブ直下等で親を取れない場合は working directory を省略する。
    if let Some(parent) = Path::new(target_path).parent() {
        let working_dir_wide = wide(&parent.to_string_lossy());
        unsafe { shell_link.SetWorkingDirectory(PCWSTR(working_dir_wide.as_ptr())) }
            .map_err(|e| e.to_string())?;
    }

    let persist_file: IPersistFile = shell_link.cast().map_err(|e| e.to_string())?;
    let lnk_path_wide = wide(&lnk_path.to_string_lossy());
    unsafe { persist_file.Save(PCWSTR(lnk_path_wide.as_ptr()), true) }.map_err(|e| e.to_string())
}

#[cfg(not(windows))]
pub fn write_shortcut_file(_target_path: &str, _lnk_path: &Path) -> Result<(), String> {
    Err("unsupported platform".to_string())
}
