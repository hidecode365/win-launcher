import { useEffect, useRef, useState } from "react";

export function OcrPreview({
  imageUrl,
  loading,
  text,
  error,
  onTextChange,
  onClose,
  onCopyAndClose,
}: {
  imageUrl: string | null;
  loading: boolean;
  text: string | null;
  error: string | null;
  onTextChange: (t: string) => void;
  onClose: () => void;
  onCopyAndClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  // 分割幅は永続化しない。null の間は CSS の 50% を使い、
  // ドラッグ操作が発生した時点で初めて px 固定幅に切り替える。
  const [leftWidth, setLeftWidth] = useState<number | null>(null);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const panelEl = panelRef.current;
      if (!panelEl) return;
      const rect = panelEl.getBoundingClientRect();
      const maxWidth = rect.width * 0.6;
      const newWidth = Math.max(150, Math.min(maxWidth, e.clientX - rect.left));
      setLeftWidth(newWidth);
    };

    const onMouseUp = () => {
      if (!isDragging.current) return;
      isDragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  const handleDividerMouseDown = () => {
    isDragging.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  return (
    <div
      ref={panelRef}
      className="flex-1 flex overflow-hidden border-t border-gray-200/60"
    >
      {/* 左ペイン: 貼り付けられた画像のプレビュー */}
      <div
        className="flex-shrink-0 flex items-center justify-center overflow-hidden p-3"
        style={{ width: leftWidth ?? "50%" }}
      >
        {imageUrl ? (
          <img
            src={imageUrl}
            alt=""
            className="max-w-full max-h-full object-contain"
          />
        ) : (
          <div className="text-gray-400 text-sm">画像がありません</div>
        )}
      </div>

      {/* Draggable divider */}
      <div
        className="w-1 flex-shrink-0 bg-gray-200/60 hover:bg-blue-400/60 cursor-col-resize transition-colors"
        onMouseDown={handleDividerMouseDown}
      />

      {/* 右ペイン: OCR結果テキスト */}
      <div className="flex-1 min-w-0 flex flex-col p-3 gap-2 overflow-hidden">
        {loading && (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <svg
              className="w-4 h-4 animate-spin text-blue-500 flex-shrink-0"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8v8z"
              />
            </svg>
            OCR処理中...
          </div>
        )}

        {error && !loading && (
          <div className="text-xs text-red-500 leading-snug">{error}</div>
        )}

        {text !== null && !loading && (
          <div className="flex-1 flex flex-col min-h-0 gap-2">
            <textarea
              className="flex-1 min-h-0 w-full text-sm text-gray-800 border border-gray-200 rounded p-2 resize-none outline-none focus:ring-1 focus:ring-blue-400 bg-white/80 overflow-y-auto"
              value={text}
              onChange={(e) => onTextChange(e.target.value)}
              autoFocus
            />
            <div className="flex justify-end gap-2 flex-shrink-0">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1 text-xs rounded text-gray-500 hover:text-gray-700 hover:bg-gray-100"
              >
                閉じる
              </button>
              <button
                type="button"
                onClick={onCopyAndClose}
                className="px-3 py-1 text-xs rounded bg-blue-500 text-white hover:bg-blue-600"
              >
                コピーして閉じる
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
