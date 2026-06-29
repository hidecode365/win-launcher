import { useEffect, useRef, useState } from "react";
import { formatTimestamp } from "../lib/format";
import { useScrollSelectedIntoView } from "../hooks/useScrollSelectedIntoView";
import {
  ClipboardEntry,
  ClipboardImageEntry,
  ClipboardTextEntry,
} from "../types";

const CLIPBOARD_TEXT_PREVIEW_LENGTH = 40;
const DEFAULT_LEFT_WIDTH = 224;

export function ClipboardPanel({
  entries,
  selected,
  onSelect,
  onSelectEntry,
  initialLeftWidth = DEFAULT_LEFT_WIDTH,
  onWidthChange,
}: {
  entries: ClipboardEntry[];
  selected: number;
  onSelect: (index: number) => void;
  onSelectEntry: (entry: ClipboardEntry) => void;
  initialLeftWidth?: number;
  onWidthChange?: (width: number) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  useScrollSelectedIntoView(listRef, selected);

  const [leftWidth, setLeftWidth] = useState(initialLeftWidth);
  const leftWidthRef = useRef(initialLeftWidth);
  const isDragging = useRef(false);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const panelEl = panelRef.current;
      if (!panelEl) return;
      const rect = panelEl.getBoundingClientRect();
      const maxWidth = rect.width * 0.6;
      const newWidth = Math.max(150, Math.min(maxWidth, e.clientX - rect.left));
      leftWidthRef.current = newWidth;
      setLeftWidth(newWidth);
    };

    const onMouseUp = () => {
      if (!isDragging.current) return;
      isDragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      onWidthChange?.(leftWidthRef.current);
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, [onWidthChange]);

  const handleDividerMouseDown = () => {
    isDragging.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  return (
    <div ref={panelRef} className="flex-1 flex overflow-hidden">
      <div
        ref={listRef}
        className="flex-shrink-0 overflow-y-auto"
        style={{ width: leftWidth }}
      >
        {entries.length === 0 ? (
          <div className="flex items-center justify-center text-center text-gray-400 text-sm py-6 px-2">
            履歴がありません
          </div>
        ) : (
          entries.map((entry, i) => (
            <button
              key={entry.id}
              data-index={i}
              className={`w-full flex items-center px-3 py-2 text-left transition-colors ${
                i === selected
                  ? "bg-blue-500 text-white"
                  : "text-gray-700 hover:bg-gray-100"
              }`}
              onClick={() => onSelectEntry(entry)}
              onMouseEnter={() => onSelect(i)}
            >
              {entry.type === "image" ? (
                <img
                  src={entry.thumbnailDataUrl}
                  alt=""
                  className="w-6 h-6 mr-2 flex-shrink-0 object-cover rounded"
                />
              ) : (
                <svg
                  className="w-4 h-4 mr-2 flex-shrink-0 opacity-60"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
              )}
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">
                  {entry.type === "text"
                    ? entry.text.slice(0, CLIPBOARD_TEXT_PREVIEW_LENGTH)
                    : "画像"}
                </div>
                <div
                  className={`text-xs truncate ${
                    i === selected ? "text-blue-100" : "text-gray-400"
                  }`}
                >
                  {formatTimestamp(entry.timestamp)}
                </div>
              </div>
            </button>
          ))
        )}
      </div>

      {/* Draggable divider */}
      <div
        className="w-1 flex-shrink-0 bg-gray-200/60 hover:bg-blue-400/60 cursor-col-resize transition-colors"
        onMouseDown={handleDividerMouseDown}
      />

      <div className="flex-1 overflow-y-auto p-3">
        {entries[selected] ? (
          entries[selected].type === "text" ? (
            <div className="flex flex-col h-full">
              <div className="flex-1 overflow-y-auto text-sm text-gray-700 whitespace-pre-wrap break-words">
                {(entries[selected] as ClipboardTextEntry).text}
              </div>
              <div className="pt-2 mt-2 border-t border-gray-200/60 text-xs text-gray-400 flex-shrink-0">
                {formatTimestamp(entries[selected].timestamp)} ・{" "}
                {(entries[selected] as ClipboardTextEntry).text.length}文字
              </div>
            </div>
          ) : (
            <div className="flex flex-col h-full">
              <div className="flex-1 flex items-center justify-center overflow-hidden min-h-0">
                <img
                  src={
                    (entries[selected] as ClipboardImageEntry).thumbnailDataUrl
                  }
                  alt=""
                  className="max-w-full max-h-full object-contain"
                />
              </div>
              <div className="pt-2 mt-2 border-t border-gray-200/60 text-xs text-gray-400 flex-shrink-0">
                {formatTimestamp(entries[selected].timestamp)} ・{" "}
                {(entries[selected] as ClipboardImageEntry).width}×
                {(entries[selected] as ClipboardImageEntry).height}
              </div>
            </div>
          )
        ) : (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm">
            アイテムを選択してください
          </div>
        )}
      </div>
    </div>
  );
}
