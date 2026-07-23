import { useRef } from "react";
import { formatWithCommas } from "../lib/format";
import { useScrollSelectedIntoView } from "../hooks/useScrollSelectedIntoView";
import { FileEntry, PastedPathInfo, PrefixCommand, UrlConvertResult } from "../types";

const URL_CONVERT_KIND_LABEL: Record<UrlConvertResult["kind"], string> = {
  decode: "デコード結果",
  encode: "エンコード結果",
};
import { WebSearchRow } from "./WebSearchRow";

const PREFIX_COMMAND_ICON_PATH: Record<PrefixCommand["kind"], string> = {
  system: "M5.636 5.636a9 9 0 1 0 12.728 0M12 3v9",
  clipboard:
    "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
  recent: "M12 8v4l3 3m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0z",
};

export function ResultList({
  pathPasteCandidate,
  calcResult,
  prefixCommandMode,
  prefixCommandCandidates,
  results,
  urlConvertResult,
  query,
  selected,
  baseLength,
  webSearchVisible,
  onSelect,
  onAddSearchFolder,
  onStartShortcutWizard,
  onCopyResult,
  onSelectPrefixCommand,
  onLaunchFile,
  onOpenWebSearch,
  onCopyUrlConvertResult,
}: {
  pathPasteCandidate: PastedPathInfo | null;
  calcResult: string | null;
  prefixCommandMode: boolean;
  prefixCommandCandidates: PrefixCommand[];
  results: FileEntry[];
  urlConvertResult: UrlConvertResult | null;
  query: string;
  selected: number;
  baseLength: number;
  webSearchVisible: boolean;
  onSelect: (index: number, clientX: number, clientY: number) => void;
  onAddSearchFolder: () => void;
  onStartShortcutWizard: () => void;
  onCopyResult: (text: string) => void;
  onSelectPrefixCommand: (cmd: PrefixCommand) => void;
  onLaunchFile: (path: string) => void;
  onOpenWebSearch: (query: string) => void;
  onCopyUrlConvertResult: (text: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  useScrollSelectedIntoView(containerRef, selected);
  // パス貼り付けの候補行（ショートカット配置→(フォルダのみ)検索フォルダに追加）は
  // 常に先頭を占有する。ローカルパスは数式計算・URLエンコード/デコードの判定条件と
  // 構造上両立しないため、この2つと同時に発生することはない（詳細は
  // REQUIREMENTS.md「パス貼り付けによる検索フォルダ管理」節を参照）。
  const pathPasteOffset = pathPasteCandidate
    ? pathPasteCandidate.isDir
      ? 2
      : 1
    : 0;
  const calcIndex = pathPasteOffset;
  const calcOffset = pathPasteOffset + (calcResult !== null ? 1 : 0);
  const urlConvertOffset = calcOffset + (urlConvertResult !== null ? 1 : 0);

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto">
      {prefixCommandMode ? (
        <>
          {prefixCommandCandidates.map((cmd, i) => (
            <button
              key={cmd.keyword}
              data-index={i}
              className={`w-full flex items-center px-4 py-2.5 text-left transition-colors ${
                i === selected
                  ? "bg-blue-500 text-white"
                  : "text-gray-700 hover:bg-gray-100"
              }`}
              onClick={() => onSelectPrefixCommand(cmd)}
              onMouseEnter={(e) => onSelect(i, e.clientX, e.clientY)}
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
                  d={PREFIX_COMMAND_ICON_PATH[cmd.kind]}
                />
              </svg>
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">{cmd.keyword}</div>
                <div
                  className={`text-xs truncate ${
                    i === selected ? "text-blue-100" : "text-gray-400"
                  }`}
                >
                  {cmd.description}
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
              onMouseEnter={(e) => onSelect(baseLength, e.clientX, e.clientY)}
            />
          )}
        </>
      ) : (
        <>
          {pathPasteCandidate !== null && (
            <>
              <button
                data-index={0}
                className={`w-full flex items-center px-4 py-2.5 text-left transition-colors border-b border-gray-100 ${
                  selected === 0
                    ? "bg-blue-500 text-white"
                    : "text-gray-700 hover:bg-gray-100"
                }`}
                onClick={onStartShortcutWizard}
                onMouseEnter={(e) => onSelect(0, e.clientX, e.clientY)}
              >
                <svg
                  className={`w-4 h-4 mr-3 flex-shrink-0 ${
                    selected === 0 ? "text-white" : "text-blue-500"
                  }`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13.828 10.172a4 4 0 010 5.656l-4 4a4 4 0 01-5.656-5.656l1.5-1.5m5.656-5.656l1.5-1.5a4 4 0 115.656 5.656l-4 4a4 4 0 01-5.656 0"
                  />
                </svg>
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">
                    検索フォルダにショートカット配置: {pathPasteCandidate.name}
                  </div>
                  <div
                    className={`text-xs truncate ${
                      selected === 0 ? "text-blue-100" : "text-gray-400"
                    }`}
                  >
                    Enter で名前・配置先を選択
                  </div>
                </div>
              </button>
              {pathPasteCandidate.isDir && (
                <button
                  data-index={1}
                  className={`w-full flex items-center px-4 py-2.5 text-left transition-colors border-b border-gray-100 ${
                    selected === 1
                      ? "bg-blue-500 text-white"
                      : "text-gray-700 hover:bg-gray-100"
                  }`}
                  onClick={onAddSearchFolder}
                  onMouseEnter={(e) => onSelect(1, e.clientX, e.clientY)}
                >
                  <svg
                    className={`w-4 h-4 mr-3 flex-shrink-0 ${
                      selected === 1 ? "text-white" : "text-blue-500"
                    }`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 10v6m3-3H9m11 5V7a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2v11a2 2 0 002 2h14a2 2 0 002-2z"
                    />
                  </svg>
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">
                      検索フォルダに追加: {pathPasteCandidate.name}
                    </div>
                    <div
                      className={`text-xs truncate ${
                        selected === 1 ? "text-blue-100" : "text-gray-400"
                      }`}
                    >
                      Enter で追加
                    </div>
                  </div>
                </button>
              )}
            </>
          )}
          {calcResult !== null && (
            <button
              data-index={calcIndex}
              className={`w-full flex items-center px-4 py-2.5 text-left transition-colors border-b border-gray-100 ${
                selected === calcIndex
                  ? "bg-blue-500 text-white"
                  : "text-gray-700 hover:bg-gray-100"
              }`}
              onClick={() => onCopyResult(calcResult)}
              onMouseEnter={(e) => onSelect(calcIndex, e.clientX, e.clientY)}
            >
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">
                  {formatWithCommas(calcResult)}
                </div>
                <div
                  className={`text-xs truncate ${
                    selected === calcIndex ? "text-blue-100" : "text-gray-400"
                  }`}
                >
                  Enter でコピー
                </div>
              </div>
            </button>
          )}
          {urlConvertResult !== null && (
            <button
              data-index={calcOffset}
              className={`w-full flex items-center px-4 py-2.5 text-left transition-colors border-b border-gray-100 ${
                selected === calcOffset
                  ? "bg-blue-500 text-white"
                  : "text-gray-700 hover:bg-gray-100"
              }`}
              onClick={() => onCopyUrlConvertResult(urlConvertResult.text)}
              onMouseEnter={(e) => onSelect(calcOffset, e.clientX, e.clientY)}
            >
              <svg
                className={`w-4 h-4 mr-3 flex-shrink-0 ${
                  selected === calcOffset ? "text-white" : "text-blue-500"
                }`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13.828 10.172a4 4 0 010 5.656l-4 4a4 4 0 01-5.656-5.656l1.5-1.5m5.656-5.656l1.5-1.5a4 4 0 115.656 5.656l-4 4a4 4 0 01-5.656 0"
                />
              </svg>
              <div className="min-w-0">
                <div
                  className={`text-[11px] truncate ${
                    selected === calcOffset ? "text-blue-100" : "text-gray-400"
                  }`}
                >
                  {URL_CONVERT_KIND_LABEL[urlConvertResult.kind]}
                </div>
                <div className="text-sm font-medium truncate">
                  {urlConvertResult.text}
                </div>
                <div
                  className={`text-xs truncate ${
                    selected === calcOffset ? "text-blue-100" : "text-gray-400"
                  }`}
                >
                  Enter でコピー
                </div>
              </div>
            </button>
          )}
          {results.length === 0 && query.length > 0 && (
            <div className="flex items-center justify-center text-gray-400 text-sm py-6">
              見つかりませんでした
            </div>
          )}
          {results.map((item, i) => {
            const index = i + calcOffset + urlConvertOffset;
            return (
            <button
              key={item.path}
              data-index={index}
              className={`w-full flex items-center px-4 py-2.5 text-left transition-colors ${
                index === selected
                  ? "bg-blue-500 text-white"
                  : "text-gray-700 hover:bg-gray-100"
              }`}
              onClick={() => onLaunchFile(item.path)}
              onMouseEnter={(e) => onSelect(index, e.clientX, e.clientY)}
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
                    index === selected ? "text-blue-100" : "text-gray-400"
                  }`}
                >
                  {item.path}
                </div>
              </div>
            </button>
            );
          })}
          {webSearchVisible && (
            <WebSearchRow
              query={query}
              active={selected === baseLength}
              index={baseLength}
              onClick={() => onOpenWebSearch(query)}
              onMouseEnter={(e) => onSelect(baseLength, e.clientX, e.clientY)}
            />
          )}
        </>
      )}
    </div>
  );
}
