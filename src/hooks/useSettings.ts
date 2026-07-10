import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { AppSettings, DEFAULT_APP_SETTINGS, FolderEntry } from "../types";

export function useSettings(showSettings: boolean) {
  const [appSettings, setAppSettings] = useState<AppSettings>(
    DEFAULT_APP_SETTINGS
  );
  const appSettingsRef = useRef<AppSettings>(DEFAULT_APP_SETTINGS);
  const [folders, setFolders] = useState<FolderEntry[]>([]);
  const [clipboardSettingsError, setClipboardSettingsError] = useState<
    string | null
  >(null);

  useEffect(() => {
    invoke<AppSettings>("get_app_settings").then(setAppSettings).catch(console.error);
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

  const setSystemCommandEnabled = useCallback(async (enabled: boolean) => {
    const updated = await invoke<AppSettings>("set_system_command_enabled", {
      enabled,
    }).catch(() => null);
    if (updated) setAppSettings(updated);
  }, []);

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

  const setOcrEnabled = useCallback(async (enabled: boolean) => {
    const updated = await invoke<AppSettings>("set_ocr_enabled", {
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

  const resetClipboardSettingsError = useCallback(() => {
    setClipboardSettingsError(null);
  }, []);

  return {
    appSettings,
    setAppSettings,
    appSettingsRef,
    folders,
    clipboardSettingsError,
    resetClipboardSettingsError,
    setFileSearchEnabled,
    setCalcEnabled,
    setCopyWithComma,
    setSystemCommandEnabled,
    setWebSearchEnabled,
    setClipboardEnabled,
    setClipboardPrefix,
    setClipboardMaxItems,
    setOcrEnabled,
    addFolder,
    toggleFolder,
    removeFolder,
    openFolder,
  };
}
