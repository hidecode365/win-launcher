import { useState } from "react";
import { FolderEntry } from "../types";
import { FeatureToggle } from "./FeatureToggle";

export function FileSearchSettings({
  enabled,
  onToggle,
  folders,
  onAddFolder,
  onToggleFolder,
  onRemoveFolder,
  onOpenFolder,
}: {
  enabled: boolean;
  onToggle: (checked: boolean) => void;
  folders: FolderEntry[];
  onAddFolder: () => void;
  onToggleFolder: (path: string) => void;
  onRemoveFolder: (path: string) => void;
  onOpenFolder: (path: string) => void;
}) {
  const [pendingRemovePath, setPendingRemovePath] = useState<string | null>(
    null
  );

  return (
    <div className="relative flex flex-col h-full">
      <FeatureToggle
        label="ファイル検索"
        description="検索ボックスの入力でフォルダ内のファイルを検索します。"
        checked={enabled}
        onChange={onToggle}
      />
      <div className="mt-4 pt-3 border-t border-gray-200/60 flex-1 flex flex-col min-h-0">
        <div className="text-xs text-gray-400 mb-2">検索フォルダ</div>
        <div className="flex-1 overflow-y-auto -mx-4">
          {folders.length === 0 && (
            <div className="px-4 py-3 text-sm text-gray-400">
              フォルダが登録されていません
            </div>
          )}
          {folders.map((f) => (
            <div
              key={f.path}
              className="flex items-center px-4 py-2 gap-3"
            >
              <input
                type="checkbox"
                checked={f.enabled}
                onChange={() => onToggleFolder(f.path)}
                className="flex-shrink-0"
              />
              <button
                type="button"
                onClick={() => onOpenFolder(f.path)}
                className="flex-1 min-w-0 truncate text-sm text-gray-700 text-left cursor-pointer hover:underline"
                title={f.path}
              >
                {f.path}
              </button>
              <button
                type="button"
                onClick={() => setPendingRemovePath(f.path)}
                className="flex-shrink-0 p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50"
                title="このフォルダを検索対象から削除"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={onAddFolder}
          className="mt-2 text-sm text-blue-600 hover:text-blue-700 text-left"
        >
          ＋ フォルダを追加
        </button>
      </div>

      {pendingRemovePath && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/30 backdrop-blur-sm">
          <div className="w-72 rounded-xl bg-white p-5 shadow-2xl">
            <div className="text-sm font-medium text-gray-800">
              このフォルダを検索対象から削除しますか？
            </div>
            <div className="mt-1 text-xs text-gray-400 break-all">
              {pendingRemovePath}
            </div>
            <div className="mt-1 text-xs text-gray-400">
              設定から外れるだけで、フォルダ自体は削除されません
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingRemovePath(null)}
                className="rounded px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={() => {
                  onRemoveFolder(pendingRemovePath);
                  setPendingRemovePath(null);
                }}
                className="rounded bg-red-500 px-3 py-1.5 text-sm text-white hover:bg-red-600"
              >
                削除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
