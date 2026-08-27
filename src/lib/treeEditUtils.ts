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
  if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "n") {
    return true;
  }
  // issue 0026 補足修正：リネーム・フォルダ作成・メモ作成のインライン入力中は
  // Ctrl+Dを画面のクエリ／ローカル絞り込みクリアへ到達させない
  // （06-keyboard-interactions.md表1「Ctrl+D｜...本文編集・インライン入力中は
  // 無効」）。この関数はお気に入り・メモ両画面のインライン入力欄5箇所
  // （FavoriteEditTree.tsxのリネーム欄・フォルダ作成欄、MemoManageView.tsxの
  // フォルダ作成欄・メモ作成欄）から共有されるため、ここを1箇所直すだけで
  // 全箇所に一括適用される。
  return event.ctrlKey && event.key.toLowerCase() === "d";
}

/**
 * ローカル絞り込み入力欄が空の状態での無修飾Backspaceを検出する（お気に入り・
 * メモ・クリップボード履歴・最近使ったファイルのL1画面共通。06-keyboard-interactions.md
 * 「共通操作」表1「Backspace（修飾キーなし）」を参照）。呼び出し元の入力欄に
 * フォーカスがある間だけonKeyDownが発火するため、フォーカス位置自体はこの関数の
 * 対象外（呼び出し側が「フィルタ入力欄自身のonKeyDown」から呼ぶことで担保する）。
 * モーダル表示中に発火させない等、画面固有の追加条件は呼び出し側で判定すること
 * （お気に入り画面のフォルダ削除確認モーダル等）。
 */
export function isEmptyFilterBackspaceReturn(
  event: {
    key: string;
    ctrlKey: boolean;
    shiftKey: boolean;
    altKey: boolean;
    metaKey: boolean;
    nativeEvent: { isComposing: boolean };
  },
  filterText: string
): boolean {
  return (
    event.key === "Backspace" &&
    filterText === "" &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey &&
    !event.metaKey &&
    !event.nativeEvent.isComposing
  );
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
