import { useEffect, useRef, useState } from "react";
import { FolderDetailSettings, FolderEntry } from "../types";
import { useTruncatedPath } from "../hooks/useTruncatedPath";
import { useSettingsDraft } from "../hooks/useSettingsDraft";
import { FeatureToggle } from "./FeatureToggle";
import { FolderDetailSettingsModal } from "./FolderDetailSettingsModal";
import { FolderInfoModal } from "./FolderInfoModal";
import { SettingsGroup } from "./SettingsGroup";
import { SettingsIndent } from "./SettingsIndent";
import { SettingsSaveBar } from "./SettingsSaveBar";
import { draftInputClassName } from "./settingsFieldStyles";
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
  searchMaxResults,
  onChangeSearchMaxResults,
  folders,
  onAddFolder,
  onToggleFolder,
  onRemoveFolder,
  onReorderFolders,
  onOpenFolder,
  onSaveFolderSettings,
  onRegisterEscapeHandler,
  onOverlayActiveChange,
}: {
  enabled: boolean;
  onToggle: (checked: boolean) => void;
  searchMaxResults: number;
  onChangeSearchMaxResults: (maxResults: number) => Promise<string | null>;
  folders: FolderEntry[];
  onAddFolder: () => void;
  onToggleFolder: (path: string) => void;
  onRemoveFolder: (path: string) => void;
  onReorderFolders: (fromPath: string, toPath: string) => Promise<string | null>;
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
  const [infoTarget, setInfoTargetState] = useState<FolderEntry | null>(null);
  // 「除外されたファイル」サブモーダルの開閉状態。フォルダ情報ダイアログを開き直す・
  // 閉じるたびに必ずリセットする（setInfoTarget経由に一本化し、別フォルダの情報へ
  // 切り替えた際に前のフォルダの開閉状態が残らないようにする）。
  const [excludedFilesOpen, setExcludedFilesOpen] = useState(false);
  const setInfoTarget = (target: FolderEntry | null) => {
    setInfoTargetState(target);
    setExcludedFilesOpen(false);
  };

  const [maxResultsInput, setMaxResultsInput, maxResultsDirty] =
    useSettingsDraft(String(searchMaxResults));
  const [maxResultsError, setMaxResultsError] = useState<string | null>(null);

  const handleMaxResultsChange = (value: string) => {
    setMaxResultsInput(value);
    setMaxResultsError(null);
  };

  const handleSaveMaxResults = async () => {
    const err = await onChangeSearchMaxResults(Number(maxResultsInput));
    setMaxResultsError(err);
  };

  // ドラッグ中の並び替え元パス。専用ドラッグハンドル（⋮⋮）以外の要素（パス・
  // チェックボックス・詳細設定・フォルダ情報・削除）には draggable を付与しない
  // ことで、ドラッグの起点をハンドルだけに限定する（00-requirements.md「検索
  // フォルダの並び順と情報表示」節を参照。ピン止めブロック・お気に入り編集ビューの
  // 「行全体が draggable」という既存パターンとは異なる、この画面固有の要件）。
  const dragFromPathRef = useRef<string | null>(null);
  const [reorderError, setReorderError] = useState<string | null>(null);

  useEffect(() => {
    onOverlayActiveChange(
      detailTarget !== null || infoTarget !== null || pendingRemovePath !== null
    );
    onRegisterEscapeHandler(() => {
      // 除外ファイル一覧モーダルは常に最優先で閉じる（フォルダ情報ダイアログの
      // 上に重ねて表示しているため）。以降は既存の優先順位のまま
      // （詳細設定→フォルダ情報→削除確認）。
      if (excludedFilesOpen) {
        setExcludedFilesOpen(false);
        return true;
      }
      if (detailTarget) {
        setDetailTarget(null);
        return true;
      }
      if (infoTarget) {
        setInfoTarget(null);
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
  }, [
    detailTarget,
    infoTarget,
    excludedFilesOpen,
    onOverlayActiveChange,
    onRegisterEscapeHandler,
    pendingRemovePath,
  ]);

  const handleSaveFolderDetail = async (
    detail: FolderDetailSettings
  ): Promise<string | null> => {
    if (!detailTarget) return null;
    const err = await onSaveFolderSettings(detailTarget.path, detail);
    if (!err) setDetailTarget(null);
    return err;
  };

  const handleDrop = async (toPath: string) => {
    const fromPath = dragFromPathRef.current;
    dragFromPathRef.current = null;
    if (!fromPath || fromPath === toPath) return;
    const err = await onReorderFolders(fromPath, toPath);
    setReorderError(err);
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
        <div>
          <div className="text-sm font-medium text-gray-800 mb-1">検索上限件数</div>
          <input
            type="number"
            min={1}
            max={200}
            value={maxResultsInput}
            onChange={(e) => handleMaxResultsChange(e.target.value)}
            className={draftInputClassName(maxResultsDirty)}
          />
          <div className="text-xs text-gray-400 mt-1">1〜200件</div>
          <div className="mt-2">
            <SettingsSaveBar
              isDirty={maxResultsDirty}
              onSave={handleSaveMaxResults}
              error={maxResultsError}
            />
          </div>
        </div>
        <SettingsGroup
          title="検索フォルダ"
          className="mt-8 flex-1 flex flex-col min-h-0"
          contentClassName="mt-3 flex-1 flex flex-col min-h-0 gap-2"
        >
        {/* 400工程レビューで、ウィンドウ幅に合わせて検索フォルダ領域を広げる指摘を
            受けたため、以前ここにあった max-w-md（フォルダ名と操作アイコンの対応が
            取りにくくなるのを防ぐ目的）は外した。広げた幅でも行ごとの対応が分かる
            よう、代わりに divide-y（下記）で行区切りを表示する。 */}
        <div className="text-xs text-gray-400">
          <div>検索ボックスに入力した条件に一致するファイル・フォルダを、検索フォルダの上から順に検索します。</div>
          <div>「検索上限件数」に達すると検索を終了し、後続のフォルダは検索されません。優先したいフォルダを上へ並べてください。</div>
        </div>
        <div className="flex-1 overflow-y-auto divide-y divide-gray-200/60">
          {folders.length === 0 && (
            <div className="py-3 text-sm text-gray-400">
              フォルダが登録されていません
            </div>
          )}
          {folders.map((f) => (
            <div
              key={f.path}
              // 400工程レビュー指摘：フォルダ名と右側の操作アイコンの対応を把握
              // しやすくするため、行全体（ドラッグハンドル・チェックボックス・
              // パス表示・操作アイコンを含む）をホバー時に控えめにハイライトする
              // （既存の一覧行の共有ホバー表現＝`manageTreeRowClass`/`IconSlot`が
              // 用いる「行は不透明の淡色背景、行内アイコンは半透明オーバーレイ」の
              // 二階調の考え方を踏襲。詳細はDESIGN_LOG.md issue 0030「検索フォルダ行
              // のホバー表示」を参照）。行の不透明背景（bg-gray-100）とアイコン自身の
              // 不透明背景（同じbg-gray-100）が同色で重なると、アイコン単体への
              // ホバーが行のハイライトに埋もれてしまうため、下記の情報・詳細設定
              // アイコンは半透明の黒オーバーレイ（hover:bg-black/[6%]）へ変更し、
              // 行の背景の上でも常に一段暗く見えるようにしている（削除アイコンは
              // 元々red系で色相が異なるため据え置き）。
              className="flex items-center py-2 gap-3 hover:bg-gray-100 transition-colors"
              onDragOver={(e) => {
                if (!dragFromPathRef.current) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
              }}
              onDrop={(e) => {
                e.preventDefault();
                handleDrop(f.path);
              }}
            >
              <Tooltip label="ドラッグして並び替え" className="flex-shrink-0">
                <span
                  draggable
                  onDragStart={(e) => {
                    dragFromPathRef.current = f.path;
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", f.path);
                  }}
                  onDragEnd={() => {
                    dragFromPathRef.current = null;
                  }}
                  className="cursor-grab select-none font-bold text-gray-400"
                >
                  ⋮⋮
                </span>
              </Tooltip>
              <input
                type="checkbox"
                checked={f.enabled}
                onChange={() => onToggleFolder(f.path)}
                className="flex-shrink-0"
              />
              <FolderPathButton path={f.path} onOpen={onOpenFolder} />
              {/* 行の右寄りに位置し、左側（フォルダパス表示部分）に十分な余白が
                  あるため、Tooltip の既定（左側表示）のままでよい。 */}
              <Tooltip label="フォルダ情報" className="flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setInfoTarget(f)}
                  className="p-1.5 rounded text-gray-400 hover:text-gray-700 hover:bg-black/[6%]"
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
                      d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
                    />
                  </svg>
                </button>
              </Tooltip>
              <Tooltip label="詳細設定" className="flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setDetailTarget(f)}
                  className="p-1.5 rounded text-gray-400 hover:text-gray-700 hover:bg-black/[6%]"
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
        {reorderError && (
          <div className="text-xs text-red-500">{reorderError}</div>
        )}
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

      {infoTarget && (
        <FolderInfoModal
          folder={infoTarget}
          onClose={() => setInfoTarget(null)}
          excludedFilesOpen={excludedFilesOpen}
          onExcludedFilesOpenChange={setExcludedFilesOpen}
        />
      )}
    </div>
  );
}
