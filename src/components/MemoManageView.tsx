import { invoke } from "@tauri-apps/api/core";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CreateFolderResult, FavoriteNode, MEMO_FOLDER_ID, MEMO_TRASH_ID } from "../types";
import { groupNodesByParent, walkGroupedTree } from "../lib/nodeTree";
import { useTreeEditSelection } from "../hooks/useTreeEditSelection";
import { useScrollSelectedIntoView } from "../hooks/useScrollSelectedIntoView";
import { isDescendantOfFolder } from "../hooks/useSearch";
import { Tooltip } from "./Tooltip";
import { IconSlot } from "./IconSlot";
import { CreateFolderIcon, FileIcon, FolderChevron, FOLDER_ICON_PATH, INDENT_BASE_REM, INDENT_STEP_REM, TRASH_ICON_PATH } from "./FavoriteTreeVisuals";
import { CreateFolderInlineRow } from "./FavoriteEditTree";
import { MemoNodeRenameInput } from "./MemoNodeRenameInput";
import { ManageViewIcon } from "./SearchBox";
import { MemoIcon } from "./MemoIcon";
import { MemoManageFooter, type MemoManageSelectedKind } from "./MemoManageFooter";
import {
  MANAGE_TREE_ROW_LABEL,
  manageTreeRowClass,
  type ManageTreeRowVariant,
} from "../ui/sharedStyles";

type ManageRow = {
  node: FavoriteNode;
  depth: number;
  trashed: boolean;
  kind: MemoManageSelectedKind;
};
type DropPosition = "before" | "after" | "into";
type DragInfo = { id: string; isFolder: boolean };

const CIRCULAR_MOVE_ERROR = "フォルダを自分自身の中に移動することはできません";

function dropPositionFromEvent(event: React.DragEvent<HTMLDivElement>, row: ManageRow): DropPosition {
  if (row.kind === "root" || row.kind === "trash") return "into";
  const rect = event.currentTarget.getBoundingClientRect();
  const ratio = (event.clientY - rect.top) / rect.height;
  if (row.node.type === "folder" && ratio > 0.25 && ratio < 0.75) return "into";
  return ratio < 0.5 ? "before" : "after";
}

function destinationParent(row: ManageRow, position: DropPosition): string {
  if (row.kind === "root") return MEMO_FOLDER_ID;
  if (row.kind === "trash") return MEMO_TRASH_ID;
  return position === "into" && row.node.type === "folder" ? row.node.id : row.node.parentId;
}

function isValidDropTarget(
  nodes: FavoriteNode[],
  dragged: DragInfo,
  row: ManageRow,
  position: DropPosition
): boolean {
  if (dragged.id === row.node.id) return false;
  if (!dragged.isFolder) return true;
  const parentId = destinationParent(row, position);
  return parentId !== dragged.id && !isDescendantOfFolder(nodes, parentId, dragged.id);
}

function DragHandle({ selected }: { selected: boolean }) {
  return (
    <Tooltip label="ドラッグして並び替え" className="mr-1.5 w-4 flex-shrink-0 justify-center">
      <span className={`cursor-grab select-none font-bold ${selected ? "text-white" : "text-gray-400"}`}>⋮⋮</span>
    </Tooltip>
  );
}

export function MemoManageView({ onClose, onEdit, version }: { onClose: () => void; onEdit: (id: string) => void; version: string }) {
  const [nodes, setNodes] = useState<FavoriteNode[]>([]);
  const [creating, setCreating] = useState<"folder" | "memo" | null>(null);
  const [creatingParentId, setCreatingParentId] = useState(MEMO_FOLDER_ID);
  const [creatingAnchorId, setCreatingAnchorId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [filterText, setFilterText] = useState("");
  const [dropTarget, setDropTarget] = useState<{ id: string; position: DropPosition } | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);
  const dragInfoRef = useRef<DragInfo | null>(null);
  const moveErrorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const filterInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const reload = useCallback(async () => {
    const next = await invoke<FavoriteNode[]>("get_memo_manage_nodes");
    setNodes(next);
  }, []);
  useEffect(() => { reload().catch(console.error); }, [reload]);
  useEffect(() => {
    if (!creating && !renaming) filterInputRef.current?.focus();
  }, [creating, renaming]);
  useEffect(() => () => {
    if (moveErrorTimerRef.current) clearTimeout(moveErrorTimerRef.current);
  }, []);

  const rows = useMemo<ManageRow[]>(() => {
    const grouped = groupNodesByParent(nodes);
    const rootNode: FavoriteNode = { id: MEMO_FOLDER_ID, parentId: "", type: "folder", name: "メモ", value: "", order: 0, collapsed: false };
    const result: ManageRow[] = [{ node: rootNode, depth: 0, trashed: false, kind: "root" }];
    walkGroupedTree(grouped, MEMO_FOLDER_ID, (node, depth) => {
      result.push({ node, depth, trashed: false, kind: node.type === "folder" ? "folder" : "memo" });
      return filterText ? undefined : { skipChildren: node.type === "folder" && node.collapsed };
    });
    const trash = nodes.find((node) => node.id === MEMO_TRASH_ID);
    if (trash) {
      result.push({ node: trash, depth: 0, trashed: true, kind: "trash" });
      if (filterText || !trash.collapsed) {
        walkGroupedTree(grouped, MEMO_TRASH_ID, (node, depth) => {
          result.push({ node, depth: depth + 1, trashed: true, kind: node.type === "folder" ? "folder" : "memo" });
          return filterText ? undefined : { skipChildren: node.type === "folder" && node.collapsed };
        });
      }
    }
    return result;
  }, [nodes, filterText]);

  const visibleRows = useMemo(() => {
    const term = filterText.trim().toLowerCase();
    if (!term) return rows;
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const included = new Set<string>([MEMO_FOLDER_ID, MEMO_TRASH_ID]);
    for (const node of nodes) {
      if (!node.name.toLowerCase().includes(term)) continue;
      included.add(node.id);
      let parentId = node.parentId;
      while (parentId) {
        included.add(parentId);
        const parent = byId.get(parentId);
        if (!parent) break;
        parentId = parent.parentId;
      }
    }
    return rows.filter((row) => included.has(row.node.id));
  }, [filterText, nodes, rows]);
  const selection = useTreeEditSelection(visibleRows.map((row) => ({ key: row.node.id })), MEMO_FOLDER_ID, filterText);
  useScrollSelectedIntoView(listRef, selection.selected);
  const selectedRow = visibleRows[selection.selected] ?? null;
  const selectedNode = selectedRow?.node ?? null;
  const filtering = filterText.length > 0;

  const showMoveError = useCallback((message: string) => {
    if (moveErrorTimerRef.current) clearTimeout(moveErrorTimerRef.current);
    setMoveError(message);
    moveErrorTimerRef.current = setTimeout(() => setMoveError(null), 4000);
  }, []);

  const moveNode = useCallback(async (id: string, newParentId: string, targetIndex: number) => {
    try {
      await invoke("move_memo_node_to", { id, newParentId, targetIndex });
      await reload();
      selection.selectByKey(id, Date.now() + 1000);
      return null;
    } catch (error) {
      const message = String(error);
      showMoveError(message);
      return message;
    }
  }, [reload, selection, showMoveError]);

  const createMemo = async () => {
    const memoName = name.trim() || "無題のメモ";
    const existingIds = new Set(nodes.map((node) => node.id));
    const created = await invoke<FavoriteNode[]>("add_memo", { name: memoName, content: "", parentId: creatingParentId });
    setCreating(null);
    setCreatingAnchorId(null);
    setName("");
    await reload();
    const node = created.find((item) => item.type === "memo" && !existingIds.has(item.id));
    if (node) selection.selectByKey(node.id, Date.now() + 1000);
  };
  const createFolder = async (parentId: string, folderName: string): Promise<CreateFolderResult> => {
    try {
      const created = await invoke<FavoriteNode[]>("add_memo_folder", { name: folderName, parentId });
      const node = created.find((item) => item.type === "folder" && item.name === folderName && item.parentId === parentId);
      await reload();
      return node ? { folder: { id: node.id, label: node.name }, error: null } : { folder: null, error: "フォルダの作成に失敗しました" };
    } catch (error) {
      return { folder: null, error: String(error) };
    }
  };
  const remove = useCallback(async () => {
    if (!selectedNode || [MEMO_FOLDER_ID, MEMO_TRASH_ID].includes(selectedNode.id)) return;
    try {
      await invoke("delete_memo_node", { id: selectedNode.id });
      selection.resetToTop();
      await reload();
    } catch (error) {
      showMoveError(String(error));
    }
  }, [reload, selectedNode, selection, showMoveError]);
  const toggleFolder = useCallback(async (node: FavoriteNode) => {
    if (filterText) return;
    await invoke("set_favorite_folder_collapsed", { id: node.id, collapsed: !node.collapsed });
    await reload();
  }, [filterText, reload]);
  const startCreate = useCallback((kind: "folder" | "memo") => {
    if (!selectedRow || selectedRow.trashed || !selectedNode || selectedNode.id === MEMO_TRASH_ID) return;
    setCreatingParentId(selectedNode.type === "folder" ? selectedNode.id : selectedNode.parentId);
    setCreatingAnchorId(selectedNode.id);
    setCreating(kind);
    setName("");
  }, [selectedNode, selectedRow]);

  const moveSelectedWithinParent = useCallback(async (direction: 1 | -1) => {
    if (!selectedRow || selectedRow.trashed || !selectedNode || [MEMO_FOLDER_ID, MEMO_TRASH_ID].includes(selectedNode.id) || filtering) return;
    const siblings = nodes.filter((node) => node.parentId === selectedNode.parentId).sort((a, b) => a.order - b.order);
    const index = siblings.findIndex((node) => node.id === selectedNode.id);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= siblings.length) return;
    const others = siblings.filter((node) => node.id !== selectedNode.id);
    const targetSibling = siblings[nextIndex];
    const targetPosition = others.findIndex((node) => node.id === targetSibling.id);
    const targetIndex = direction === -1 ? targetPosition : targetPosition + 1;
    await moveNode(selectedNode.id, selectedNode.parentId, targetIndex);
  }, [filtering, moveNode, nodes, selectedNode, selectedRow]);

  const indentSelected = useCallback(async () => {
    if (!selectedRow || selectedRow.trashed || !selectedNode || selectedRow.kind === "root" || selectedRow.kind === "trash" || filtering) return;
    const siblings = nodes.filter((node) => node.parentId === selectedNode.parentId).sort((a, b) => a.order - b.order);
    const index = siblings.findIndex((node) => node.id === selectedNode.id);
    if (index <= 0) return;
    const previous = siblings[index - 1];
    if (previous.type !== "folder") return;
    const childCount = nodes.filter((node) => node.parentId === previous.id && node.id !== selectedNode.id).length;
    await moveNode(selectedNode.id, previous.id, childCount);
  }, [filtering, moveNode, nodes, selectedNode, selectedRow]);

  const outdentSelected = useCallback(async () => {
    if (!selectedRow || !selectedNode || selectedRow.kind === "root" || selectedRow.kind === "trash" || filtering) return;
    if (selectedRow.trashed) {
      const rootCount = nodes.filter((node) => node.parentId === MEMO_FOLDER_ID && node.id !== selectedNode.id).length;
      await moveNode(selectedNode.id, MEMO_FOLDER_ID, rootCount);
      return;
    }
    const parentId = selectedNode.parentId;
    if (parentId === MEMO_FOLDER_ID) return;
    const parent = nodes.find((node) => node.id === parentId && node.type === "folder");
    if (!parent) return;
    const siblings = nodes.filter((node) => node.parentId === parent.parentId && node.id !== selectedNode.id).sort((a, b) => a.order - b.order);
    const parentIndex = siblings.findIndex((node) => node.id === parent.id);
    await moveNode(selectedNode.id, parent.parentId, parentIndex < 0 ? siblings.length : parentIndex + 1);
  }, [filtering, moveNode, nodes, selectedNode, selectedRow]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement && event.target !== filterInputRef.current) return;
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        if (event.ctrlKey && event.shiftKey) moveSelectedWithinParent(event.key === "ArrowDown" ? 1 : -1).catch(console.error);
        else selection.moveSelection(event.key === "ArrowDown" ? 1 : -1);
        return;
      }
      if (event.ctrlKey && event.shiftKey && event.key === "ArrowLeft") { event.preventDefault(); outdentSelected().catch(console.error); return; }
      if (event.ctrlKey && event.shiftKey && event.key === "ArrowRight" && !selectedRow?.trashed) { event.preventDefault(); indentSelected().catch(console.error); return; }
      if (event.key === "Enter" && selectedNode?.type === "folder" && selectedNode.id !== MEMO_FOLDER_ID && !filtering) { event.preventDefault(); toggleFolder(selectedNode).catch(console.error); return; }
      if (event.key === "F2" && selectedRow && !selectedRow.trashed && selectedNode && ![MEMO_FOLDER_ID, MEMO_TRASH_ID].includes(selectedNode.id)) { event.preventDefault(); setRenaming(selectedNode.id); return; }
      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "n") { event.preventDefault(); startCreate("folder"); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [filtering, indentSelected, moveSelectedWithinParent, outdentSelected, selectedNode, selectedRow, selection, startCreate, toggleFolder]);

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>, row: ManageRow) => {
    if (filtering) return;
    event.preventDefault();
    const dragged = dragInfoRef.current;
    if (!dragged) { event.dataTransfer.dropEffect = "none"; setDropTarget(null); return; }
    const position = dropPositionFromEvent(event, row);
    if (!isValidDropTarget(nodes, dragged, row, position)) {
      event.dataTransfer.dropEffect = "none";
      setDropTarget(null);
      return;
    }
    event.dataTransfer.dropEffect = "move";
    setDropTarget({ id: row.node.id, position });
  };
  const handleDrop = async (event: React.DragEvent<HTMLDivElement>, row: ManageRow) => {
    event.preventDefault();
    const dragged = dragInfoRef.current;
    dragInfoRef.current = null;
    setDropTarget(null);
    if (!dragged || dragged.id === row.node.id) return;
    const position = dropPositionFromEvent(event, row);
    if (!isValidDropTarget(nodes, dragged, row, position)) { showMoveError(CIRCULAR_MOVE_ERROR); return; }
    const parentId = destinationParent(row, position);
    const siblings = nodes.filter((node) => node.parentId === parentId && node.id !== dragged.id).sort((a, b) => a.order - b.order);
    const targetPosition = siblings.findIndex((node) => node.id === row.node.id);
    const targetIndex = position === "into" ? siblings.length : Math.max(0, targetPosition + (position === "after" ? 1 : 0));
    await moveNode(dragged.id, parentId, targetIndex);
  };

  const renderActionIcons = (row: ManageRow, selected: boolean) => {
    if (!selected || row.kind === "trash") return null;
    if (row.kind === "root") {
      return <div className="ml-2 flex items-center gap-2"><IconSlot interactive selected tooltip="ここにフォルダを作成" onClick={() => startCreate("folder")}><CreateFolderIcon className="h-4 w-4" /></IconSlot><IconSlot interactive selected tooltip="ここにメモを作成" onClick={() => startCreate("memo")}><MemoIcon /></IconSlot></div>;
    }
    if (row.trashed) {
      return <div className="ml-2 flex items-center gap-2"><IconSlot interactive selected tooltip={row.node.type === "folder" ? "このフォルダを完全に削除" : "このメモを完全に削除"} onClick={() => remove().catch(console.error)}><svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={TRASH_ICON_PATH} /></svg></IconSlot></div>;
    }
    return <div className="ml-2 flex items-center gap-2"><IconSlot interactive selected tooltip="ここにフォルダを作成" onClick={() => startCreate("folder")}><CreateFolderIcon className="h-4 w-4" /></IconSlot><IconSlot interactive selected tooltip="ここにメモを作成" onClick={() => startCreate("memo")}><MemoIcon /></IconSlot>{row.node.type === "memo" && <IconSlot interactive selected tooltip="本文を編集" onClick={() => onEdit(row.node.id)}><ManageViewIcon className="h-4 w-4" /></IconSlot>}<IconSlot interactive selected tooltip={row.node.type === "folder" ? "このフォルダをゴミ箱へ移動" : "このメモをゴミ箱へ移動"} onClick={() => remove().catch(console.error)}><svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={TRASH_ICON_PATH} /></svg></IconSlot></div>;
  };

  return (
    <div className="relative flex h-screen flex-col overflow-hidden rounded-2xl border border-white/20 bg-white/90 shadow-2xl backdrop-blur-xl">
      <header data-tauri-drag-region="deep" className="flex items-center border-b border-gray-200/60 px-4 py-3">
        <Tooltip label="戻る" side="right" className="mr-2 flex-shrink-0"><button type="button" onClick={onClose} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"><svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg></button></Tooltip>
        <svg className="mr-3 h-5 w-5 flex-shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
        <input ref={filterInputRef} type="text" autoFocus autoComplete="off" spellCheck={false} value={filterText} onChange={(event) => setFilterText(event.target.value)} placeholder="メモを絞り込み..." className="flex-1 bg-transparent text-lg text-gray-800 outline-none placeholder-gray-400" />
      </header>
      {moveError && <div className="flex-shrink-0 border-b border-red-200 bg-red-50 px-4 py-2 text-xs text-red-600">{moveError}</div>}
      <div ref={listRef} className="flex-1 overflow-y-auto">
        {visibleRows.map((row, index) => {
          const { node, depth } = row;
          const position = dropTarget?.id === node.id ? dropTarget.position : null;
          const selected = selection.selected === index;
          const reserved = row.kind === "root" || row.kind === "trash";
          const renamingThis = renaming === node.id;
          const dropClass = position === "before" ? "border-t-2 border-blue-500" : position === "after" ? "border-b-2 border-blue-500" : position === "into" ? "ring-2 ring-inset ring-amber-400" : "";
          const rowVariant: ManageTreeRowVariant =
            row.kind === "root" || row.kind === "trash"
              ? "fixed"
              : node.type === "folder"
                ? "folder"
                : "item";
          const rowClass = `${manageTreeRowClass(rowVariant, { selected, muted: row.trashed })} ${dropClass}`;
          const commonEvents = {
            onMouseEnter: () => selection.selectByKey(node.id),
            onDragOver: (event: React.DragEvent<HTMLDivElement>) => handleDragOver(event, row),
            onDragLeave: () => setDropTarget((current) => current?.id === node.id ? null : current),
            onDrop: (event: React.DragEvent<HTMLDivElement>) => { handleDrop(event, row).catch(console.error); },
          };
          if (row.kind === "root") {
            return <Fragment key={node.id}><div role="button" data-index={index} className={rowClass} style={{ paddingLeft: `${INDENT_BASE_REM}rem` }} {...commonEvents}><svg className="mr-2 h-4 w-4 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24"><path d={FOLDER_ICON_PATH} /></svg><span className={MANAGE_TREE_ROW_LABEL.fixed}>メモ</span>{renderActionIcons(row, selected)}</div>{creatingAnchorId === node.id && creating === "folder" && <CreateFolderInlineRow depth={0} targetParentId={creatingParentId} onCreateFolder={createFolder} onFolderCreated={(id) => { setCreating(null); setCreatingAnchorId(null); selection.selectByKey(id, Date.now() + 1000); }} onCancel={() => { setCreating(null); setCreatingAnchorId(null); }} />}{creatingAnchorId === node.id && creating === "memo" && <MemoCreateRow depth={0} name={name} onNameChange={setName} onCreate={createMemo} onCancel={() => { setCreating(null); setCreatingAnchorId(null); }} />}</Fragment>;
          }
          return <Fragment key={node.id}><div role="button" data-index={index} draggable={!reserved && !renamingThis && !filtering} onDragStart={(event) => { dragInfoRef.current = { id: node.id, isFolder: node.type === "folder" }; event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", node.id); }} onDragEnd={() => { dragInfoRef.current = null; setDropTarget(null); }} onDoubleClick={() => { if (!row.trashed && !reserved) setRenaming(node.id); }} onClick={() => { selection.selectByKey(node.id); if (node.type === "folder" && !filtering) toggleFolder(node).catch(console.error); }} className={rowClass} style={{ paddingLeft: `${depth * INDENT_STEP_REM + INDENT_BASE_REM}rem` }} {...commonEvents}>
            {!reserved && !filtering ? <DragHandle selected={selected} /> : reserved ? null : <span className="mr-1.5 w-4 flex-shrink-0" />}
            {node.type === "folder" && <FolderChevron collapsed={node.collapsed} />}
            {row.kind === "trash" ? <svg className="ml-1.5 mr-2 h-4 w-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={TRASH_ICON_PATH} /></svg> : node.type === "folder" ? <svg className="ml-1.5 mr-2 h-4 w-4 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24"><path d={FOLDER_ICON_PATH} /></svg> : <FileIcon className="ml-1.5 mr-2 h-4 w-4 flex-shrink-0" />}
            {renamingThis ? <MemoNodeRenameInput nodeId={node.id} initialName={node.name} className={rowVariant === "item" ? "text-ui-body" : "text-ui-meta"} onRenamed={async () => { setRenaming(null); await reload(); }} onCancel={() => setRenaming(null)} /> : <span className={`${rowVariant === "item" ? "flex-1 " : ""}${MANAGE_TREE_ROW_LABEL[rowVariant]}`}>{node.name}</span>}
            {!renamingThis && renderActionIcons(row, selected)}
          </div>{creatingAnchorId === node.id && creating === "folder" && <CreateFolderInlineRow depth={node.type === "folder" ? depth + 1 : depth} targetParentId={creatingParentId} onCreateFolder={createFolder} onFolderCreated={(id) => { setCreating(null); setCreatingAnchorId(null); selection.selectByKey(id, Date.now() + 1000); }} onCancel={() => { setCreating(null); setCreatingAnchorId(null); }} />}{creatingAnchorId === node.id && creating === "memo" && <MemoCreateRow depth={node.type === "folder" ? depth + 1 : depth} name={name} onNameChange={setName} onCreate={createMemo} onCancel={() => { setCreating(null); setCreatingAnchorId(null); }} />}</Fragment>;
        })}
      </div>
      <MemoManageFooter selectedKind={selectedRow?.kind ?? null} trashed={selectedRow?.trashed ?? false} filtering={filtering} version={version} />
    </div>
  );
}

function MemoCreateRow({ depth, name, onNameChange, onCreate, onCancel }: { depth: number; name: string; onNameChange: (name: string) => void; onCreate: () => Promise<void>; onCancel: () => void }) {
  return (
    <form className="flex items-center gap-2 py-ui-row-y pr-ui-row-x" style={{ paddingLeft: `${depth * INDENT_STEP_REM + INDENT_BASE_REM}rem` }} onSubmit={(event) => { event.preventDefault(); onCreate().catch(console.error); }}>
      <MemoIcon className="h-4 w-4 flex-shrink-0 text-gray-400" />
      <input autoFocus value={name} onChange={(event) => onNameChange(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onCancel(); } }} placeholder="新しいメモ名" className="min-w-0 flex-1 rounded border border-gray-300 px-1.5 py-0.5 text-xs outline-none focus:border-blue-400" />
    </form>
  );
}
