import { invoke } from "@tauri-apps/api/core";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CreateFolderResult, FavoriteNode, MEMO_FOLDER_ID, MEMO_TRASH_ID } from "../types";
import { groupNodesByParent, walkGroupedTree } from "../lib/nodeTree";
import { useTreeEditSelection } from "../hooks/useTreeEditSelection";
import { Tooltip } from "./Tooltip";
import { FooterBar } from "./FooterBar";
import { KeyHint } from "./KeyHint";
import { IconSlot } from "./IconSlot";
import { CreateFolderIcon, FileIcon, FolderChevron, FOLDER_ICON_PATH, TRASH_ICON_PATH } from "./FavoriteTreeVisuals";
import { CreateFolderInlineRow, RenameInput } from "./FavoriteEditTree";
import { ManageViewIcon } from "./SearchBox";

export function MemoManageView({ onClose, onEdit, version }: { onClose: () => void; onEdit: (id: string) => void; version: string }) {
  const [nodes, setNodes] = useState<FavoriteNode[]>([]);
  const [creating, setCreating] = useState<"folder" | "memo" | null>(null);
  const [creatingParentId, setCreatingParentId] = useState(MEMO_FOLDER_ID);
  const [creatingAnchorId, setCreatingAnchorId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [filterText, setFilterText] = useState("");
  const [dropTarget, setDropTarget] = useState<{ id: string; position: "before" | "after" | "into" } | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const filterInputRef = useRef<HTMLInputElement>(null);
  const reload = useCallback(() => invoke<FavoriteNode[]>("get_memo_manage_nodes").then(setNodes).catch(console.error), []);
  useEffect(() => { reload(); }, [reload]);
  const rows = useMemo(() => { const grouped = groupNodesByParent(nodes); const result: Array<{ node: FavoriteNode; depth: number; trashed: boolean }> = [{ node: { id: MEMO_FOLDER_ID, parentId: "", type: "folder", name: "メモ", value: "", order: 0, collapsed: false }, depth: 0, trashed: false }]; const add = (root: string, trashed: boolean) => walkGroupedTree(grouped, root, (node, depth) => { result.push({ node, depth: depth + 1, trashed }); return filterText ? undefined : { skipChildren: node.type === "folder" && node.collapsed }; }); add(MEMO_FOLDER_ID, false); const trash = nodes.find((node) => node.id === MEMO_TRASH_ID); if (trash) result.push({ node: trash, depth: 1, trashed: true }); if (trash && (filterText || !trash.collapsed)) add(MEMO_TRASH_ID, true); return result; }, [nodes, filterText]);
  const visibleRows = useMemo(() => {
    const term = filterText.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((row) => row.node.id === MEMO_FOLDER_ID || row.node.id === MEMO_TRASH_ID || row.node.name.toLowerCase().includes(term));
  }, [rows, filterText]);
  const selection = useTreeEditSelection(visibleRows.map((row) => ({ key: row.node.id })), MEMO_FOLDER_ID, filterText);
  const selectedNode = visibleRows[selection.selected]?.node ?? null;
  const createMemo = async () => { const memoName = name.trim() || "無題のメモ"; const created = await invoke<FavoriteNode[]>("add_memo", { name: memoName, content: "", parentId: creatingParentId }); setCreating(null); setCreatingAnchorId(null); setName(""); await reload(); const node = created.find((item) => item.type === "memo" && item.name === memoName && item.parentId === creatingParentId); if (node) selection.selectByKey(node.id, Date.now() + 1000); };
  const createFolder = async (parentId: string, folderName: string): Promise<CreateFolderResult> => { try { const created = await invoke<FavoriteNode[]>("add_memo_folder", { name: folderName, parentId }); const node = created.find((item) => item.type === "folder" && item.name === folderName); await reload(); return node ? { folder: { id: node.id, label: node.name }, error: null } : { folder: null, error: "フォルダの作成に失敗しました" }; } catch (error) { return { folder: null, error: String(error) }; } };
  const rename = async (newName: string) => { if (!selectedNode || [MEMO_FOLDER_ID, MEMO_TRASH_ID].includes(selectedNode.id)) return "名前を変更できません"; try { await invoke("rename_favorite_node", { id: selectedNode.id, newName }); setRenaming(null); reload(); return null; } catch (error) { return String(error); } };
  const remove = async () => { if (!selectedNode || [MEMO_FOLDER_ID, MEMO_TRASH_ID].includes(selectedNode.id)) return; await invoke("delete_memo_node", { id: selectedNode.id }); selection.resetToTop(); reload(); };
  const toggleFolder = useCallback(async (node: FavoriteNode) => {
    await invoke("set_favorite_folder_collapsed", { id: node.id, collapsed: !node.collapsed });
    await reload();
  }, [reload]);
  const startCreate = useCallback((kind: "folder" | "memo") => {
    if (!selectedNode || selectedNode.id === MEMO_TRASH_ID) return;
    setCreatingParentId(selectedNode.type === "folder" ? selectedNode.id : selectedNode.parentId);
    setCreatingAnchorId(selectedNode.id);
    setCreating(kind);
    setName("");
  }, [selectedNode]);
  const moveSelectedWithinParent = useCallback(async (direction: 1 | -1) => {
    if (!selectedNode || [MEMO_FOLDER_ID, MEMO_TRASH_ID].includes(selectedNode.id) || filterText) return;
    const siblings = nodes.filter((node) => node.parentId === selectedNode.parentId).sort((a, b) => a.order - b.order);
    const index = siblings.findIndex((node) => node.id === selectedNode.id);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= siblings.length) return;
    await invoke("move_memo_node_to", { id: selectedNode.id, newParentId: selectedNode.parentId, targetIndex: nextIndex });
    await reload();
    selection.selectByKey(selectedNode.id, Date.now() + 1000);
  }, [filterText, nodes, reload, selectedNode, selection]);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement && event.target !== filterInputRef.current) return;
      if (event.key === "Escape") { event.preventDefault(); onClose(); return; }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); if (event.ctrlKey && event.shiftKey) moveSelectedWithinParent(event.key === "ArrowDown" ? 1 : -1).catch(console.error); else selection.moveSelection(event.key === "ArrowDown" ? 1 : -1); return; }
      if (event.key === "Enter" && selectedNode?.type === "folder" && selectedNode.id !== MEMO_FOLDER_ID) { event.preventDefault(); toggleFolder(selectedNode).catch(console.error); return; }
      if (event.key === "F2" && selectedNode && ![MEMO_FOLDER_ID, MEMO_TRASH_ID].includes(selectedNode.id)) { event.preventDefault(); setRenaming(selectedNode.id); setName(selectedNode.name); return; }
      if (event.key === "Delete") { event.preventDefault(); remove().catch(console.error); return; }
      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "n") { event.preventDefault(); startCreate("folder"); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [moveSelectedWithinParent, onClose, remove, selectedNode, selection, startCreate, toggleFolder]);
  const moveTo = async (target: FavoriteNode, position: "before" | "after" | "into") => {
    if (!draggingId || draggingId === target.id) return;
    const parentId = position === "into" && target.type === "folder" ? target.id : target.parentId;
    const siblings = nodes.filter((node) => node.parentId === parentId && node.id !== draggingId).sort((a, b) => a.order - b.order);
    const targetIndex = siblings.findIndex((node) => node.id === target.id);
    const index = position === "into" ? siblings.length : Math.max(0, targetIndex + (position === "after" ? 1 : 0));
    try { await invoke("move_memo_node_to", { id: draggingId, newParentId: parentId, targetIndex: index }); await reload(); selection.selectByKey(draggingId, Date.now() + 1000); } catch (error) { console.error(error); } finally { setDraggingId(null); setDropTarget(null); }
  };
  return <div className="relative flex h-screen flex-col overflow-hidden rounded-2xl border border-white/20 bg-white/90 shadow-2xl backdrop-blur-xl">
    <header data-tauri-drag-region="deep" className="flex items-center border-b border-gray-200/60 px-4 py-3">
      <Tooltip label="戻る" side="right" className="mr-2 flex-shrink-0"><button type="button" onClick={onClose} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"><svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg></button></Tooltip>
      <svg className="mr-3 h-5 w-5 flex-shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
      <input ref={filterInputRef} autoFocus value={filterText} onChange={(event) => setFilterText(event.target.value)} placeholder="メモを絞り込み..." className="flex-1 bg-transparent text-lg text-gray-800 outline-none placeholder-gray-400" />
    </header>
    <div className="flex-1 overflow-y-auto">
      {visibleRows.map(({ node, depth }, index) => {
        const position = dropTarget?.id === node.id ? dropTarget.position : null;
        const reserved = [MEMO_FOLDER_ID, MEMO_TRASH_ID].includes(node.id);
        const selected = selection.selected === index;
        const filtering = filterText.length > 0;
        return <Fragment key={node.id}><div draggable={!reserved && !filtering} onDragStart={() => setDraggingId(node.id)} onDragEnd={() => { setDraggingId(null); setDropTarget(null); }} onDragOver={(event) => { if (filtering || !draggingId || draggingId === node.id) return; event.preventDefault(); const rect = event.currentTarget.getBoundingClientRect(); const ratio = (event.clientY - rect.top) / rect.height; setDropTarget({ id: node.id, position: reserved ? "into" : node.type === "folder" && ratio > .25 && ratio < .75 ? "into" : ratio < .5 ? "before" : "after" }); }} onDrop={(event) => { event.preventDefault(); moveTo(node, position ?? "into"); }} onDoubleClick={() => { if (!reserved) setRenaming(node.id); }} onMouseEnter={() => selection.selectByKey(node.id)} onClick={() => node.type === "folder" && node.id !== MEMO_FOLDER_ID ? toggleFolder(node).catch(console.error) : selection.selectByKey(node.id)} className={`flex w-full items-center py-2 pr-4 text-left text-xs transition-colors ${position === "before" ? "border-t-2 border-blue-500" : position === "after" ? "border-b-2 border-blue-500" : position === "into" ? "ring-2 ring-inset ring-amber-400" : ""} ${selected ? "bg-blue-500 text-white" : "text-gray-500 hover:bg-gray-50"}`} style={{ paddingLeft: `${depth * 1.5 + 1}rem` }}>
          {!reserved && !filtering ? <Tooltip label="ドラッグして並び替え" className="mr-1.5 w-4 flex-shrink-0 justify-center"><span className="cursor-grab select-none font-bold">⋮⋮</span></Tooltip> : <span className="mr-1.5 w-4 flex-shrink-0" />}
          {node.type === "folder" && node.id !== MEMO_FOLDER_ID && <FolderChevron collapsed={node.collapsed} />}
          {node.type === "folder" ? <svg className="ml-1.5 mr-2 h-4 w-4 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24"><path d={FOLDER_ICON_PATH} /></svg> : <FileIcon className="ml-1.5 mr-2 h-4 w-4 flex-shrink-0" />}
          {renaming === node.id ? <RenameInput initialName={node.name} className="text-xs" onConfirm={rename} onCancel={() => setRenaming(null)} /> : <span className="flex-1 truncate font-medium">{node.name}</span>}
          {selected && node.id !== MEMO_TRASH_ID && <div className="ml-2 flex items-center gap-2"><IconSlot interactive selected tooltip="ここにフォルダを作成" onClick={() => startCreate("folder")}><CreateFolderIcon className="h-4 w-4" /></IconSlot><IconSlot interactive selected tooltip="ここにメモを作成" onClick={() => startCreate("memo")}><FileIcon className="h-4 w-4" /></IconSlot>{node.type === "memo" && <IconSlot interactive selected tooltip="本文を編集" onClick={() => onEdit(node.id)}><ManageViewIcon className="h-4 w-4" /></IconSlot>}{!reserved && <IconSlot interactive selected tooltip={node.type === "folder" ? "このフォルダを削除" : "このメモを削除"} onClick={() => remove().catch(console.error)}><svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={TRASH_ICON_PATH} /></svg></IconSlot>}</div>}
        </div>{creatingAnchorId === node.id && creating === "folder" && <CreateFolderInlineRow depth={depth + 1} targetParentId={creatingParentId} onCreateFolder={createFolder} onFolderCreated={(id) => { setCreating(null); setCreatingAnchorId(null); selection.selectByKey(id, Date.now() + 1000); }} onCancel={() => { setCreating(null); setCreatingAnchorId(null); }} />}{creatingAnchorId === node.id && creating === "memo" && <form className="flex items-center gap-2 py-2 pr-4" style={{ paddingLeft: `${(depth + 1) * 1.5 + 1}rem` }} onSubmit={(event) => { event.preventDefault(); createMemo().catch(console.error); }}><FileIcon className="h-4 w-4 flex-shrink-0 text-gray-400" /><input autoFocus value={name} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setCreating(null); setCreatingAnchorId(null); } }} placeholder="新しいメモ名" className="min-w-0 flex-1 rounded border border-gray-300 px-1.5 py-0.5 text-xs outline-none focus:border-blue-400" /></form>}</Fragment>;
      })}
    </div>
    <FooterBar version={version}><KeyHint keys="↑↓" label="選択" /><KeyHint keys="Enter" label="開閉" /><KeyHint keys="Ctrl+Shift+N" label="フォルダ作成" /><KeyHint keys="F2" label="リネーム" /><KeyHint keys="Delete" label="削除" />{!filterText && <KeyHint keys="Ctrl+Shift+↑↓" label="並び替え" />}<KeyHint keys="Esc" label="戻る" /></FooterBar>
  </div>;
}
