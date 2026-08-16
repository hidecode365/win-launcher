import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { resolveSelected, type SelectIntent, type SelectableItem } from "../lib/selectIntent";

// 編集系ツリー共通の選択基盤。選択位置は保持せず、行keyへの意図から都度導出する。
export function useTreeEditSelection<T extends SelectableItem>(
  tree: T[],
  resetKey: string,
  resetWhen?: unknown
) {
  const [intent, setIntent] = useState<SelectIntent>({ type: "key", key: resetKey });
  const [selected, setSelected] = useState(0);
  const fallbackRef = useRef(0);
  useLayoutEffect(() => {
    const next = resolveSelected(intent, tree, fallbackRef.current);
    fallbackRef.current = next;
    setSelected(next);
  }, [intent, tree]);
  const selectByKey = useCallback((key: string, expiresAt?: number) => {
    setIntent({ type: "key", key, ...(expiresAt ? { expiresAt } : {}) });
  }, []);
  const reset = useCallback(() => setIntent({ type: "key", key: resetKey }), [resetKey]);
  useEffect(() => { if (resetWhen !== undefined) reset(); }, [resetWhen, reset]);
  const moveSelection = useCallback((direction: 1 | -1) => {
    const index = Math.max(0, Math.min(selected + direction, tree.length - 1));
    if (tree[index]) setIntent({ type: "key", key: tree[index].key });
  }, [selected, tree]);
  return { selected, selectByKey, moveSelection, resetToTop: reset };
}
