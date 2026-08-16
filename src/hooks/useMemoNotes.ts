import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { FavoriteNode, MemoDocument } from "../types";

const DRAFT_DELAY_MS = 500;

export function useMemoNotes(active: boolean) {
  const [nodes, setNodes] = useState<FavoriteNode[]>([]);
  const [documents, setDocuments] = useState<Record<string, MemoDocument>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [document, setDocument] = useState<MemoDocument | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestRef = useRef<{ id: string; content: string; revision: number } | null>(null);

  const refresh = useCallback(async () => {
    const next = await invoke<FavoriteNode[]>("get_memo_nodes");
    setNodes(next);
    const loaded = await Promise.all(next.filter((node) => node.type === "memo").map(async (node) => [node.id, await invoke<MemoDocument>("get_memo_document", { id: node.id })] as const));
    setDocuments(Object.fromEntries(loaded));
    setSelectedId((current) => current && next.some((node) => node.id === current) ? current : next.find((node) => node.type === "memo")?.id ?? null);
  }, []);

  useEffect(() => { if (active) refresh().catch(console.error); }, [active, refresh]);
  useEffect(() => {
    if (!selectedId) { setDocument(null); return; }
    invoke<MemoDocument>("get_memo_document", { id: selectedId }).then((next) => {
      setDocument(next);
      latestRef.current = { id: selectedId, content: next.draft?.content ?? next.content, revision: next.revision };
    }).catch(console.error);
  }, [selectedId]);

  const flushDraft = useCallback(async () => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    const latest = latestRef.current;
    if (!latest) return;
    const saved = await invoke<MemoDocument>("save_memo_draft", { id: latest.id, content: latest.content, expectedRevision: latest.revision });
    if (latestRef.current?.id === latest.id) setDocument(saved);
  }, []);

  const updateContent = useCallback((content: string) => {
    const latest = latestRef.current;
    if (!latest) return;
    latestRef.current = { ...latest, content };
    setDocument((current) => current ? { ...current, draft: { content, updatedAt: Date.now() } } : current);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => { flushDraft().catch(console.error); }, DRAFT_DELAY_MS);
  }, [flushDraft]);

  const saveFinal = useCallback(async () => {
    const latest = latestRef.current;
    if (!latest) return;
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    const saved = await invoke<MemoDocument>("save_memo_final", { id: latest.id, content: latest.content, expectedRevision: latest.revision });
    latestRef.current = { id: latest.id, content: saved.content, revision: saved.revision };
    setDocument(saved);
  }, []);

  useEffect(() => () => { flushDraft().catch(console.error); }, [flushDraft]);
  return { nodes, documents, selectedId, setSelectedId, document, updateContent, saveFinal, flushDraft, refresh };
}
