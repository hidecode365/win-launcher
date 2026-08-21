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
  const reset = useCallback(() => setIntent({ type: "key", key: resetKey }), [resetKey]);
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
