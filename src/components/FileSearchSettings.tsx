import { FolderEntry } from "../types";
import { FeatureToggle } from "./FeatureToggle";

export function FileSearchSettings({
  enabled,
  onToggle,
  folders,
  onAddFolder,
  onToggleFolder,
  onRemoveFolder,
}: {
  enabled: boolean;
  onToggle: (checked: boolean) => void;
  folders: FolderEntry[];
  onAddFolder: () => void;
  onToggleFolder: (path: string) => void;
  onRemoveFolder: (path: string) => void;
}) {
  return (
    <div className="flex flex-col h-full">
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
              <span className="flex-1 min-w-0 truncate text-sm text-gray-700">
                {f.path}
              </span>
              <button
                type="button"
                onClick={() => onRemoveFolder(f.path)}
                className="flex-shrink-0 p-1 rounded text-gray-400 hover:text-red-500 hover:bg-gray-100"
                title="削除"
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
                    d="M6 18L18 6M6 6l12 12"
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
    </div>
  );
}
