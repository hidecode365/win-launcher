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
  closeWindow: (options?: {
    clearQuery?: "full" | "prefixOnly";
    prefix?: string;
    cleanup?: () => void | Promise<void>;
  }) => Promise<void>,
  // R-1 フェーズD-2: useSearch.ts の intent ベースの選択解決（rows.findIndex 相当）を
  // clipboardMode にも適用するため、clipboardEntries が変化するたびその識別子
  // （id）一覧を useSearch 側へ push する（useSearch は useClipboard の戻り値に
  // 依存できない構成のため、逆方向に push する形にしている。詳細は useSearch.ts の
  // SelectIntent 型のコメントを参照）。
  syncClipboardSelectionItems: (items: { key: string }[]) => void,
  // issue 0024：クリップボード履歴画面の確定クローズ（Enter/クリックでの
  // コピー）で、L1状態（App.tsx の view）を明示的に検索画面へ戻すためのコールバック
  // （useSearch.ts の launchFile と同じ理由。次回表示は常に通常の検索画面から
  // 開始する仕様のため）。
  resetToSearchView: () => void
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

  useEffect(() => {
    syncClipboardSelectionItems(clipboardEntries.map((e) => ({ key: e.id })));
  }, [clipboardEntries, syncClipboardSelectionItems]);

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

  // issue 0024：クリップボード履歴画面はお気に入り・メモと異なり、確定クローズ後の
  // 次回表示は常に通常の検索画面から開始する仕様のため、クエリは完全にクリアし
  // （closeWindow() の既定 "full"）、L1状態（App.tsx の view）も明示的に検索画面へ
  // 戻す（resetToSearchView）。クリップボードへの書き込み invoke は closeWindow() の
  // hideWindow() を待たず fire-and-forget で発火する（詳細は「ウィンドウを閉じる系
  // アクションの共通設計」節）。
  const selectClipboardEntry = useCallback(
    async (entry: ClipboardEntry) => {
      if (entry.type === "text") {
        invoke("copy_to_clipboard", { text: entry.text }).catch(console.error);
      } else {
        invoke("paste_clipboard_image", { id: entry.id }).catch(console.error);
      }
      await closeWindow({ cleanup: () => resetToSearchView() });
    },
    [closeWindow, resetToSearchView]
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
