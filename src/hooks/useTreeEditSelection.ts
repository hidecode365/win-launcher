import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { resolveSelected, type SelectIntent, type SelectableItem } from "../lib/selectIntent";

const HOVER_SUPPRESS_AFTER_KEYBOARD_MS = 200;

// 編集系ツリー共通の選択基盤。選択位置は保持せず、行keyへの意図から都度導出する。
export function useTreeEditSelection<T extends SelectableItem>(
  tree: T[],
  resetKey: string,
  resetWhen?: unknown
) {
  const [intent, setIntent] = useState<SelectIntent>({ type: "key", key: resetKey });
  const [selected, setSelected] = useState(0);
  const fallbackRef = useRef(0);
  const lastKeyboardNavAtRef = useRef(0);
  const lastMousePosRef = useRef<{ x: number; y: number } | null>(null);
  // resetKey は呼び出し元で「現在の先頭行のkey」（tree[0]?.key 等）として渡される
  // ことが多く、並び替え・階層変更等の操作結果として先頭行が入れ替わるだけでも
  // 値が変わりうる。resetKey を直接 reset の useCallback 依存に含めると、
  // 「ユーザーが新しい文脈に入った」わけではない（resetWhen は変化していない）
  // のに reset の関数アイデンティティだけが変わり、下の useEffect が
  // resetWhen 経由ではなく reset 経由で誤発火してしまう（操作の副作用として
  // 変化する値をリセットトリガーに含めない、という原則の違反）。ref に
  // 最新値を都度書き込み、reset 自身の依存配列には含めないことで、
  // reset の呼び出し時点の最新 resetKey を使いつつ、その関数アイデンティティは
  // resetWhen が変化しない限り安定させる。
  const resetKeyRef = useRef(resetKey);
  resetKeyRef.current = resetKey;
  useLayoutEffect(() => {
    const next = resolveSelected(intent, tree, fallbackRef.current);
    fallbackRef.current = next;
    setSelected(next);
  }, [intent, tree]);
  const selectByKey = useCallback((key: string, expiresAt?: number) => {
    setIntent({ type: "key", key, ...(expiresAt ? { expiresAt } : {}) });
  }, []);
  const selectByKeyboard = useCallback((key: string, expiresAt?: number) => {
    lastKeyboardNavAtRef.current = Date.now();
    setIntent({ type: "key", key, ...(expiresAt ? { expiresAt } : {}) });
  }, []);
  const recordMouseMove = useCallback((clientX: number, clientY: number) => {
    lastMousePosRef.current = { x: clientX, y: clientY };
  }, []);
  const selectByHover = useCallback((key: string, clientX: number, clientY: number) => {
    if (Date.now() - lastKeyboardNavAtRef.current < HOVER_SUPPRESS_AFTER_KEYBOARD_MS) {
      return;
    }
    const last = lastMousePosRef.current;
    const cursorStationary =
      last !== null &&
      Math.abs(last.x - clientX) < 1 &&
      Math.abs(last.y - clientY) < 1;
    if (cursorStationary) return;
    setIntent({ type: "key", key });
  }, []);
  const reset = useCallback(() => setIntent({ type: "key", key: resetKeyRef.current }), []);
  // resetWhen（呼び出し元が「ユーザーが新しい文脈に入ったことを示す値」として渡す。
  // 例: ローカル絞り込み文字列）の変化のみをトリガーとする。
  useEffect(() => { if (resetWhen !== undefined) reset(); }, [resetWhen, reset]);
  const moveSelection = useCallback((direction: 1 | -1) => {
    const index = Math.max(0, Math.min(selected + direction, tree.length - 1));
    if (tree[index]) selectByKeyboard(tree[index].key);
  }, [selected, selectByKeyboard, tree]);
  return {
    selected,
    selectByKey,
    selectByKeyboard,
    selectByHover,
    recordMouseMove,
    moveSelection,
    resetToTop: reset,
  };
}
