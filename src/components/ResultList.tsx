import { useRef } from "react";
import { formatWithCommas } from "../lib/format";
import { useScrollSelectedIntoView } from "../hooks/useScrollSelectedIntoView";
import { FileEntry, SystemCommand } from "../types";
import { WebSearchRow } from "./WebSearchRow";

export function ResultList({
  calcMode,
  calcResult,
  systemMode,
  systemMatches,
  results,
  query,
  selected,
  baseLength,
  webSearchVisible,
  onSelect,
  onCopyResult,
  onRequestSystemCommand,
  onLaunchFile,
  onOpenWebSearch,
}: {
  calcMode: boolean;
  calcResult: string | null;
  systemMode: boolean;
  systemMatches: SystemCommand[];
  results: FileEntry[];
  query: string;
  selected: number;
  baseLength: number;
  webSearchVisible: boolean;
  onSelect: (index: number) => void;
  onCopyResult: (text: string) => void;
  onRequestSystemCommand: (cmd: SystemCommand) => void;
  onLaunchFile: (path: string) => void;
  onOpenWebSearch: (query: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  useScrollSelectedIntoView(containerRef, selected);

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto">
      {calcMode ? (
        <>
          {calcResult !== null ? (
            <button
              data-index={0}
              className="w-full flex items-center px-4 py-2.5 text-left bg-blue-500 text-white"
              onClick={() => onCopyResult(calcResult)}
            >
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">
                  {formatWithCommas(calcResult)}
                </div>
                <div className="text-xs truncate text-blue-100">
                  Enter でコピー
                </div>
              </div>
            </button>
          ) : (
            <div className="flex items-center justify-center text-gray-400 text-sm py-6">
              計算できません
            </div>
          )}
          {webSearchVisible && (
            <WebSearchRow
              query={query}
              active={selected === baseLength}
              index={baseLength}
              onClick={() => onOpenWebSearch(query)}
              onMouseEnter={() => onSelect(baseLength)}
            />
          )}
        </>
      ) : systemMode ? (
        <>
          {systemMatches.map((cmd, i) => (
            <button
              key={cmd.action}
              data-index={i}
              className={`w-full flex items-center px-4 py-2.5 text-left transition-colors ${
                i === selected
                  ? "bg-blue-500 text-white"
                  : "text-gray-700 hover:bg-gray-100"
              }`}
              onClick={() => onRequestSystemCommand(cmd)}
              onMouseEnter={() => onSelect(i)}
            >
              <svg
                className="w-4 h-4 mr-3 flex-shrink-0 opacity-60"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5.636 5.636a9 9 0 1 0 12.728 0M12 3v9"
                />
              </svg>
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">{cmd.label}</div>
                <div
                  className={`text-xs truncate ${
                    i === selected ? "text-blue-100" : "text-gray-400"
                  }`}
                >
                  Enter で実行
                </div>
              </div>
            </button>
          ))}
          {webSearchVisible && (
            <WebSearchRow
              query={query}
              active={selected === baseLength}
              index={baseLength}
              onClick={() => onOpenWebSearch(query)}
              onMouseEnter={() => onSelect(baseLength)}
            />
          )}
        </>
      ) : (
        <>
          {results.length === 0 && query.length > 0 && (
            <div className="flex items-center justify-center text-gray-400 text-sm py-6">
              見つかりませんでした
            </div>
          )}
          {results.map((item, i) => (
            <button
              key={item.path}
              data-index={i}
              className={`w-full flex items-center px-4 py-2.5 text-left transition-colors ${
                i === selected
                  ? "bg-blue-500 text-white"
                  : "text-gray-700 hover:bg-gray-100"
              }`}
              onClick={() => onLaunchFile(item.path)}
              onMouseEnter={() => onSelect(i)}
            >
              {item.icon ? (
                <img
                  src={item.icon}
                  alt=""
                  className="w-4 h-4 mr-3 flex-shrink-0"
                />
              ) : (
                <svg
                  className="w-4 h-4 mr-3 flex-shrink-0 opacity-60"
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
                <div className="text-sm font-medium truncate">{item.name}</div>
                <div
                  className={`text-xs truncate ${
                    i === selected ? "text-blue-100" : "text-gray-400"
                  }`}
                >
                  {item.path}
                </div>
              </div>
            </button>
          ))}
          {webSearchVisible && (
            <WebSearchRow
              query={query}
              active={selected === baseLength}
              index={baseLength}
              onClick={() => onOpenWebSearch(query)}
              onMouseEnter={() => onSelect(baseLength)}
            />
          )}
        </>
      )}
    </div>
  );
}
