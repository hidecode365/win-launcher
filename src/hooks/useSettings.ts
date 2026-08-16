import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  AppSettings,
  DEFAULT_APP_SETTINGS,
  FolderDetailSettings,
  FolderEntry,
  RecentDisplaySettings,
  SystemCommandAction,
} from "../types";

export function useSettings(showSettings: boolean) {
  const [appSettings, setAppSettings] = useState<AppSettings>(
    DEFAULT_APP_SETTINGS
  );
  const appSettingsRef = useRef<AppSettings>(DEFAULT_APP_SETTINGS);
  const [folders, setFolders] = useState<FolderEntry[]>([]);
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  useEffect(() => {
    invoke<AppSettings>("get_app_settings")
      .then(setAppSettings)
      .catch(console.error)
      .finally(() => setSettingsLoaded(true));
  }, []);

  useEffect(() => {
    appSettingsRef.current = appSettings;
  }, [appSettings]);

  useEffect(() => {
    if (showSettings) {
      invoke<FolderEntry[]>("get_folders").then(setFolders).catch(console.error);
    }
  }, [showSettings]);

  const setFileSearchEnabled = useCallback(async (enabled: boolean) => {
    const updated = await invoke<AppSettings>("set_file_search_enabled", {
      enabled,
    }).catch(() => null);
    if (updated) setAppSettings(updated);
  }, []);

  const setCalcEnabled = useCallback(async (enabled: boolean) => {
    const updated = await invoke<AppSettings>("set_calc_enabled", {
      enabled,
    }).catch(() => null);
    if (updated) setAppSettings(updated);
  }, []);

  const setCopyWithComma = useCallback(async (enabled: boolean) => {
    const updated = await invoke<AppSettings>("set_copy_with_comma", {
      enabled,
    }).catch(() => null);
    if (updated) setAppSettings(updated);
  }, []);

  const setUrlConvertEnabled = useCallback(async (enabled: boolean) => {
    const updated = await invoke<AppSettings>("set_url_convert_enabled", {
      enabled,
    }).catch(() => null);
    if (updated) setAppSettings(updated);
  }, []);

  const setUrlConvertKeepSpaceEncoded = useCallback(async (enabled: boolean) => {
    const updated = await invoke<AppSettings>(
      "set_url_convert_keep_space_encoded",
      { enabled }
    ).catch(() => null);
    if (updated) setAppSettings(updated);
  }, []);

  const setSystemCommandEnabled = useCallback(async (enabled: boolean) => {
    const updated = await invoke<AppSettings>("set_system_command_enabled", {
      enabled,
    }).catch(() => null);
    if (updated) setAppSettings(updated);
  }, []);

  // タブ末尾の単一保存ボタン（一括保存）から、対象コマンドが未保存の場合のみ呼ばれる。
  // 成功時は `null`、失敗時はエラーメッセージ文字列を返す（`setFolderSettings` と同じ
  // 契約）。エラー表示用の state はこのフックでは持たない（詳細は useHotkey.ts の
  // コメント、および CLAUDE.md「設定画面」節の「エラー状態の保持場所」を参照）。
  const setSystemCommandKeyword = useCallback(
    async (
      command: SystemCommandAction,
      keyword: string
    ): Promise<string | null> => {
      try {
        const updated = await invoke<AppSettings>(
          "set_system_command_keyword",
          { command, keyword }
        );
        setAppSettings(updated);
        return null;
      } catch (e) {
        return String(e);
      }
    },
    []
  );

  const setWebSearchEnabled = useCallback(async (enabled: boolean) => {
    const updated = await invoke<AppSettings>("set_web_search_enabled", {
      enabled,
    }).catch(() => null);
    if (updated) setAppSettings(updated);
  }, []);

  const setClipboardEnabled = useCallback(async (enabled: boolean) => {
    const updated = await invoke<AppSettings>("set_clipboard_enabled", {
      enabled,
    }).catch(() => null);
    if (updated) setAppSettings(updated);
  }, []);

  // 「クリップボード」タブ末尾の単一保存ボタンから、未保存の場合のみ呼ばれる。成功時は
  // `null`、失敗時はエラーメッセージ文字列を返す。呼び出し側（一括保存の直列実行）は
  // これを見て、後続フィールドの保存を続けるか、失敗時点で打ち切ってエラーを表示するかを
  // 判断する。エラー表示用の state はこのフックでは持たない（詳細は useHotkey.ts の
  // コメントを参照）。
  const setClipboardPrefix = useCallback(
    async (prefix: string): Promise<string | null> => {
      try {
        const updated = await invoke<AppSettings>("set_clipboard_prefix", {
          prefix,
        });
        setAppSettings(updated);
        return null;
      } catch (e) {
        return String(e);
      }
    },
    []
  );

  const setClipboardMaxItems = useCallback(
    async (maxItems: number): Promise<string | null> => {
      try {
        const updated = await invoke<AppSettings>("set_clipboard_max_items", {
          maxItems,
        });
        setAppSettings(updated);
        return null;
      } catch (e) {
        return String(e);
      }
    },
    []
  );

  const setRecentFilesEnabled = useCallback(async (enabled: boolean) => {
    const updated = await invoke<AppSettings>("set_recent_files_enabled", {
      enabled,
    }).catch(() => null);
    if (updated) setAppSettings(updated);
  }, []);

  // 「最近使ったファイル」タブ末尾の単一保存ボタンから、未保存の場合のみ呼ばれる。
  // 成功時は `null`、失敗時はエラーメッセージ文字列を返す理由は setClipboardPrefix と
  // 同じ（一括保存の直列実行を制御し、後続フィールドの成功が先行フィールドのエラー
  // 表示を消してしまうのを防ぐ）。エラー表示用の state はこのフックでは持たない。
  const setRecentKeyword = useCallback(
    async (keyword: string): Promise<string | null> => {
      try {
        const updated = await invoke<AppSettings>("set_recent_keyword", {
          keyword,
        });
        setAppSettings(updated);
        return null;
      } catch (e) {
        return String(e);
      }
    },
    []
  );

  const setRecentMaxAgeDays = useCallback(
    async (days: number): Promise<string | null> => {
      try {
        const updated = await invoke<AppSettings>("set_recent_max_age_days", {
          days,
        });
        setAppSettings(updated);
        return null;
      } catch (e) {
        return String(e);
      }
    },
    []
  );

  const setRecentMaxResults = useCallback(
    async (maxResults: number): Promise<string | null> => {
      try {
        const updated = await invoke<AppSettings>("set_recent_max_results", {
          maxResults,
        });
        setAppSettings(updated);
        return null;
      } catch (e) {
        return String(e);
      }
    },
    []
  );

  // /recent の「表示対象設定」の保存専用。フォルダ詳細設定モーダルの `setFolderSettings`
  // と同じ一括保存パターン（成功時は `null`、失敗時はエラーメッセージ文字列を返す）を
  // 踏襲する。エラー表示は呼び出し元（RecentFilesSettings）のローカル state を使う
  // （呼び出しキーワード・保持期間・最大表示件数の保存失敗時と同じ state で共有する）。
  const setRecentDisplaySettings = useCallback(
    async (detail: RecentDisplaySettings): Promise<string | null> => {
      try {
        const updated = await invoke<AppSettings>("set_recent_display_settings", {
          includeFolders: detail.includeFolders,
          extensionFilterMode: detail.extensionFilterMode,
          blacklistExtensions: detail.blacklistExtensions,
          whitelistExtensions: detail.whitelistExtensions,
        });
        setAppSettings(updated);
        return null;
      } catch (e) {
        return String(e);
      }
    },
    []
  );

  const setOcrEnabled = useCallback(async (enabled: boolean) => {
    const updated = await invoke<AppSettings>("set_ocr_enabled", {
      enabled,
    }).catch(() => null);
    if (updated) setAppSettings(updated);
  }, []);

  const setCheckUpdateOnStartup = useCallback(async (enabled: boolean) => {
    const updated = await invoke<AppSettings>("set_check_update_on_startup", {
      enabled,
    }).catch(() => null);
    if (updated) setAppSettings(updated);
  }, []);

  const setPathPasteEnabled = useCallback(async (enabled: boolean) => {
    const updated = await invoke<AppSettings>("set_path_paste_enabled", {
      enabled,
    }).catch(() => null);
    if (updated) setAppSettings(updated);
  }, []);

  const setPinEnabled = useCallback(async (enabled: boolean) => {
    const updated = await invoke<AppSettings>("set_pin_enabled", {
      enabled,
    }).catch(() => null);
    if (updated) setAppSettings(updated);
  }, []);

  const setFavoriteEnabled = useCallback(async (enabled: boolean) => {
    const updated = await invoke<AppSettings>("set_favorite_enabled", {
      enabled,
    }).catch(() => null);
    if (updated) setAppSettings(updated);
  }, []);

  // 「お気に入り」タブ末尾の単一保存ボタンから、未保存の場合のみ呼ばれる。成功時は
  // `null`、失敗時はエラーメッセージ文字列を返す理由は setClipboardPrefix/
  // setRecentKeyword と同じ（一括保存の直列実行を制御する。ただし本タブは
  // フィールドが1つのみのため直列実行自体は発生しない）。エラー表示用の state は
  // このフックでは持たない。
  const setFavoriteKeyword = useCallback(
    async (keyword: string): Promise<string | null> => {
      try {
        const updated = await invoke<AppSettings>("set_favorite_keyword", {
          keyword,
        });
        setAppSettings(updated);
        return null;
      } catch (e) {
        return String(e);
      }
    },
    []
  );

  const setMemoEnabled = useCallback(async (enabled: boolean) => {
    const updated = await invoke<AppSettings>("set_memo_enabled", { enabled }).catch(() => null);
    if (updated) setAppSettings(updated);
  }, []);

  const setMemoKeyword = useCallback(
    async (keyword: string): Promise<string | null> => {
      try {
        const updated = await invoke<AppSettings>("set_memo_keyword", { keyword });
        setAppSettings(updated);
        return null;
      } catch (e) {
        return String(e);
      }
    },
    []
  );

  const addFolder = useCallback(async () => {
    const path = await invoke<string | null>("pick_folder").catch(() => null);
    if (!path) return;
    const updated = await invoke<FolderEntry[]>("add_folder", { path }).catch(
      () => null
    );
    if (updated) setFolders(updated);
  }, []);

  const toggleFolder = useCallback(async (path: string) => {
    const updated = await invoke<FolderEntry[]>("toggle_folder", {
      path,
    }).catch(() => null);
    if (updated) setFolders(updated);
  }, []);

  const removeFolder = useCallback(async (path: string) => {
    const updated = await invoke<FolderEntry[]>("remove_folder", {
      path,
    }).catch(() => null);
    if (updated) setFolders(updated);
  }, []);

  const openFolder = useCallback(async (path: string) => {
    await invoke("launch_file", { path }).catch(console.error);
  }, []);

  // フォルダごとの詳細設定ダイアログの「保存」ボタン専用。他の set_* と異なり
  // 一括保存のため、成功時は `null`、失敗時はエラーメッセージ文字列を返す（呼び出し側は
  // これを見てモーダルを閉じるか、エラー表示のまま開いた状態を維持するかを判断する）。
  const setFolderSettings = useCallback(
    async (
      path: string,
      detail: FolderDetailSettings
    ): Promise<string | null> => {
      try {
        const updated = await invoke<FolderEntry[]>("set_folder_settings", {
          path,
          maxDepth: detail.maxDepth,
          includeFolders: detail.includeFolders,
          extensionFilterMode: detail.extensionFilterMode,
          blacklistExtensions: detail.blacklistExtensions,
          whitelistExtensions: detail.whitelistExtensions,
        });
        setFolders(updated);
        return null;
      } catch (e) {
        return String(e);
      }
    },
    []
  );

  return {
    appSettings,
    setAppSettings,
    appSettingsRef,
    settingsLoaded,
    folders,
    setFileSearchEnabled,
    setCalcEnabled,
    setCopyWithComma,
    setUrlConvertEnabled,
    setUrlConvertKeepSpaceEncoded,
    setSystemCommandEnabled,
    setSystemCommandKeyword,
    setWebSearchEnabled,
    setClipboardEnabled,
    setClipboardPrefix,
    setClipboardMaxItems,
    setRecentFilesEnabled,
    setRecentKeyword,
    setRecentMaxAgeDays,
    setRecentMaxResults,
    setRecentDisplaySettings,
    setOcrEnabled,
    setCheckUpdateOnStartup,
    setPathPasteEnabled,
    setPinEnabled,
    setFavoriteEnabled,
    setFavoriteKeyword,
    setMemoEnabled,
    setMemoKeyword,
    addFolder,
    toggleFolder,
    removeFolder,
    openFolder,
    setFolderSettings,
  };
}
