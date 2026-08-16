import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FavoriteNode, MEMO_FOLDER_ID, MEMO_TRASH_ID } from "../types";
import { groupNodesByParent, walkGroupedTree } from "../lib/nodeTree";
import { useTreeEditSelection } from "../hooks/useTreeEditSelection";
import { Tooltip } from "./Tooltip";
import { FooterBar } from "./FooterBar";
import { KeyHint } from "./KeyHint";

export function MemoManageView({ onClose, onEdit, version }: { onClose: () => void; onEdit: (id: string) => void; version: string }) {
  const [nodes, setNodes] = useState<FavoriteNode[]>([]);
  const [creating, setCreating] = useState<"folder" | "memo" | null>(null);
  const [name, setName] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const reload = useCallback(() => invoke<FavoriteNode[]>("get_memo_manage_nodes").then(setNodes).catch(console.error), []);
  useEffect(() => { reload(); }, [reload]);
  const rows = useMemo(() => { const grouped = groupNodesByParent(nodes); const result: Array<{ node: FavoriteNode; depth: number; trashed: boolean }> = [{ node: { id: MEMO_FOLDER_ID, parentId: "", type: "folder", name: "メモ", value: "", order: 0, collapsed: false }, depth: 0, trashed: false }]; const add = (root: string, trashed: boolean) => walkGroupedTree(grouped, root, (node, depth) => { result.push({ node, depth: depth + 1, trashed }); }); add(MEMO_FOLDER_ID, false); const trash = nodes.find((node) => node.id === MEMO_TRASH_ID); if (trash) result.push({ node: trash, depth: 1, trashed: true }); add(MEMO_TRASH_ID, true); return result; }, [nodes]);
  const selection = useTreeEditSelection(rows.map((row) => ({ key: row.node.id })), MEMO_FOLDER_ID);
  const selectedNode = rows[selection.selected]?.node ?? null;
  const createMemo = async () => { const created = await invoke<FavoriteNode[]>("add_memo", { name: name.trim() || "無題のメモ", content: "", parentId: MEMO_FOLDER_ID }); setCreating(null); setName(""); await reload(); const node = created.find((item) => item.type === "memo" && item.name === (name.trim() || "無題のメモ")); if (node) selection.selectByKey(node.id, Date.now() + 1000); };
  const createFolder = async () => { if (!name.trim()) return; const created = await invoke<FavoriteNode[]>("add_memo_folder", { name: name.trim(), parentId: MEMO_FOLDER_ID }); setCreating(null); setName(""); await reload(); const node = created.find((item) => item.type === "folder" && item.name === name.trim()); if (node) selection.selectByKey(node.id, Date.now() + 1000); };
  const rename = async () => { if (!selectedNode || [MEMO_FOLDER_ID, MEMO_TRASH_ID].includes(selectedNode.id) || !name.trim()) return; await invoke("rename_favorite_node", { id: selectedNode.id, newName: name.trim() }); setRenaming(null); setName(""); reload(); };
  const remove = async () => { if (!selectedNode || [MEMO_FOLDER_ID, MEMO_TRASH_ID].includes(selectedNode.id)) return; await invoke("delete_memo_node", { id: selectedNode.id }); selection.resetToTop(); reload(); };
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); return; }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); selection.moveSelection(event.key === "ArrowDown" ? 1 : -1); return; }
      if (event.key === "F2" && selectedNode && ![MEMO_FOLDER_ID, MEMO_TRASH_ID].includes(selectedNode.id)) { event.preventDefault(); setRenaming(selectedNode.id); setName(selectedNode.name); return; }
      if (event.key === "Delete") { event.preventDefault(); remove().catch(console.error); return; }
      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "n") { event.preventDefault(); setCreating("folder"); setName(""); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, selectedNode, selection, remove]);
  const moveTo = async (target: FavoriteNode) => {
    if (!draggingId || draggingId === target.id) return;
    const parentId = target.type === "folder" ? target.id : target.parentId;
    const siblings = nodes.filter((node) => node.parentId === parentId && node.id !== draggingId).sort((a, b) => a.order - b.order);
    const index = target.type === "folder" ? siblings.length : Math.max(0, siblings.findIndex((node) => node.id === target.id));
    try { await invoke("move_memo_node_to", { id: draggingId, newParentId: parentId, targetIndex: index }); await reload(); } catch (error) { console.error(error); } finally { setDraggingId(null); }
  };
  return <div className="flex h-screen flex-col overflow-hidden rounded-2xl bg-white/90">
    <header data-tauri-drag-region="deep" className="flex items-center gap-3 border-b border-gray-200/60 px-4 py-3"><Tooltip label="戻る"><button type="button" onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600">←</button></Tooltip><span className="font-medium">メモを管理</span><div className="ml-auto flex gap-2"><Tooltip label="フォルダを作成"><button type="button" onClick={() => { setCreating("folder"); setName(""); }} className="p-1 text-gray-500">📁＋</button></Tooltip><Tooltip label="メモを作成"><button type="button" onClick={() => { setCreating("memo"); setName(""); }} className="p-1 text-gray-500">📝＋</button></Tooltip><Tooltip label="本文を編集"><button type="button" disabled={!selectedNode || selectedNode.type !== "memo" || selectedNode.id === MEMO_TRASH_ID} onClick={() => selectedNode && onEdit(selectedNode.id)} className="p-1 text-gray-500 disabled:opacity-30">✎</button></Tooltip><Tooltip label="削除"><button type="button" disabled={!selectedNode || [MEMO_FOLDER_ID, MEMO_TRASH_ID].includes(selectedNode.id)} onClick={() => remove().catch(console.error)} className="p-1 text-red-500 disabled:opacity-30">🗑</button></Tooltip></div></header>
    <div className="flex-1 overflow-y-auto">{creating && <form className="flex gap-2 border-b p-2" onSubmit={(e) => { e.preventDefault(); (creating === "folder" ? createFolder : createMemo)().catch(console.error); }}><input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={creating === "folder" ? "フォルダ名" : "メモ名"} className="flex-1 rounded border px-2 py-1 text-sm"/><button className="text-sm text-blue-600">作成</button><button type="button" onClick={() => setCreating(null)} className="text-sm">取消</button></form>}{rows.map(({ node, depth, trashed }, index) => <div key={node.id} draggable={!([MEMO_FOLDER_ID, MEMO_TRASH_ID].includes(node.id))} onDragStart={() => setDraggingId(node.id)} onDragEnd={() => setDraggingId(null)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); moveTo(node); }} onDoubleClick={() => { if (![MEMO_FOLDER_ID, MEMO_TRASH_ID].includes(node.id)) { setRenaming(node.id); setName(node.name); } }} onClick={() => selection.selectByKey(node.id)} className={`flex w-full items-center gap-2 px-4 py-2 text-left text-sm ${selection.selected === index ? "bg-blue-500 text-white" : trashed ? "text-gray-400 hover:bg-gray-100" : "text-gray-700 hover:bg-gray-100"} ${draggingId === node.id ? "opacity-50" : ""}`} style={{ paddingLeft: 16 + depth * 20 }}><span className="cursor-grab text-xs">⠿</span><span>{node.type === "folder" ? "📁" : "📝"}</span>{renaming === node.id ? <form className="flex-1" onSubmit={(e) => { e.preventDefault(); rename().catch(console.error); }}><input autoFocus value={name} onChange={(e) => setName(e.target.value)} onBlur={() => setRenaming(null)} className="w-full rounded px-1 text-gray-800"/></form> : <span className="flex-1 truncate">{node.name}</span>}</div>)}</div>
    <FooterBar version={version}><KeyHint keys="↑↓" label="選択" /><KeyHint keys="F2" label="リネーム" /><KeyHint keys="Delete" label="削除" /><KeyHint keys="Esc" label="戻る" /></FooterBar>
  </div>;
}
