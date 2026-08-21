import type { TreeNode } from "./nodeTree";

/** ツリー編集の入力欄で、window側のショートカットへ伝播させないキーの最小契約。 */
export interface TreeEditKeyEvent {
  key: string;
  ctrlKey: boolean;
  shiftKey: boolean;
}

export function shouldStopEditInputKeyPropagation(
  event: TreeEditKeyEvent
): boolean {
  if (
    event.key === "ArrowUp" ||
    event.key === "ArrowDown" ||
    event.key === "ArrowLeft" ||
    event.key === "ArrowRight" ||
    event.key === "F2"
  ) {
    return true;
  }
  return event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "n";
}

export type TreeDropPosition = "before" | "after" | "into";

/** 行内の相対Y位置から、前・後・配下のどこへ落とすかを純粋計算する。 */
export function dropPositionFromRatio(
  ratio: number,
  targetIsFolder: boolean
): TreeDropPosition {
  if (targetIsFolder && ratio > 0.25 && ratio < 0.75) {
    return "into";
  }
  return ratio < 0.5 ? "before" : "after";
}

/** D&D計算が必要とする、画面固有の行型から切り離した最小契約。 */
export interface TreeDropTarget {
  id: string;
  parentId: string;
  isFolder: boolean;
  /** 仮想ルート・予約ルート行の場合、その行へのdropで実際に使う親ID。 */
  fixedParentId?: string;
  /** 折りたたみで子が行配列から消えていても末尾へ追加するための実子数。 */
  directChildCount?: number;
}

export function resolveTreeDropParent(
  target: TreeDropTarget,
  position: TreeDropPosition
): string {
  if (target.fixedParentId) return target.fixedParentId;
  return position === "into" && target.isFolder
    ? target.id
    : target.parentId;
}

/**
 * フォルダを自分自身または子孫へ移す循環を検出する。
 * Rust側の祖先走査と同じく、破損データでも無限ループしないよう64階層で打ち切る。
 */
export function isCircularTreeMove<T extends Pick<TreeNode, "id" | "parentId">>(
  nodes: T[],
  draggedId: string,
  newParentId: string
): boolean {
  if (newParentId === draggedId) return true;
  let current = newParentId;
  for (let depth = 0; depth < 64; depth++) {
    if (current === draggedId) return true;
    const parent = nodes.find((node) => node.id === current);
    if (!parent) return false;
    current = parent.parentId;
  }
  return false;
}

/**
 * drop先からRustのmoveコマンドへ渡す親IDと挿入位置を計算する。
 * nodesは画面が現在扱う順序でよいが、兄弟はorderで再整列して計算する。
 */
export function computeTreeMoveTarget<T extends TreeNode>(
  nodes: T[],
  draggedId: string,
  target: TreeDropTarget,
  position: TreeDropPosition
): { newParentId: string; targetIndex: number } {
  const newParentId = resolveTreeDropParent(target, position);
  const siblings = nodes
    .filter(
      (node) => node.parentId === newParentId && node.id !== draggedId
    )
    .sort((a, b) => a.order - b.order);

  if (target.fixedParentId) {
    return { newParentId, targetIndex: siblings.length };
  }
  if (position === "into" && target.isFolder) {
    return {
      newParentId,
      targetIndex: target.directChildCount ?? siblings.length,
    };
  }

  const targetPosition = siblings.findIndex((node) => node.id === target.id);
  const targetIndex =
    position === "before" ? targetPosition : targetPosition + 1;
  return { newParentId, targetIndex: Math.max(targetIndex, 0) };
}
