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
import { IconSlot } from "./IconSlot";
import { MemoIcon } from "./MemoIcon";

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
              className={`w-full flex items-center px-3 py-2 text-left ${
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
              {memoEnabled && i === selected && entry.type === "text" && entry.text.trim() && (
                <span className="ml-2 flex items-center gap-2">
                <IconSlot interactive selected={i === selected} tooltip="メモに登録" onClick={() => onAddMemo?.(entry.text)}>
                  <MemoIcon />
                </IconSlot></span>
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
