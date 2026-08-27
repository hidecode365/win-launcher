import { useEffect, useLayoutEffect, useRef } from "react";
import { Tooltip } from "./Tooltip";
import { ClipboardPanel } from "./ClipboardPanel";
import { ClipboardEditFooter } from "./ClipboardEditFooter";
import { isEmptyFilterBackspaceReturn } from "../lib/treeEditUtils";
import { ClipboardEntry } from "../types";

// issue 0024：クリップボード履歴を検索画面の子状態からL1画面へ再構成した。
// ヘッダー（戻るボタン＋ローカル絞り込み入力欄）はFavoriteEditView.tsx/
// MemoManageView.tsxと同じ視覚パターンを踏襲する。フォルダを持たないメモ画面相当の
// 構成のため、本体は既存のClipboardPanel（左：履歴一覧、右：常時表示の読み取り
// 専用プレビュー）をそのまま再利用し、独自の一覧・プレビュー実装は持たない
// （external-design/01-screen-transitions.md「L1画面の共通土台」節：履歴データを
// 単一のデータモデルへ統合しない、を踏まえ、useClipboard.ts のデータ・選択ロジック
// 自体には手を入れない）。
//
// ↑↓・Enterのキー処理はApp.tsxのhandleKeyDown（検索画面のSearchBoxと共有）を
// そのままこの入力欄のonKeyDownへ配線する。Escapeはフォーカス位置に依存させない
// ため、App.tsx側のwindowレベルkeydownリスナーで一括処理する（この入力欄自身は
// Escapeを処理しない）。
export function ClipboardEditView({
  entries,
  selected,
  onSelect,
  onSelectEntry,
  filterText,
  onFilterTextChange,
  onRegisterLocalQueryClearHandler,
  onKeyDown,
  initialLeftWidth,
  onWidthChange,
  memoEnabled,
  onAddMemo,
  onClose,
  version,
}: {
  entries: ClipboardEntry[];
  selected: number;
  onSelect: (index: number, clientX: number, clientY: number) => void;
  onSelectEntry: (entry: ClipboardEntry) => void;
  filterText: string;
  onFilterTextChange: (text: string) => void;
  onRegisterLocalQueryClearHandler: (handler: (() => void) | null) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  initialLeftWidth: number;
  onWidthChange: (width: number) => void;
  memoEnabled: boolean;
  onAddMemo: (text: string) => void;
  onClose: () => void;
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
          placeholder="クリップボード履歴を絞り込み..."
          className="flex-1 bg-transparent text-lg text-gray-800 outline-none placeholder-gray-400"
        />
      </header>
      <ClipboardPanel
        entries={entries}
        selected={selected}
        onSelect={onSelect}
        onSelectEntry={onSelectEntry}
        initialLeftWidth={initialLeftWidth}
        onWidthChange={onWidthChange}
        memoEnabled={memoEnabled}
        onAddMemo={onAddMemo}
      />
      <ClipboardEditFooter
        selectionAvailable={entries.length > 0}
        version={version}
      />
    </div>
  );
}
