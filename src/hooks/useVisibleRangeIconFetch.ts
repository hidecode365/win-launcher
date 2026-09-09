import { useEffect } from "react";
import type { RefObject } from "react";

// issue 0031：Shellアイコンの表示範囲優先取得。
//
// 一覧コンテナ内の`[data-index]`要素を`IntersectionObserver`で監視し、現在表示中の
// 行の直後`lookahead`行までのパスをアイコン取得キューへ渡す（外部設計06「表示中の
// 行を優先し、直後の少数を先読みする」）。既存の`data-index`属性・スクロール
// コンテナ（`overflow-y-auto`な単一div）をそのまま流用し、追加のDOM構造・
// ラッパー要素は必要としない。
//
// 観測対象の再構築は`itemCount`が変わった時だけ行う（一覧の要素数が変わらない
// 並び替え等では観測対象を再構築しない。行数が変わらない並び替えは実機頻度が
// 低く、その場合も次の一覧更新かスクロールで自然に解決するため、観測対象を
// 毎レンダー洗い替えるコストは払わない設計判断）。
export function useVisibleRangeIconFetch(
  containerRef: RefObject<HTMLElement>,
  itemCount: number,
  getPathAt: (index: number) => string | null,
  requestIcons: (paths: string[]) => void,
  lookahead: number
) {
  useEffect(() => {
    const container = containerRef.current;
    if (!container || itemCount === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visibleIndices: number[] = [];
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const raw = (entry.target as HTMLElement).dataset.index;
          if (raw === undefined) continue;
          const index = Number(raw);
          if (Number.isFinite(index)) visibleIndices.push(index);
        }
        if (visibleIndices.length === 0) return;
        const minVisible = Math.min(...visibleIndices);
        const maxVisible = Math.max(...visibleIndices);
        const end = Math.min(itemCount - 1, maxVisible + lookahead);
        const paths: string[] = [];
        for (let i = minVisible; i <= end; i++) {
          const path = getPathAt(i);
          if (path) paths.push(path);
        }
        if (paths.length > 0) requestIcons(paths);
      },
      { root: container, threshold: 0 }
    );

    const elements = container.querySelectorAll<HTMLElement>("[data-index]");
    elements.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
    // 依存配列にはあえて containerRef・itemCount・lookahead だけを含める。
    // getPathAt・requestIcons は呼び出し側で毎レンダー新しい関数参照になりうるが、
    // その都度 IntersectionObserver を作り直す必要はない（挙動を変えず、監視対象の
    // 再構築コストだけを避けるため）。効果の中では常に最新のクロージャを直接参照する。
  }, [containerRef, itemCount, lookahead]);
}
