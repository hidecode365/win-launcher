import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  AppSettings,
  DEFAULT_APP_SETTINGS,
  FolderDetailSettings,
  FolderEntry,
  SystemCommandAction,
  SystemCommandKeywordErrors,
} from "../types";

export function useSettings(showSettings: boolean) {
  const [appSettings, setAppSettings] = useState<AppSettings>(
    DEFAULT_APP_SETTINGS
  );
  const appSettingsRef = useRef<AppSettings>(DEFAULT_APP_SETTINGS);
  const [folders, setFolders] = useState<FolderEntry[]>([]);
  const [clipboardSettingsError, setClipboardSettingsError] = useState<
    string | null
  >(null);
  const [recentSettingsError, setRecentSettingsError] = useState<
    string | null
  >(null);
  const [systemCommandKeywordErrors, setSystemCommandKeywordErrors] =
    useState<SystemCommandKeywordErrors>({
      shutdown: null,
      restart: null,
      sleep: null,
    });
  const [folderSettingsError, setFolderSettingsError] = useState<
    string | null
  >(null);
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

  const setSystemCommandKeyword = useCallback(
    async (command: SystemCommandAction, keyword: string) => {
      setSystemCommandKeywordErrors((prev) => ({ ...prev, [command]: null }));
      try {
        const updated = await invoke<AppSettings>(
          "set_system_command_keyword",
          { command, keyword }
        );
        setAppSettings(updated);
      } catch (e) {
        setSystemCommandKeywordErrors((prev) => ({
          ...prev,
          [command]: String(e),
        }));
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

  const setClipboardPrefix = useCallback(async (prefix: string) => {
    setClipboardSettingsError(null);
    try {
      const updated = await invoke<AppSettings>("set_clipboard_prefix", { prefix });
      setAppSettings(updated);
    } catch (e) {
      setClipboardSettingsError(String(e));
    }
  }, []);

  const setClipboardMaxItems = useCallback(async (maxItems: number) => {
    setClipboardSettingsError(null);
    try {
      const updated = await invoke<AppSettings>("set_clipboard_max_items", {
        maxItems,
      });
      setAppSettings(updated);
    } catch (e) {
      setClipboardSettingsError(String(e));
    }
  }, []);

  const setRecentFilesEnabled = useCallback(async (enabled: boolean) => {
    const updated = await invoke<AppSettings>("set_recent_files_enabled", {
      enabled,
    }).catch(() => null);
    if (updated) setAppSettings(updated);
  }, []);

  const setRecentKeyword = useCallback(async (keyword: string) => {
    setRecentSettingsError(null);
    try {
      const updated = await invoke<AppSettings>("set_recent_keyword", { keyword });
      setAppSettings(updated);
    } catch (e) {
      setRecentSettingsError(String(e));
    }
  }, []);

  const setRecentMaxAgeDays = useCallback(async (days: number) => {
    setRecentSettingsError(null);
    try {
      const updated = await invoke<AppSettings>("set_recent_max_age_days", {
        days,
      });
      setAppSettings(updated);
    } catch (e) {
      setRecentSettingsError(String(e));
    }
  }, []);

  const setRecentMaxResults = useCallback(async (maxResults: number) => {
    setRecentSettingsError(null);
    try {
      const updated = await invoke<AppSettings>("set_recent_max_results", {
        maxResults,
      });
      setAppSettings(updated);
    } catch (e) {
      setRecentSettingsError(String(e));
    }
  }, []);

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
  // 一括保存のため、成功/失敗を戻り値の真偽値で返す（呼び出し側はこれを見て
  // モーダルを閉じるか、エラー表示のまま開いた状態を維持するかを判断する）。
  const setFolderSettings = useCallback(
    async (path: string, detail: FolderDetailSettings) => {
      setFolderSettingsError(null);
      try {
        const updated = await invoke<FolderEntry[]>("set_folder_settings", {
          path,
          maxDepth: detail.maxDepth,
          includeFolders: detail.includeFolders,
          extensionFilterMode: detail.extensionFilterMode,
          extensions: detail.extensions,
        });
        setFolders(updated);
        return true;
      } catch (e) {
        setFolderSettingsError(String(e));
        return false;
      }
    },
    []
  );

  const resetFolderSettingsError = useCallback(() => {
    setFolderSettingsError(null);
  }, []);

  const resetClipboardSettingsError = useCallback(() => {
    setClipboardSettingsError(null);
  }, []);

  const resetRecentSettingsError = useCallback(() => {
    setRecentSettingsError(null);
  }, []);

  const resetSystemCommandKeywordErrors = useCallback(() => {
    setSystemCommandKeywordErrors({ shutdown: null, restart: null, sleep: null });
  }, []);

  return {
    appSettings,
    setAppSettings,
    appSettingsRef,
    settingsLoaded,
    folders,
    clipboardSettingsError,
    resetClipboardSettingsError,
    recentSettingsError,
    resetRecentSettingsError,
    systemCommandKeywordErrors,
    resetSystemCommandKeywordErrors,
    folderSettingsError,
    resetFolderSettingsError,
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
    setOcrEnabled,
    setCheckUpdateOnStartup,
    setPathPasteEnabled,
    addFolder,
    toggleFolder,
    removeFolder,
    openFolder,
    setFolderSettings,
  };
}
