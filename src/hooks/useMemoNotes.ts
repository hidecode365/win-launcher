import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { MemoDocument } from "../types";

const DRAFT_DELAY_MS = 500;

// 選択中1件のメモ本文（下書き・確定版）の管理に専念する。ゴミ箱配下のメモも
// 読み取りは可能（`get_memo_document` はissue 0026補足仕様でトラッシュ配下の
// 読み取りを許可済み）。ツリー構造・一覧行・フィルタリングは呼び出し元
// （useMemoManage.ts）の責務であり、ここでは持たない（かつてこのフックが
// 独自に `get_memo_nodes` で一覧を取得していたが、呼び出し元は一度も
// 参照しておらず、実質的な無駄なIPC往復だったため撤去した）。
export function useMemoNotes() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [document, setDocument] = useState<MemoDocument | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestRef = useRef<{ id: string; content: string; revision: number } | null>(null);

  useEffect(() => {
    if (!selectedId) { setDocument(null); latestRef.current = null; return; }
    let cancelled = false;
    invoke<MemoDocument>("get_memo_document", { id: selectedId }).then((next) => {
      if (cancelled) return;
      setDocument(next);
      latestRef.current = { id: selectedId, content: next.draft?.content ?? next.content, revision: next.revision };
    }).catch(console.error);
    return () => { cancelled = true; };
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

  const discardDraft = useCallback(async () => {
    const latest = latestRef.current;
    if (!latest) return;
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    const confirmedContent = document?.content ?? "";
    const saved = await invoke<MemoDocument>("save_memo_draft", {
      id: latest.id,
      content: confirmedContent,
      expectedRevision: latest.revision,
    });
    latestRef.current = { id: latest.id, content: saved.content, revision: saved.revision };
    setDocument(saved);
  }, [document]);

  useEffect(() => () => { flushDraft().catch(console.error); }, [flushDraft]);
  return { selectedId, setSelectedId, document, updateContent, saveFinal, discardDraft, flushDraft };
}
