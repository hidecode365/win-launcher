import {
  MutableRefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { readText } from "@tauri-apps/plugin-clipboard-manager";
import type { Store } from "@tauri-apps/plugin-store";
import { makeId } from "../lib/format";
import {
  AppSettings,
  ClipboardChangedPayload,
  ClipboardEntry,
  ClipboardTextEntry,
} from "../types";

export function useClipboard(
  appSettingsRef: MutableRefObject<AppSettings>,
  clipboardMode: boolean,
  clipboardFilterText: string | null,
  storeRef: MutableRefObject<Store | null>,
  closeWindow: (options?: { clearQuery?: boolean }) => Promise<void>
) {
  const [clipboardHistory, setClipboardHistory] = useState<ClipboardEntry[]>(
    []
  );
  const clipboardHistoryRef = useRef<ClipboardEntry[]>([]);

  const clipboardEntries = useMemo(() => {
    if (!clipboardMode) return [];
    const filter = (clipboardFilterText ?? "").toLowerCase();
    if (!filter) return clipboardHistory;
    return clipboardHistory.filter(
      (e) => e.type === "text" && e.text.toLowerCase().includes(filter)
    );
  }, [clipboardMode, clipboardFilterText, clipboardHistory]);

  // クリップボードの内容を記録し、重複排除・最大件数のトリムをしたうえで
  // settings.json の "clipboardHistory"（テキストのみ）へ永続化する。
  // 画像は Rust 側のイベント payload（ID・サムネイル）をそのまま使うだけで、
  // バイナリの取得・デコードは一切行わない（IPC 越しの巨大データ転送を避けるため）。
  // appSettingsRef/clipboardHistoryRef は listen() の登録を空依存配列に保つための鏡。
  const recordClipboardEntry = useCallback(
    async (payload: ClipboardChangedPayload) => {
      if (!appSettingsRef.current.clipboardEnabled) return;

      let newEntry: ClipboardEntry | null = null;

      if (payload.type === "text") {
        const text = await readText().catch(() => null);
        if (text && text.length > 0) {
          newEntry = { type: "text", id: makeId(), text, timestamp: Date.now() };
        }
      } else {
        newEntry = {
          type: "image",
          id: payload.id,
          thumbnailDataUrl: payload.thumbnailDataUrl,
          width: payload.width,
          height: payload.height,
          timestamp: payload.timestamp,
        };
      }

      if (!newEntry) return;
      const entry = newEntry;

      const isDuplicate = (e: ClipboardEntry) =>
        entry.type === "text"
          ? e.type === "text" && e.text === entry.text
          : e.type === "image" && e.thumbnailDataUrl === entry.thumbnailDataUrl;

      const maxItems = appSettingsRef.current.clipboardMaxItems;
      const updated = [
        entry,
        ...clipboardHistoryRef.current.filter((e) => !isDuplicate(e)),
      ].slice(0, maxItems);
      clipboardHistoryRef.current = updated;
      setClipboardHistory(updated);

      const store = storeRef.current;
      if (store) {
        const textOnly = updated.filter(
          (e): e is ClipboardTextEntry => e.type === "text"
        );
        await store.set("clipboardHistory", textOnly);
        await store.save();
      }
    },
    []
  );

  useEffect(() => {
    const unlistenPromise = listen<ClipboardChangedPayload>(
      "clipboard-changed",
      (event) => {
        recordClipboardEntry(event.payload).catch(console.error);
      }
    );
    return () => {
      unlistenPromise.then((unlisten) => unlisten()).catch(console.error);
    };
  }, [recordClipboardEntry]);

  const selectClipboardEntry = useCallback(
    async (entry: ClipboardEntry) => {
      if (entry.type === "text") {
        await invoke("copy_to_clipboard", { text: entry.text }).catch(console.error);
      } else {
        await invoke("paste_clipboard_image", { id: entry.id }).catch(console.error);
      }
      await closeWindow();
    },
    [closeWindow]
  );

  const setInitialHistory = useCallback((data: ClipboardTextEntry[]) => {
    clipboardHistoryRef.current = data;
    setClipboardHistory(data);
  }, []);

  return {
    clipboardEntries,
    selectClipboardEntry,
    setInitialHistory,
  };
}
