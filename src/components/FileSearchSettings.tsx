import { useEffect, useState } from "react";
import { FolderDetailSettings, FolderEntry } from "../types";
import { useTruncatedPath } from "../hooks/useTruncatedPath";
import { FeatureToggle } from "./FeatureToggle";
import { FolderDetailSettingsModal } from "./FolderDetailSettingsModal";
import { SettingsGroup } from "./SettingsGroup";
import { SettingsIndent } from "./SettingsIndent";
import { Tooltip } from "./Tooltip";

// フックは呼び出し元の関数コンポーネント単位でしか使えないため（Rules of Hooks）、
// folders.map() のコールバック内で直接 useTruncatedPath は呼べない。1行ぶんの
// パス表示だけを担うこのコンポーネントに切り出すことで、行ごとに独立したフックの
// 呼び出しを可能にしている。
function FolderPathButton({
  path,
  onOpen,
}: {
  path: string;
  onOpen: (path: string) => void;
}) {
  const { ref, display } = useTruncatedPath<HTMLButtonElement>(path);
  return (
    <button
      ref={ref}
      type="button"
      onClick={() => onOpen(path)}
      className="flex-1 min-w-0 truncate text-sm text-gray-700 text-left cursor-pointer hover:underline"
      title={path}
    >
      {display}
    </button>
  );
}

export function FileSearchSettings({
  enabled,
  onToggle,
  folders,
  onAddFolder,
  onToggleFolder,
  onRemoveFolder,
  onOpenFolder,
  onSaveFolderSettings,
  onRegisterEscapeHandler,
  onOverlayActiveChange,
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
  ) => Promise<string | null>;
  onRegisterEscapeHandler: (handler: (() => boolean) | null) => void;
  onOverlayActiveChange: (active: boolean) => void;
}) {
  const [pendingRemovePath, setPendingRemovePath] = useState<string | null>(
    null
  );
  const [detailTarget, setDetailTarget] = useState<FolderEntry | null>(null);

  useEffect(() => {
    onOverlayActiveChange(detailTarget !== null || pendingRemovePath !== null);
    onRegisterEscapeHandler(() => {
      if (detailTarget) {
        setDetailTarget(null);
        return true;
      }
      if (pendingRemovePath) {
        setPendingRemovePath(null);
        return true;
      }
      return false;
    });
    return () => {
      onRegisterEscapeHandler(null);
      onOverlayActiveChange(false);
    };
  }, [detailTarget, onOverlayActiveChange, onRegisterEscapeHandler, pendingRemovePath]);

  const handleSaveFolderDetail = async (
    detail: FolderDetailSettings
  ): Promise<string | null> => {
    if (!detailTarget) return null;
    const err = await onSaveFolderSettings(detailTarget.path, detail);
    if (!err) setDetailTarget(null);
    return err;
  };

  return (
    <div className="relative flex flex-col h-full gap-4">
      <FeatureToggle
        label="ファイル検索"
        description="検索ボックスの入力でフォルダ内のファイルを検索します。"
        checked={enabled}
        onChange={onToggle}
      />
      <SettingsIndent className="flex-1 flex flex-col min-h-0">
        <SettingsGroup
          title="検索フォルダ"
          className="mt-8 flex-1 flex flex-col min-h-0"
          contentClassName="mt-3 flex-1 flex flex-col min-h-0 gap-2"
        >
        {/* 行が画面幅いっぱいに広がると、フォルダ名（左端）と操作アイコン（右端）が
            離れすぎて対応が取りにくくなるため、一覧に最大幅を設定して抑える */}
        <div className="flex-1 overflow-y-auto max-w-md">
          {folders.length === 0 && (
            <div className="py-3 text-sm text-gray-400">
              フォルダが登録されていません
            </div>
          )}
          {folders.map((f) => (
            <div
              key={f.path}
              className="flex items-center py-2 gap-3"
            >
              <input
                type="checkbox"
                checked={f.enabled}
                onChange={() => onToggleFolder(f.path)}
                className="flex-shrink-0"
              />
              <FolderPathButton path={f.path} onOpen={onOpenFolder} />
              {/* 行の右寄りに位置し、左側（フォルダパス表示部分）に十分な余白が
                  あるため、Tooltip の既定（左側表示）のままでよい。 */}
              <Tooltip label="詳細設定" className="flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setDetailTarget(f)}
                  className="p-1.5 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100"
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
              </Tooltip>
              <Tooltip
                label="このフォルダを検索対象から削除"
                className="flex-shrink-0"
              >
                <button
                  type="button"
                  onClick={() => setPendingRemovePath(f.path)}
                  className="p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50"
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
              </Tooltip>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={onAddFolder}
          className="text-sm text-blue-600 hover:text-blue-700 text-left"
        >
          ＋ フォルダを追加
        </button>
        </SettingsGroup>
      </SettingsIndent>

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
        />
      )}
    </div>
  );
}
