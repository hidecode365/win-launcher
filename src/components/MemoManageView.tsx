import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FavoriteNode, MEMO_FOLDER_ID, MEMO_TRASH_ID } from "../types";
import { groupNodesByParent, walkGroupedTree } from "../lib/nodeTree";

export function MemoManageView({ onClose, onEdit }: { onClose: () => void; onEdit: (id: string) => void }) {
  const [nodes, setNodes] = useState<FavoriteNode[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const reload = useCallback(() => invoke<FavoriteNode[]>("get_memo_manage_nodes").then(setNodes).catch(console.error), []);
  useEffect(() => { reload(); }, [reload]);
  const rows = useMemo(() => { const grouped = groupNodesByParent(nodes); const result: Array<{ node: FavoriteNode; depth: number; trashed: boolean }> = [{ node: { id: MEMO_FOLDER_ID, parentId: "", type: "folder", name: "メモ", value: "", order: 0, collapsed: false }, depth: 0, trashed: false }]; const add = (root: string, trashed: boolean) => walkGroupedTree(grouped, root, (node, depth) => { result.push({ node, depth: depth + 1, trashed }); }); add(MEMO_FOLDER_ID, false); const trash = nodes.find((node) => node.id === MEMO_TRASH_ID); if (trash) result.push({ node: trash, depth: 1, trashed: true }); add(MEMO_TRASH_ID, true); return result; }, [nodes]);
  const selectedNode = nodes.find((node) => node.id === selected) ?? null;
  const createMemo = async () => { await invoke("add_memo", { name: "無題のメモ", content: "", parentId: MEMO_FOLDER_ID }); reload(); };
  const createFolder = async () => { const name = window.prompt("フォルダ名"); if (!name) return; await invoke("add_memo_folder", { name, parentId: MEMO_FOLDER_ID }); reload(); };
  const rename = async () => { if (!selectedNode || [MEMO_FOLDER_ID, MEMO_TRASH_ID].includes(selectedNode.id)) return; const newName = window.prompt("名前", selectedNode.name); if (!newName) return; await invoke("rename_favorite_node", { id: selectedNode.id, newName }); reload(); };
  const remove = async () => { if (!selectedNode || [MEMO_FOLDER_ID, MEMO_TRASH_ID].includes(selectedNode.id)) return; await invoke("delete_memo_node", { id: selectedNode.id }); setSelected(null); reload(); };
  const moveTo = async (target: FavoriteNode) => {
    if (!draggingId || draggingId === target.id) return;
    const parentId = target.type === "folder" ? target.id : target.parentId;
    const siblings = nodes.filter((node) => node.parentId === parentId && node.id !== draggingId).sort((a, b) => a.order - b.order);
    const index = target.type === "folder" ? siblings.length : Math.max(0, siblings.findIndex((node) => node.id === target.id));
    try { await invoke("move_memo_node_to", { id: draggingId, newParentId: parentId, targetIndex: index }); await reload(); } catch (error) { console.error(error); } finally { setDraggingId(null); }
  };
  return <div className="flex h-screen flex-col overflow-hidden rounded-2xl bg-white/90">
    <header data-tauri-drag-region="deep" className="flex items-center gap-3 border-b border-gray-200/60 px-4 py-3"><button type="button" onClick={onClose} className="text-gray-500">←</button><span className="font-medium">メモ管理画面</span><div className="ml-auto flex gap-2"><button type="button" onClick={createFolder} className="text-sm text-gray-600">フォルダ作成</button><button type="button" onClick={createMemo} className="rounded bg-blue-500 px-2 py-1 text-sm text-white">メモ作成</button></div></header>
    <div className="flex-1 overflow-y-auto">{rows.map(({ node, depth, trashed }) => <button key={node.id} type="button" draggable={!([MEMO_FOLDER_ID, MEMO_TRASH_ID].includes(node.id))} onDragStart={() => setDraggingId(node.id)} onDragEnd={() => setDraggingId(null)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); moveTo(node); }} onClick={() => setSelected(node.id)} className={`flex w-full items-center px-4 py-2 text-left text-sm ${selected === node.id ? "bg-blue-500 text-white" : trashed ? "text-gray-400 hover:bg-gray-100" : "text-gray-700 hover:bg-gray-100"} ${draggingId === node.id ? "opacity-50" : ""}`} style={{ paddingLeft: 16 + depth * 20 }}>{node.type === "folder" ? "▾ " : ""}{node.name}</button>)}</div>
    <footer className="flex gap-2 border-t border-gray-200/60 p-3"><button type="button" disabled={!selectedNode || selectedNode.type !== "memo" || selectedNode.id === MEMO_TRASH_ID || rows.find((row) => row.node.id === selectedNode.id)?.trashed} onClick={() => selectedNode && onEdit(selectedNode.id)} className="text-sm disabled:opacity-40">本文を編集</button><button type="button" disabled={!selectedNode || [MEMO_FOLDER_ID, MEMO_TRASH_ID].includes(selectedNode.id)} onClick={rename} className="text-sm disabled:opacity-40">名前を変更</button><button type="button" disabled={!selectedNode || [MEMO_FOLDER_ID, MEMO_TRASH_ID].includes(selectedNode.id)} onClick={remove} className="ml-auto text-sm text-red-500 disabled:opacity-40">削除</button></footer>
  </div>;
}
