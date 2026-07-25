import { useEffect, useRef, useState } from "react";
import { truncatePathMiddle } from "../lib/path";

export function useTruncatedPath<T extends HTMLElement>(path: string) {
  const ref = useRef<T | null>(null);
  const [display, setDisplay] = useState(path);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const recompute = () => {
      const width = el.clientWidth;
      if (width <= 0) return;
      const font = getComputedStyle(el).font;
      setDisplay(truncatePathMiddle(path, width, font));
    };

    recompute();
    const observer = new ResizeObserver(recompute);
    observer.observe(el);
    return () => observer.disconnect();
  }, [path]);

  return { ref, display };
}
