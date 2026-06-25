import { useEffect } from "react";
import type { RefObject } from "react";

// 選択中のアイテム（data-index={selected} を持つ要素）を、選択インデックスが
// 変わるたびにコンテナ内に収まるようスクロールする。↑↓ キー操作で選択が
// 画面外に出てもカーソルが隠れないようにするため。
export function useScrollSelectedIntoView(
  containerRef: RefObject<HTMLElement>,
  selected: number
) {
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const el = container.querySelector<HTMLElement>(
      `[data-index="${selected}"]`
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [selected]);
}
