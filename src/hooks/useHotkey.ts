import { useCallback, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { AppSettings } from "../types";

export function useHotkey(setAppSettings: (settings: AppSettings) => void) {
  const [hotkeyError, setHotkeyError] = useState<string | null>(null);

  const setHotkey = useCallback(
    async (accelerator: string) => {
      setHotkeyError(null);
      try {
        const updated = await invoke<AppSettings>("set_hotkey", {
          accelerator,
        });
        setAppSettings(updated);
      } catch (e) {
        setHotkeyError(String(e));
      }
    },
    [setAppSettings]
  );

  const resetHotkeyError = useCallback(() => {
    setHotkeyError(null);
  }, []);

  return { hotkeyError, setHotkey, resetHotkeyError };
}
