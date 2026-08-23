import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CreateFolderResult, FavoriteNode, MEMO_FOLDER_ID, MEMO_TRASH_ID } from "../types";
import { groupNodesByParent, walkGroupedTree } from "../lib/nodeTree";
import { memoNodeDisplayName } from "../lib/memoTree";
import { useTreeEditSelection } from "./useTreeEditSelection";
import { useMemoNotes } from "./useMemoNotes";
import {
  computeTreeMoveTarget,
  dropPositionFromRatio,
  isCircularTreeMove,
  resolveTreeDropParent,
  type TreeDropPosition as DropPosition,
  type TreeDropTarget,
} from "../lib/treeEditUtils";
import type { MemoManageSelectedKind } from "../components/MemoManageFooter";

export type MemoManageRow = {
  node: FavoriteNode;
  depth: number;
  trashed: boolean;
  kind: MemoManageSelectedKind;
};
export type MemoDragInfo = { id: string; isFolder: boolean };

// ヘッダーの「新規フォルダ」「新規メモ」アイコン用の作成アンカー。行に紐付かない
// （常にメモルート直下へ作成する）ため、行の key とは別の固定センチネル値で表す。
export const MEMO_HEADER_CREATE_ANCHOR = "__memo_header__";

const CIRCULAR_MOVE_ERROR = "フォルダを自分自身の中に移動することはできません";

function dropPositionFromEvent(
  event: React.DragEvent<HTMLDivElement>,
  row: MemoManageRow
): DropPosition {
  if (row.kind === "trash") return "into";
  const rect = event.currentTarget.getBoundingClientRect();
  const ratio = (event.clientY - rect.top) / rect.height;
  return dropPositionFromRatio(ratio, row.node.type === "folder");
}

function memoDropTarget(row: MemoManageRow): TreeDropTarget {
  return {
    id: row.node.id,
    parentId: row.node.parentId,
    isFolder: row.node.type === "folder",
    fixedParentId: row.kind === "trash" ? MEMO_TRASH_ID : undefined,
  };
}

function isValidDropTarget(
  nodes: FavoriteNode[],
  dragged: MemoDragInfo,
  row: MemoManageRow,
  position: DropPosition
): boolean {
  if (dragged.id === row.node.id) return false;
  if (!dragged.isFolder) return true;
  const parentId = resolveTreeDropParent(memoDropTarget(row), position);
  return !isCircularTreeMove(nodes, dragged.id, parentId);
}

// issue 0026（メモ・お気に入り画面を管理画面ベースへ統合）の軸A。旧
// MemoManageView.tsx がコンポーネントローカルの useState として持っていたツリー
// 編集state・アクションをこのフックへ引き上げた。理由：統合後の /memo は
// App.tsx 側で view === "settings" のときアンマウントされる（設定画面の描画が
// 早期returnするため）。ローカル useState のままだと、設定往復のたびに絞り込み
// 文字列・選択・作成/リネーム中の状態が失われてしまう（issue 0026 横断整理 C-3）。
// フックとして App.tsx 側に1回だけ持たせることで、設定を閉じて戻ってきても
// このstate自体は消えない（App.tsx はアンマウントされないため）。
//
// 本文（下書き・確定版）の管理は useMemoNotes をそのまま内包する。ツリー側の
// 選択（selection.selected が指すメモID）と useMemoNotes.selectedId の同期は、
// 従来 App.tsx 側にあった useEffect をこのフック内に移設した。
export function useMemoManage(active: boolean) {
  const [nodes, setNodes] = useState<FavoriteNode[]>([]);
  const [creating, setCreating] = useState<"folder" | "memo" | null>(null);
  const [creatingParentId, setCreatingParentId] = useState(MEMO_FOLDER_ID);
  const [creatingAnchorId, setCreatingAnchorId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [filterText, setFilterText] = useState("");
  const [dropTarget, setDropTarget] = useState<{ id: string; position: DropPosition } | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);
  const dragInfoRef = useRef<MemoDragInfo | null>(null);
  const moveErrorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reload = useCallback(async () => {
    const next = await invoke<FavoriteNode[]>("get_memo_manage_nodes");
    setNodes(next);
  }, []);
  // 「表示のたび」に取得し直す（/recent 等の pull型モードと同じ考え方）。設定を
  // 開いて戻ってきた場合も active が再び true になり、最新の状態へ更新する。
  useEffect(() => {
    if (active) reload().catch(console.error);
  }, [active, reload]);
  useEffect(() => () => {
    if (moveErrorTimerRef.current) clearTimeout(moveErrorTimerRef.current);
  }, []);

  // 表示上の固定行「メモ」は置かない（issue 0026 軸A）。ゴミ箱の固定行のみ維持する。
  const rows = useMemo<MemoManageRow[]>(() => {
    const grouped = groupNodesByParent(nodes);
    const result: MemoManageRow[] = [];
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
    const included = new Set<string>([MEMO_TRASH_ID]);
    for (const node of nodes) {
      if (!memoNodeDisplayName(node).toLowerCase().includes(term)) continue;
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

  // 固定行「メモ」を撤去したため、resolveSelected の resetKey は「先頭の実データ行」
  // （無ければ空センチネル）に変える（App.tsx 側の旧 memoSelection と同じ考え方）。
  const resetKey = visibleRows[0]?.node.id ?? "__memo_empty__";
  const selection = useTreeEditSelection(
    visibleRows.map((row) => ({ key: row.node.id })),
    resetKey,
    filterText
  );
  const selectedRow = visibleRows[selection.selected] ?? null;
  const selectedNode = selectedRow?.node ?? null;
  const filtering = filterText.length > 0;

  const showMoveError = useCallback((message: string) => {
    if (moveErrorTimerRef.current) clearTimeout(moveErrorTimerRef.current);
    setMoveError(message);
    moveErrorTimerRef.current = setTimeout(() => setMoveError(null), 4000);
  }, []);

  const moveNode = useCallback(
    async (
      id: string,
      newParentId: string,
      targetIndex: number,
      source: "pointer" | "keyboard" = "pointer"
    ) => {
      try {
        await invoke("move_memo_node_to", { id, newParentId, targetIndex });
        await reload();
        const expiresAt = Date.now() + 1000;
        if (source === "keyboard") selection.selectByKeyboard(id, expiresAt);
        else selection.selectByKey(id, expiresAt);
        return null;
      } catch (error) {
        const message = String(error);
        showMoveError(message);
        return message;
      }
    },
    [reload, selection, showMoveError]
  );

  const createMemo = useCallback(async () => {
    const memoName = name.trim();
    const existingIds = new Set(nodes.map((node) => node.id));
    const created = await invoke<FavoriteNode[]>("add_memo", {
      name: memoName,
      content: memoName,
      parentId: creatingParentId,
    });
    setCreating(null);
    setCreatingAnchorId(null);
    setName("");
    await reload();
    const node = created.find((item) => item.type === "memo" && !existingIds.has(item.id));
    if (node) selection.selectByKey(node.id, Date.now() + 1000);
  }, [creatingParentId, name, nodes, reload, selection]);

  const createFolder = useCallback(
    async (parentId: string, folderName: string): Promise<CreateFolderResult> => {
      try {
        const created = await invoke<FavoriteNode[]>("add_memo_folder", { name: folderName, parentId });
        const node = created.find(
          (item) => item.type === "folder" && item.name === folderName && item.parentId === parentId
        );
        await reload();
        return node
          ? { folder: { id: node.id, label: node.name }, error: null }
          : { folder: null, error: "フォルダの作成に失敗しました" };
      } catch (error) {
        return { folder: null, error: String(error) };
      }
    },
    [reload]
  );

  const remove = useCallback(async () => {
    if (!selectedNode || selectedNode.id === MEMO_TRASH_ID) return;
    try {
      await invoke("delete_memo_node", { id: selectedNode.id });
      selection.resetToTop();
      await reload();
    } catch (error) {
      showMoveError(String(error));
    }
  }, [reload, selectedNode, selection, showMoveError]);

  const toggleFolder = useCallback(
    async (node: FavoriteNode) => {
      if (filterText) return;
      await invoke("set_favorite_folder_collapsed", { id: node.id, collapsed: !node.collapsed });
      await reload();
    },
    [filterText, reload]
  );

  // 行内の「ここにフォルダ／メモを作成」アイコン・Ctrl+Shift+N用。選択中の行の
  // 直下（フォルダ選択時）、またはその親フォルダ直下（メモ選択時）を作成先にする。
  // ルート直下への作成は常にヘッダーのアイコン（startCreateAtRoot）を使う。
  const startCreate = useCallback(
    (kind: "folder" | "memo") => {
      if (!selectedRow || selectedRow.trashed || !selectedNode || selectedNode.id === MEMO_TRASH_ID) return;
      setCreatingParentId(selectedNode.type === "folder" ? selectedNode.id : selectedNode.parentId);
      setCreatingAnchorId(selectedNode.id);
      setCreating(kind);
      setName("");
    },
    [selectedNode, selectedRow]
  );

  // ヘッダーの「新規フォルダ」「新規メモ」アイコン。常にメモルート直下へ作成する
  // （issue 0026 軸A：固定行「メモ」の撤去に伴い、この役割をヘッダーへ移した）。
  const startCreateAtRoot = useCallback((kind: "folder" | "memo") => {
    setCreatingParentId(MEMO_FOLDER_ID);
    setCreatingAnchorId(MEMO_HEADER_CREATE_ANCHOR);
    setCreating(kind);
    setName("");
  }, []);

  const cancelCreate = useCallback(() => {
    setCreating(null);
    setCreatingAnchorId(null);
  }, []);

  const moveSelectedWithinParent = useCallback(
    async (direction: 1 | -1) => {
      if (!selectedRow || selectedRow.trashed || !selectedNode || [MEMO_FOLDER_ID, MEMO_TRASH_ID].includes(selectedNode.id) || filtering) return;
      const siblings = nodes.filter((node) => node.parentId === selectedNode.parentId).sort((a, b) => a.order - b.order);
      const index = siblings.findIndex((node) => node.id === selectedNode.id);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= siblings.length) return;
      const others = siblings.filter((node) => node.id !== selectedNode.id);
      const targetSibling = siblings[nextIndex];
      const targetPosition = others.findIndex((node) => node.id === targetSibling.id);
      const targetIndex = direction === -1 ? targetPosition : targetPosition + 1;
      await moveNode(selectedNode.id, selectedNode.parentId, targetIndex, "keyboard");
    },
    [filtering, moveNode, nodes, selectedNode, selectedRow]
  );

  const indentSelected = useCallback(async () => {
    if (!selectedRow || selectedRow.trashed || !selectedNode || selectedRow.kind === "trash" || filtering) return;
    const siblings = nodes.filter((node) => node.parentId === selectedNode.parentId).sort((a, b) => a.order - b.order);
    const index = siblings.findIndex((node) => node.id === selectedNode.id);
    if (index <= 0) return;
    const previous = siblings[index - 1];
    if (previous.type !== "folder") return;
    const childCount = nodes.filter((node) => node.parentId === previous.id && node.id !== selectedNode.id).length;
    await moveNode(selectedNode.id, previous.id, childCount, "keyboard");
  }, [filtering, moveNode, nodes, selectedNode, selectedRow]);

  const outdentSelected = useCallback(async () => {
    if (!selectedRow || !selectedNode || selectedRow.kind === "trash" || filtering) return;
    if (selectedRow.trashed) {
      const rootCount = nodes.filter((node) => node.parentId === MEMO_FOLDER_ID && node.id !== selectedNode.id).length;
      await moveNode(selectedNode.id, MEMO_FOLDER_ID, rootCount, "keyboard");
      return;
    }
    const parentId = selectedNode.parentId;
    if (parentId === MEMO_FOLDER_ID) return;
    const parent = nodes.find((node) => node.id === parentId && node.type === "folder");
    if (!parent) return;
    const siblings = nodes.filter((node) => node.parentId === parent.parentId && node.id !== selectedNode.id).sort((a, b) => a.order - b.order);
    const parentIndex = siblings.findIndex((node) => node.id === parent.id);
    await moveNode(
      selectedNode.id,
      parent.parentId,
      parentIndex < 0 ? siblings.length : parentIndex + 1,
      "keyboard"
    );
  }, [filtering, moveNode, nodes, selectedNode, selectedRow]);

  const handleDragOver = useCallback(
    (event: React.DragEvent<HTMLDivElement>, row: MemoManageRow) => {
      if (filtering) return;
      event.preventDefault();
      const dragged = dragInfoRef.current;
      if (!dragged) {
        event.dataTransfer.dropEffect = "none";
        setDropTarget(null);
        return;
      }
      const position = dropPositionFromEvent(event, row);
      if (!isValidDropTarget(nodes, dragged, row, position)) {
        event.dataTransfer.dropEffect = "none";
        setDropTarget(null);
        return;
      }
      event.dataTransfer.dropEffect = "move";
      setDropTarget({ id: row.node.id, position });
    },
    [filtering, nodes]
  );

  const handleDrop = useCallback(
    async (event: React.DragEvent<HTMLDivElement>, row: MemoManageRow) => {
      event.preventDefault();
      const dragged = dragInfoRef.current;
      dragInfoRef.current = null;
      setDropTarget(null);
      if (!dragged || dragged.id === row.node.id) return;
      const position = dropPositionFromEvent(event, row);
      if (!isValidDropTarget(nodes, dragged, row, position)) {
        showMoveError(CIRCULAR_MOVE_ERROR);
        return;
      }
      const { newParentId, targetIndex } = computeTreeMoveTarget(nodes, dragged.id, memoDropTarget(row), position);
      await moveNode(dragged.id, newParentId, targetIndex);
    },
    [moveNode, nodes, showMoveError]
  );

  // 本文（下書き・確定版）の管理。ツリー側の選択が指すメモIDと同期する。
  const notes = useMemoNotes(active);
  const selectedMemoId = selectedRow?.kind === "memo" && !selectedRow.trashed ? selectedNode?.id ?? null : null;
  useEffect(() => {
    if (selectedMemoId !== notes.selectedId) {
      notes.setSelectedId(selectedMemoId);
    }
  }, [selectedMemoId, notes.selectedId, notes.setSelectedId]);

  return {
    nodes,
    rows,
    visibleRows,
    selection,
    selectedRow,
    selectedNode,
    filterText,
    setFilterText,
    filtering,
    creating,
    creatingParentId,
    creatingAnchorId,
    name,
    setName,
    renaming,
    setRenaming,
    dropTarget,
    setDropTarget,
    moveError,
    dragInfoRef,
    reload,
    createMemo,
    createFolder,
    remove,
    toggleFolder,
    startCreate,
    startCreateAtRoot,
    cancelCreate,
    moveNode,
    moveSelectedWithinParent,
    indentSelected,
    outdentSelected,
    handleDragOver,
    handleDrop,
    document: notes.document,
    updateContent: notes.updateContent,
    saveFinal: notes.saveFinal,
    discardDraft: notes.discardDraft,
    flushDraft: notes.flushDraft,
  };
}

export type UseMemoManageResult = ReturnType<typeof useMemoManage>;
