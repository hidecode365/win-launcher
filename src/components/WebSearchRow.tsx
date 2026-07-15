import type { MouseEvent } from "react";

export function WebSearchRow({
  query,
  active,
  index,
  onClick,
  onMouseEnter,
}: {
  query: string;
  active: boolean;
  index: number;
  onClick: () => void;
  onMouseEnter: (e: MouseEvent) => void;
}) {
  return (
    <button
      type="button"
      data-index={index}
      className={`w-full flex items-center px-4 py-2.5 text-left transition-colors border-t border-gray-100 ${
        active ? "bg-blue-500 text-white" : "text-gray-700 hover:bg-gray-100"
      }`}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
    >
      <svg
        className={`w-4 h-4 mr-3 flex-shrink-0 ${
          active ? "text-white" : "text-blue-500"
        }`}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
        />
      </svg>
      <div className="min-w-0">
        <div className="text-sm font-medium truncate">
          Googleで{query}を検索
        </div>
        <div
          className={`text-xs truncate ${
            active ? "text-blue-100" : "text-gray-400"
          }`}
        >
          Enter で開く
        </div>
      </div>
    </button>
  );
}
