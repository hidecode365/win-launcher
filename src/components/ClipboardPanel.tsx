import { useRef } from "react";
import { formatTimestamp } from "../lib/format";
import { useScrollSelectedIntoView } from "../hooks/useScrollSelectedIntoView";
import { SelectableRow } from "./SelectableRow";
import {
  ClipboardEntry,
  ClipboardImageEntry,
  ClipboardTextEntry,
} from "../types";
import { ResizableSplitPane } from "./ResizableSplitPane";

const CLIPBOARD_TEXT_PREVIEW_LENGTH = 40;
const DEFAULT_LEFT_WIDTH = 224;

export function ClipboardPanel({
  entries,
  selected,
  onSelect,
  onSelectEntry,
  initialLeftWidth = DEFAULT_LEFT_WIDTH,
  onWidthChange,
  memoEnabled = false,
  onAddMemo,
}: {
  entries: ClipboardEntry[];
  selected: number;
  onSelect: (index: number, clientX: number, clientY: number) => void;
  onSelectEntry: (entry: ClipboardEntry) => void;
  initialLeftWidth?: number;
  onWidthChange?: (width: number) => void;
  memoEnabled?: boolean;
  onAddMemo?: (text: string) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  useScrollSelectedIntoView(listRef, selected);

  return (
    <ResizableSplitPane
      className="flex-1"
      initialLeftWidth={initialLeftWidth}
      onResizeEnd={onWidthChange}
      left={<div ref={listRef} className="h-full overflow-y-auto">
        {entries.length === 0 ? (
          <div className="flex items-center justify-center text-center text-gray-400 text-sm py-6 px-2">
            履歴がありません
          </div>
        ) : (
          entries.map((entry, i) => (
            <SelectableRow
              key={entry.id}
              index={i}
              className={`w-full flex items-center px-3 py-2 text-left transition-colors ${
                i === selected
                  ? "bg-blue-500 text-white"
                  : "text-gray-700 hover:bg-gray-100"
              }`}
              onClick={() => onSelectEntry(entry)}
              onMouseEnter={(e) => onSelect(i, e.clientX, e.clientY)}
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
              <div className="min-w-0 flex-1">
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
              {memoEnabled && entry.type === "text" && entry.text.trim() && (
                <button type="button" onClick={(event) => { event.stopPropagation(); onAddMemo?.(entry.text); }} className="ml-2 flex-shrink-0 rounded p-1 opacity-60 hover:bg-black/10 hover:opacity-100" aria-label="メモに登録">
                  <svg className="h-4 w-4" viewBox="0 0 512 512" fill="currentColor"><path d="M392.197 26.581h-4.77v-9.699C387.427 7.566 379.877 0 370.546 0c-9.332 0-16.898 7.566-16.898 16.882v9.699h-42.576v-9.699C311.072 7.566 303.514 0 294.182 0c-9.324 0-16.89 7.566-16.89 16.882v9.699h-42.576v-9.699C234.716 7.566 227.15 0 217.826 0c-9.332 0-16.89 7.566-16.89 16.882v9.699h-42.584v-9.699C158.352 7.566 150.786 0 141.462 0c-9.332 0-16.89 7.566-16.89 16.882v9.699h-4.77c-38.501.008-69.684 31.199-69.7 69.7v306.59c.016 60.28 48.856 109.12 109.129 109.128h156.354l146.312-146.312V96.281c0-38.501-31.191-69.692-69.7-69.7zM429.173 350.021h-31.679c-51.237 0-92.766 41.53-92.766 92.766v33.787l-2.692 2.692-142.804.008c-21.149-.008-40.148-8.525-54.026-22.378-13.853-13.878-22.37-32.877-22.378-54.025V96.281c.008-10.258 4.114-19.398 10.834-26.142 6.743-6.719 15.883-10.826 26.142-10.834h4.77v18.121c0 9.332 7.558 16.889 16.89 16.889 9.324 0 16.89-7.558 16.89-16.889V59.306h42.584v18.121c0 9.332 7.558 16.889 16.89 16.889 9.323 0 16.89-7.558 16.89-16.889V59.306h42.576v18.121c0 9.332 7.566 16.889 16.89 16.889 9.332 0 16.89-7.558 16.89-16.889V59.306h42.576v18.121c0 9.332 7.566 16.889 16.898 16.889 9.332 0 16.881-7.558 16.881-16.889V59.306h4.77c10.259.008 19.398 4.114 26.142 10.834 6.718 6.744 10.825 15.883 10.834 26.142v253.74z" /><path d="M146.919 170.033h218.17v32.725h-218.17zm0 87.261h218.17v32.725h-218.17zm0 87.262h130.9v32.725h-130.9z" /></svg>
                </button>
              )}
            </SelectableRow>
          ))
        )}
      </div>}
      right={<div className="h-full overflow-y-auto p-3">
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
      </div>}
    />
  );
}
