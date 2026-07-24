import { useState } from "react";
import { FolderDetailSettings, FolderEntry } from "../types";
import { FeatureToggle } from "./FeatureToggle";
import { FolderDetailSettingsModal } from "./FolderDetailSettingsModal";

export function FileSearchSettings({
  enabled,
  onToggle,
  folders,
  onAddFolder,
  onToggleFolder,
  onRemoveFolder,
  onOpenFolder,
  onSaveFolderSettings,
  folderSettingsError,
  onResetFolderSettingsError,
}: {
  enabled: boolean;
  onToggle: (checked: boolean) => void;
  folders: FolderEntry[];
  onAddFolder: () => void;
  onToggleFolder: (path: string) => void;
  onRemoveFolder: (path: string) => void;
  onOpenFolder: (path: string) => void;
  onSaveFolderSettings: (
    path: string,
    detail: FolderDetailSettings
  ) => Promise<boolean>;
  folderSettingsError: string | null;
  onResetFolderSettingsError: () => void;
}) {
  const [pendingRemovePath, setPendingRemovePath] = useState<string | null>(
    null
  );
  const [detailTarget, setDetailTarget] = useState<FolderEntry | null>(null);

  const handleSaveFolderDetail = async (detail: FolderDetailSettings) => {
    if (!detailTarget) return;
    const success = await onSaveFolderSettings(detailTarget.path, detail);
    if (success) setDetailTarget(null);
  };

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
                onClick={() => {
                  onResetFolderSettingsError();
                  setDetailTarget(f);
                }}
                className="flex-shrink-0 p-1.5 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100"
                title="詳細設定"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a7.65 7.65 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.28Z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
                  />
                </svg>
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

      {detailTarget && (
        <FolderDetailSettingsModal
          folder={detailTarget}
          onCancel={() => setDetailTarget(null)}
          onSave={handleSaveFolderDetail}
          error={folderSettingsError}
        />
      )}
    </div>
  );
}
