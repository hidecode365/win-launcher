import { useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { AppSettings } from "../types";

// 「全般」タブ末尾の単一保存ボタンから呼ばれる。成功時は `null`、失敗時はエラー
// メッセージ文字列を返す（他の一括保存対応フィールドと同じ契約。詳細は
// CLAUDE.md「設定画面」節の「エラー状態の保持場所」を参照）。
// エラー表示用の state はこのフック自身では持たない。呼び出し元（GeneralSettings）が
// 戻り値を受けてタブコンポーネントのローカル state として保持することで、タブの
// unmount（他タブへの切り替え）時に自動的に破棄されるようにするため。
export function useHotkey(setAppSettings: (settings: AppSettings) => void) {
  const setHotkey = useCallback(
    async (accelerator: string): Promise<string | null> => {
      try {
        const updated = await invoke<AppSettings>("set_hotkey", {
          accelerator,
        });
        setAppSettings(updated);
        return null;
      } catch (e) {
        return String(e);
      }
    },
    [setAppSettings]
  );

  return { setHotkey };
}
