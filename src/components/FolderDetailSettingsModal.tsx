import { useState } from "react";
import { ExtensionFilterMode, FolderDetailSettings, FolderEntry } from "../types";
import { FeatureToggle } from "./FeatureToggle";

export function FolderDetailSettingsModal({
  folder,
  onCancel,
  onSave,
  error,
}: {
  folder: FolderEntry;
  onCancel: () => void;
  onSave: (detail: FolderDetailSettings) => void;
  error: string | null;
}) {
  const [maxDepthInput, setMaxDepthInput] = useState(String(folder.maxDepth));
  const [includeFolders, setIncludeFolders] = useState(folder.includeFolders);
  const [filterMode, setFilterMode] = useState<ExtensionFilterMode>(
    folder.extensionFilterMode
  );
  const [extensions, setExtensions] = useState<string[]>(folder.extensions);
  const [tagInput, setTagInput] = useState("");

  const addExtension = () => {
    const normalized = tagInput.trim().replace(/^\./, "").toLowerCase();
    if (!normalized) return;
    if (!extensions.includes(normalized)) {
      setExtensions([...extensions, normalized]);
    }
    setTagInput("");
  };

  const removeExtension = (ext: string) => {
    setExtensions(extensions.filter((e) => e !== ext));
  };

  const handleSave = () => {
    onSave({
      maxDepth: Number(maxDepthInput),
      includeFolders,
      extensionFilterMode: filterMode,
      extensions,
    });
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
          <div className="flex gap-4 mb-2">
            <label className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer">
              <input
                type="radio"
                name="extensionFilterMode"
                checked={filterMode === "blacklist"}
                onChange={() => setFilterMode("blacklist")}
              />
              ブラックリスト
            </label>
            <label className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer">
              <input
                type="radio"
                name="extensionFilterMode"
                checked={filterMode === "whitelist"}
                onChange={() => setFilterMode("whitelist")}
              />
              ホワイトリスト
            </label>
          </div>
          <div className="text-xs text-gray-400 mb-2">
            {filterMode === "blacklist"
              ? "追加した拡張子のファイルを検索対象から除外します（空の場合は全拡張子を許可）"
              : "追加した拡張子のファイルのみを検索対象にします（1件も追加していない場合、対象は0件になります）"}
          </div>
          {extensions.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {extensions.map((ext) => (
                <span
                  key={ext}
                  className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700"
                >
                  {ext}
                  <button
                    type="button"
                    onClick={() => removeExtension(ext)}
                    className="text-gray-400 hover:text-red-600"
                    aria-label={`${ext} を削除`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addExtension();
                }
              }}
              placeholder="例: txt"
              className="border border-gray-300 rounded px-2 py-1 text-sm flex-1 min-w-0"
            />
            <button
              type="button"
              onClick={addExtension}
              className="text-sm text-blue-600 hover:text-blue-700 flex-shrink-0"
            >
              追加
            </button>
          </div>
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
