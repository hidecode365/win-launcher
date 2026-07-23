import { useEffect, useRef } from "react";
import { useScrollSelectedIntoView } from "../hooks/useScrollSelectedIntoView";
import type { PathPasteWizardStep } from "../hooks/useSearch";
import { FolderEntry } from "../types";

// 機能2（検索フォルダにショートカットとして追加）のミニウィザードのステップ2・3を描画する。
// ステップ1（候補行表示）は ResultList 側で描画するため、ここでは扱わない
// （wizardStep === "idle" のとき、この判定した候補は ResultList の先頭固定領域に表示される）。
export function PathPasteWizard({
  step,
  folders,
  selected,
  onSelect,
  onSelectFolder,
  name,
  onNameChange,
}: {
  step: PathPasteWizardStep;
  folders: FolderEntry[];
  selected: number;
  onSelect: (index: number, clientX: number, clientY: number) => void;
  onSelectFolder: (folder: FolderEntry) => void;
  name: string;
  onNameChange: (name: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  useScrollSelectedIntoView(containerRef, selected);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // ステップ3（名前編集）に入った時点で、専用の入力欄へフォーカスを移す
  // （メインの検索ボックスは readOnly になっており文字入力を受け付けないため）。
  useEffect(() => {
    if (step === "nameEdit") {
      nameInputRef.current?.focus();
      nameInputRef.current?.select();
    }
  }, [step]);

  if (step === "nameEdit") {
    return (
      <div className="flex-1 flex flex-col px-4 py-3 gap-2">
        <div className="text-xs text-gray-400">ショートカット名</div>
        {/* Enter（保存）/ Escape（フォルダ選択に戻る）は、この input のローカル
            onKeyDown ではなく App.tsx の window レベル keydown リスナーが一元的に
            処理する（ローカルと window の二重ハンドラを避けるため。詳細は
            App.tsx 側のコメントを参照）。この input は入力値の保持・表示に専念する。 */}
        <input
          ref={nameInputRef}
          type="text"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          className="rounded border border-gray-300 px-3 py-2 text-sm text-gray-800 outline-none focus:border-blue-400"
          autoComplete="off"
          spellCheck={false}
        />
        <div className="text-xs text-gray-400">Enter で保存 / Esc でフォルダ選択に戻る</div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto">
      {folders.length === 0 ? (
        <div className="flex items-center justify-center text-gray-400 text-sm py-6">
          検索フォルダが登録されていません
        </div>
      ) : (
        folders.map((folder, i) => (
          <button
            key={folder.path}
            data-index={i}
            className={`w-full flex items-center px-4 py-2.5 text-left transition-colors ${
              i === selected
                ? "bg-blue-500 text-white"
                : "text-gray-700 hover:bg-gray-100"
            }`}
            onClick={() => onSelectFolder(folder)}
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
                d="M3 7a2 2 0 012-2h4l2 2h6a2 2 0 012 2v7a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"
              />
            </svg>
            <div className="min-w-0 truncate text-sm font-medium">
              {folder.path}
            </div>
          </button>
        ))
      )}
    </div>
  );
}
