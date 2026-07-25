import { useState } from "react";
import { ExtensionFilterMode, FolderDetailSettings, FolderEntry } from "../types";
import { ExtensionFilterEditor } from "./ExtensionFilterEditor";
import { FeatureToggle } from "./FeatureToggle";

export function FolderDetailSettingsModal({
  folder,
  onCancel,
  onSave,
}: {
  folder: FolderEntry;
  onCancel: () => void;
  onSave: (detail: FolderDetailSettings) => Promise<string | null>;
}) {
  const [maxDepthInput, setMaxDepthInput] = useState(String(folder.maxDepth));
  // モーダルは開くたびに新規マウントされる（`detailTarget` が null → フォルダの
  // 遷移でのみ表示され、フォルダ→別フォルダへ直接切り替わることはない。詳細は
  // FileSearchSettings.tsx を参照）ため、このローカル state は毎回 null から始まり、
  // 前回開いたときのエラー表示が残ることはない
  // （詳細は CLAUDE.md「設定画面」節の「エラー状態の保持場所」を参照）。
  const [error, setError] = useState<string | null>(null);
  const [includeFolders, setIncludeFolders] = useState(folder.includeFolders);
  const [filterMode, setFilterMode] = useState<ExtensionFilterMode>(
    folder.extensionFilterMode
  );
  // ブラックリスト用・ホワイトリスト用を独立した state として保持する。
  // モードを切り替えても互いの入力内容は保持したまま、表示だけが切り替わる。
  const [blacklistExtensions, setBlacklistExtensions] = useState<string[]>(
    folder.blacklistExtensions
  );
  const [whitelistExtensions, setWhitelistExtensions] = useState<string[]>(
    folder.whitelistExtensions
  );

  const activeExtensions =
    filterMode === "blacklist" ? blacklistExtensions : whitelistExtensions;
  const setActiveExtensions =
    filterMode === "blacklist" ? setBlacklistExtensions : setWhitelistExtensions;

  const handleSave = async () => {
    const err = await onSave({
      maxDepth: Number(maxDepthInput),
      includeFolders,
      extensionFilterMode: filterMode,
      blacklistExtensions,
      whitelistExtensions,
    });
    setError(err);
  };

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="w-96 max-h-[85%] overflow-y-auto rounded-xl bg-white p-5 shadow-2xl">
        <div className="text-sm font-medium text-gray-800">詳細設定</div>
        <div className="mt-0.5 text-xs text-gray-400 break-all">
          {folder.path}
        </div>

        <div className="mt-4 pt-3 border-t border-gray-200/60">
          <div className="text-sm font-medium text-gray-800 mb-1">
            検索階層数
          </div>
          <input
            type="number"
            min={1}
            max={20}
            value={maxDepthInput}
            onChange={(e) => setMaxDepthInput(e.target.value)}
            className="border border-gray-300 rounded px-2 py-1 text-sm w-24"
          />
          <div className="text-xs text-gray-400 mt-1">
            このフォルダ配下を何階層まで検索するか（1〜20）
          </div>
        </div>

        <div className="mt-4 pt-3 border-t border-gray-200/60">
          <FeatureToggle
            label="フォルダ自体を検索対象に含める"
            description="OFFの場合、フォルダは検索結果に表示されずファイルのみが対象になります。"
            checked={includeFolders}
            onChange={setIncludeFolders}
          />
        </div>

        <div className="mt-4 pt-3 border-t border-gray-200/60">
          <div className="text-sm font-medium text-gray-800 mb-2">
            拡張子フィルタリング
          </div>
          <ExtensionFilterEditor
            mode={filterMode}
            onModeChange={setFilterMode}
            extensions={activeExtensions}
            onAddExtension={(ext) => setActiveExtensions([...activeExtensions, ext])}
            onRemoveExtension={(ext) =>
              setActiveExtensions(activeExtensions.filter((e) => e !== ext))
            }
          />
        </div>

        {error && <div className="text-xs text-red-500 mt-3">{error}</div>}

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
