import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { UpdateCheckResult } from "../types";

export type UpdateDialogState =
  | { kind: "checking" }
  | { kind: "upToDate" }
  | { kind: "error"; message: string }
  | { kind: "available"; version: string; notes: string | null }
  | { kind: "installing" };

export function useUpdater() {
  const [dialog, setDialog] = useState<UpdateDialogState | null>(null);

  // silent = true の場合、起動時チェックのように「見つからなかった／失敗した」ことを
  // 画面に出さない。新しいバージョンが見つかった場合はどちらでもダイアログを表示する。
  const runCheck = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    if (!silent) setDialog({ kind: "checking" });
    try {
      const result = await invoke<UpdateCheckResult>("check_for_update");
      if (result.available) {
        setDialog({
          kind: "available",
          version: result.version ?? "",
          notes: result.notes,
        });
      } else if (!silent) {
        setDialog({ kind: "upToDate" });
      } else {
        setDialog(null);
      }
    } catch (e) {
      console.error(e);
      setDialog(silent ? null : { kind: "error", message: String(e) });
    }
  }, []);

  // トレイメニュー「Check for Updates」クリック時、Rust 側がウィンドウを表示したうえで
  // このイベントを emit する。起動時チェックと同じ check_for_update ロジックを流用する。
  useEffect(() => {
    const unlistenPromise = listen("check-for-update-requested", () => {
      runCheck({ silent: false }).catch(console.error);
    });
    return () => {
      unlistenPromise.then((unlisten) => unlisten()).catch(console.error);
    };
  }, [runCheck]);

  const dismiss = useCallback(() => setDialog(null), []);

  // ダウンロード＆インストールが成功すると Windows の制約でアプリごと終了するため、
  // この invoke が正常応答を返すことはない（呼び出し元に制御が戻るのは失敗時のみ）。
  const installUpdate = useCallback(async () => {
    setDialog({ kind: "installing" });
    try {
      await invoke("download_and_install_update");
    } catch (e) {
      setDialog({ kind: "error", message: String(e) });
    }
  }, []);

  return { dialog, runCheck, dismiss, installUpdate };
}
