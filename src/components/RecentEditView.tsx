import { useEffect, useLayoutEffect, useRef, type ComponentProps } from "react";
import { Tooltip } from "./Tooltip";
import { SettingsButton } from "./SettingsButton";
import { ResultList } from "./ResultList";
import { RecentEditFooter } from "./RecentEditFooter";
import { isEmptyFilterBackspaceReturn } from "../lib/treeEditUtils";

// issue 0024：最近使ったファイル一覧を検索画面の子状態からL1画面へ再構成した。
// ヘッダー（戻るボタン＋ローカル絞り込み入力欄）はClipboardEditView.tsxと同じ
// パターン。一覧は既存どおりの1ペインのため、独自の一覧コンポーネントは新設せず
// 既存のResultListをそのまま再利用する（rows・選択・ピン止めのロジックは
// useSearch.ts側で従来通り"/recent"滞在中は内部の呼び出しクエリ（search.query）を
// 維持したまま動作しており、この画面はその表示先を差し替えるだけ。詳細は
// docs/internal-design/recent-files.md を参照）。
//
// resultListProps は App.tsx が検索画面本体のResultListへ渡すのと同じ値をそのまま
// 渡す（rows は recentMode 中は最近使ったファイルの一覧に自動的に差し替わっている
// ため、この画面固有の分岐は不要）。
export function RecentEditView({
  filterText,
  onFilterTextChange,
  onRegisterLocalQueryClearHandler,
  onKeyDown,
  resultListProps,
  selectionAvailable,
  onClose,
  onOpenSettings,
  version,
}: {
  filterText: string;
  onFilterTextChange: (text: string) => void;
  onRegisterLocalQueryClearHandler: (handler: (() => void) | null) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  resultListProps: ComponentProps<typeof ResultList>;
  selectionAvailable: boolean;
  onClose: () => void;
  onOpenSettings: () => void;
  version: string;
}) {
  const filterInputRef = useRef<HTMLInputElement>(null);

  useLayoutEffect(() => {
    onRegisterLocalQueryClearHandler(() => onFilterTextChange(""));
    return () => onRegisterLocalQueryClearHandler(null);
  }, [onFilterTextChange, onRegisterLocalQueryClearHandler]);

  useEffect(() => {
    filterInputRef.current?.focus();
  }, []);

  return (
    <div className="relative flex h-screen flex-col overflow-hidden rounded-2xl border border-white/20 bg-white/90 shadow-2xl backdrop-blur-xl">
      <header
        data-tauri-drag-region="deep"
        className="flex items-center border-b border-gray-200/60 px-4 py-3"
      >
        <Tooltip label="戻る" side="right" className="mr-2 flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </button>
        </Tooltip>
        <svg
          className="mr-3 h-5 w-5 flex-shrink-0 text-gray-400"
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
        <input
          ref={filterInputRef}
          type="text"
          autoComplete="off"
          spellCheck={false}
          value={filterText}
          onChange={(e) => onFilterTextChange(e.target.value)}
          onKeyDown={(e) => {
            if (isEmptyFilterBackspaceReturn(e, filterText)) {
              e.preventDefault();
              e.stopPropagation();
              onClose();
              return;
            }
            onKeyDown(e);
          }}
          placeholder="最近使ったファイルを絞り込み..."
          className="flex-1 bg-transparent text-lg text-gray-800 outline-none placeholder-gray-400"
        />
        <SettingsButton onOpenSettings={onOpenSettings} className="ml-2" />
      </header>
      <ResultList {...resultListProps} />
      <RecentEditFooter selectionAvailable={selectionAvailable} version={version} />
    </div>
  );
}
