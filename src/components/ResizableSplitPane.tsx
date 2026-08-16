import { ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

const MIN_LEFT_WIDTH = 150;

function clampWidth(width: number, containerWidth: number) {
  return Math.max(MIN_LEFT_WIDTH, Math.min(containerWidth * 0.6, width));
}

export function ResizableSplitPane({
  initialLeftWidth,
  onResizeEnd,
  left,
  right,
  className = "",
}: {
  initialLeftWidth: number;
  onResizeEnd?: (width: number) => void;
  left: ReactNode;
  right: ReactNode;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const widthRef = useRef(initialLeftWidth);
  const [leftWidth, setLeftWidth] = useState(initialLeftWidth);

  const restoreDocument = useCallback(() => {
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }, []);
  const setClampedWidth = useCallback((width: number) => {
    const containerWidth = containerRef.current?.getBoundingClientRect().width ?? 0;
    const next = clampWidth(width, containerWidth);
    widthRef.current = next;
    setLeftWidth(next);
    return next;
  }, []);
  const finishDrag = useCallback(() => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    restoreDocument();
    onResizeEnd?.(widthRef.current);
  }, [onResizeEnd, restoreDocument]);

  useLayoutEffect(() => {
    setClampedWidth(initialLeftWidth);
  }, [initialLeftWidth, setClampedWidth]);

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      if (!draggingRef.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      setClampedWidth(event.clientX - rect.left);
    };
    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", finishDrag);
    document.addEventListener("pointercancel", finishDrag);
    const observer = new ResizeObserver(() => setClampedWidth(widthRef.current));
    if (containerRef.current) observer.observe(containerRef.current);
    return () => {
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", finishDrag);
      document.removeEventListener("pointercancel", finishDrag);
      observer.disconnect();
      restoreDocument();
    };
  }, [finishDrag, restoreDocument, setClampedWidth]);

  return (
    <div ref={containerRef} className={`flex min-w-0 overflow-hidden ${className}`}>
      <div className="flex-shrink-0 min-w-0" style={{ width: leftWidth }}>{left}</div>
      <div
        className="w-1 flex-shrink-0 border-x border-gray-300 bg-gray-100 hover:border-blue-400 hover:bg-blue-100 cursor-col-resize transition-colors"
        onPointerDown={(event) => {
          event.preventDefault();
          draggingRef.current = true;
          document.body.style.cursor = "col-resize";
          document.body.style.userSelect = "none";
        }}
      />
      <div className="flex-1 min-w-0">{right}</div>
    </div>
  );
}
