import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CreateFolderResult, FavoriteNode, MEMO_FOLDER_ID, MEMO_TRASH_ID } from "../types";
import { groupNodesByParent, walkGroupedTree } from "../lib/nodeTree";
import { useTreeEditSelection } from "../hooks/useTreeEditSelection";
import { Tooltip } from "./Tooltip";
import { FooterBar } from "./FooterBar";
import { KeyHint } from "./KeyHint";
import { IconSlot } from "./IconSlot";
import { CreateFolderIcon, FileIcon, FOLDER_ICON_PATH } from "./FavoriteTreeVisuals";
import { CreateFolderInlineRow, RenameInput } from "./FavoriteEditTree";

export function MemoManageView({ onClose, onEdit, version }: { onClose: () => void; onEdit: (id: string) => void; version: string }) {
  const [nodes, setNodes] = useState<FavoriteNode[]>([]);
  const [creating, setCreating] = useState<"folder" | "memo" | null>(null);
  const [name, setName] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [filterText, setFilterText] = useState("");
  const [dropTarget, setDropTarget] = useState<{ id: string; position: "before" | "after" | "into" } | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const reload = useCallback(() => invoke<FavoriteNode[]>("get_memo_manage_nodes").then(setNodes).catch(console.error), []);
  useEffect(() => { reload(); }, [reload]);
  const rows = useMemo(() => { const grouped = groupNodesByParent(nodes); const result: Array<{ node: FavoriteNode; depth: number; trashed: boolean }> = [{ node: { id: MEMO_FOLDER_ID, parentId: "", type: "folder", name: "メモ", value: "", order: 0, collapsed: false }, depth: 0, trashed: false }]; const add = (root: string, trashed: boolean) => walkGroupedTree(grouped, root, (node, depth) => { result.push({ node, depth: depth + 1, trashed }); }); add(MEMO_FOLDER_ID, false); const trash = nodes.find((node) => node.id === MEMO_TRASH_ID); if (trash) result.push({ node: trash, depth: 1, trashed: true }); add(MEMO_TRASH_ID, true); return result; }, [nodes]);
  const visibleRows = useMemo(() => {
    const term = filterText.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((row) => row.node.id === MEMO_FOLDER_ID || row.node.id === MEMO_TRASH_ID || row.node.name.toLowerCase().includes(term));
  }, [rows, filterText]);
  const selection = useTreeEditSelection(visibleRows.map((row) => ({ key: row.node.id })), MEMO_FOLDER_ID, filterText);
  const selectedNode = visibleRows[selection.selected]?.node ?? null;
  const createMemo = async () => { const created = await invoke<FavoriteNode[]>("add_memo", { name: name.trim() || "無題のメモ", content: "", parentId: MEMO_FOLDER_ID }); setCreating(null); setName(""); await reload(); const node = created.find((item) => item.type === "memo" && item.name === (name.trim() || "無題のメモ")); if (node) selection.selectByKey(node.id, Date.now() + 1000); };
  const createFolder = async (parentId: string, folderName: string): Promise<CreateFolderResult> => { try { const created = await invoke<FavoriteNode[]>("add_memo_folder", { name: folderName, parentId }); const node = created.find((item) => item.type === "folder" && item.name === folderName); await reload(); return node ? { folder: { id: node.id, label: node.name }, error: null } : { folder: null, error: "フォルダの作成に失敗しました" }; } catch (error) { return { folder: null, error: String(error) }; } };
  const rename = async (newName: string) => { if (!selectedNode || [MEMO_FOLDER_ID, MEMO_TRASH_ID].includes(selectedNode.id)) return "名前を変更できません"; try { await invoke("rename_favorite_node", { id: selectedNode.id, newName }); setRenaming(null); reload(); return null; } catch (error) { return String(error); } };
  const remove = async () => { if (!selectedNode || [MEMO_FOLDER_ID, MEMO_TRASH_ID].includes(selectedNode.id)) return; await invoke("delete_memo_node", { id: selectedNode.id }); selection.resetToTop(); reload(); };
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement) return;
      if (event.key === "Escape") { event.preventDefault(); onClose(); return; }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); selection.moveSelection(event.key === "ArrowDown" ? 1 : -1); return; }
      if (event.key === "F2" && selectedNode && ![MEMO_FOLDER_ID, MEMO_TRASH_ID].includes(selectedNode.id)) { event.preventDefault(); setRenaming(selectedNode.id); setName(selectedNode.name); return; }
      if (event.key === "Delete") { event.preventDefault(); remove().catch(console.error); return; }
      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "n") { event.preventDefault(); setCreating("folder"); setName(""); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, selectedNode, selection, remove]);
  const moveTo = async (target: FavoriteNode, position: "before" | "after" | "into") => {
    if (!draggingId || draggingId === target.id) return;
    const parentId = position === "into" && target.type === "folder" ? target.id : target.parentId;
    const siblings = nodes.filter((node) => node.parentId === parentId && node.id !== draggingId).sort((a, b) => a.order - b.order);
    const targetIndex = siblings.findIndex((node) => node.id === target.id);
    const index = position === "into" ? siblings.length : Math.max(0, targetIndex + (position === "after" ? 1 : 0));
    try { await invoke("move_memo_node_to", { id: draggingId, newParentId: parentId, targetIndex: index }); await reload(); selection.selectByKey(draggingId, Date.now() + 1000); } catch (error) { console.error(error); } finally { setDraggingId(null); setDropTarget(null); }
  };
  return <div className="flex h-screen flex-col overflow-hidden rounded-2xl bg-white/90">
    <header data-tauri-drag-region="deep" className="flex items-center gap-3 border-b border-gray-200/60 px-4 py-3"><Tooltip label="戻る"><button type="button" onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600">←</button></Tooltip><svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m21 21-6-6m2-5a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z" /></svg><input autoFocus value={filterText} onChange={(event) => setFilterText(event.target.value)} placeholder="メモを絞り込み..." className="flex-1 bg-transparent text-lg text-gray-800 outline-none"/><div className="flex items-center gap-2"><IconSlot interactive selected={false} tooltip="フォルダを作成" onClick={() => { setCreating("folder"); setName(""); }}><CreateFolderIcon className="h-4 w-4" /></IconSlot><IconSlot interactive selected={false} tooltip="メモを作成" onClick={() => { setCreating("memo"); setName(""); }}><FileIcon className="h-4 w-4" /></IconSlot></div></header>
    <div className="flex-1 overflow-y-auto">{creating === "folder" && <CreateFolderInlineRow depth={0} targetParentId={MEMO_FOLDER_ID} onCreateFolder={createFolder} onFolderCreated={(id) => { setCreating(null); selection.selectByKey(id, Date.now() + 1000); }} onCancel={() => setCreating(null)} />}{creating === "memo" && <form className="flex gap-2 border-b p-2" onSubmit={(e) => { e.preventDefault(); createMemo().catch(console.error); }}><input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="メモ名" className="flex-1 rounded border px-2 py-1 text-sm"/><button className="text-sm text-blue-600">作成</button><button type="button" onClick={() => setCreating(null)} className="text-sm">取消</button></form>}{visibleRows.map(({ node, depth, trashed }, index) => { const position = dropTarget?.id === node.id ? dropTarget.position : null; const actionable = ![MEMO_FOLDER_ID, MEMO_TRASH_ID].includes(node.id); return <div key={node.id} draggable={actionable} onDragStart={() => setDraggingId(node.id)} onDragEnd={() => { setDraggingId(null); setDropTarget(null); }} onDragOver={(event) => { event.preventDefault(); const rect = event.currentTarget.getBoundingClientRect(); const ratio = (event.clientY - rect.top) / rect.height; setDropTarget({ id: node.id, position: node.type === "folder" && ratio > .25 && ratio < .75 ? "into" : ratio < .5 ? "before" : "after" }); }} onDrop={(event) => { event.preventDefault(); moveTo(node, position ?? "after"); }} onDoubleClick={() => { if (actionable) { setRenaming(node.id); setName(node.name); } }} onClick={() => selection.selectByKey(node.id)} className={`flex w-full items-center gap-2 px-4 py-2 text-left text-sm ${position === "before" ? "border-t-2 border-blue-500" : position === "after" ? "border-b-2 border-blue-500" : position === "into" ? "ring-2 ring-inset ring-amber-400" : ""} ${selection.selected === index ? "bg-blue-500 text-white" : trashed ? "text-gray-400 hover:bg-gray-100" : "text-gray-700 hover:bg-gray-100"} ${draggingId === node.id ? "opacity-50" : ""}`} style={{ paddingLeft: 16 + depth * 20 }}><Tooltip label="ドラッグして並び替え" className="w-4"><span className="cursor-grab select-none text-xs">⋮⋮</span></Tooltip>{node.type === "folder" ? <svg className="h-4 w-4 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24"><path d={FOLDER_ICON_PATH} /></svg> : <FileIcon className="h-4 w-4 flex-shrink-0" />}{renaming === node.id ? <RenameInput initialName={node.name} className="text-xs" onConfirm={rename} onCancel={() => setRenaming(null)} /> : <span className="flex-1 truncate">{node.name}</span>}{actionable && selection.selected === index && <span className="flex gap-1" onClick={(event) => event.stopPropagation()}>{node.type === "memo" && <Tooltip label="本文を編集"><button type="button" onClick={() => onEdit(node.id)} className="p-1"><svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m16.862 4.487 2.651 2.651M6 18l3.75-.75L19.513 7.487a1.875 1.875 0 0 0-2.651-2.651L7.1 14.6 6 18Z" /></svg></button></Tooltip>}<Tooltip label="名前を変更"><button type="button" onClick={() => { setRenaming(node.id); setName(node.name); }} className="p-1"><svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m16.862 4.487 2.651 2.651M6 18l3.75-.75L19.513 7.487a1.875 1.875 0 0 0-2.651-2.651L7.1 14.6 6 18Z" /></svg></button></Tooltip><Tooltip label="削除"><button type="button" onClick={() => remove().catch(console.error)} className="p-1"><svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 7h12m-9 0V5h6v2m-7 0 1 13h6l1-13" /></svg></button></Tooltip></span>}</div>; })}</div>
    <FooterBar version={version}><KeyHint keys="↑↓" label="選択" /><KeyHint keys="F2" label="リネーム" /><KeyHint keys="Delete" label="削除" /><KeyHint keys="Esc" label="戻る" /></FooterBar>
  </div>;
}
