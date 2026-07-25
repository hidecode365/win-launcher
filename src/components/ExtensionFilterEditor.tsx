import { useState } from "react";
import { ExtensionFilterMode } from "../types";

// 拡張子フィルタリングの編集UI（ブラックリスト/ホワイトリストの排他選択＋タグ形式の
// 追加・削除）。「検索フォルダの詳細設定ダイアログ」（フォルダごと）と「/recent の
// 表示対象設定」（/recent 機能全体で共有する単一設定）の両方から再利用する。
// ブラックリスト用・ホワイトリスト用のどちらの拡張子リストを編集対象にするかは呼び出し
// 側が `mode` に応じて選び、`extensions` として渡す（このコンポーネント自身はモード
// 切替時にリストを切り替えるロジックを持たない。他方のリストの保持は呼び出し側の責務）。
export function ExtensionFilterEditor({
  mode,
  onModeChange,
  extensions,
  onAddExtension,
  onRemoveExtension,
}: {
  mode: ExtensionFilterMode;
  onModeChange: (mode: ExtensionFilterMode) => void;
  extensions: string[];
  onAddExtension: (ext: string) => void;
  onRemoveExtension: (ext: string) => void;
}) {
  const [tagInput, setTagInput] = useState("");

  const addExtension = () => {
    const normalized = tagInput.trim().replace(/^\./, "").toLowerCase();
    if (!normalized) return;
    if (!extensions.includes(normalized)) {
      onAddExtension(normalized);
    }
    setTagInput("");
  };

  return (
    <div>
      <div className="flex gap-4 mb-2">
        <label className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer">
          <input
            type="radio"
            name="extensionFilterMode"
            checked={mode === "blacklist"}
            onChange={() => onModeChange("blacklist")}
          />
          ブラックリスト
        </label>
        <label className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer">
          <input
            type="radio"
            name="extensionFilterMode"
            checked={mode === "whitelist"}
            onChange={() => onModeChange("whitelist")}
          />
          ホワイトリスト
        </label>
      </div>
      <div className="text-xs text-gray-400 mb-2">
        {mode === "blacklist"
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
                onClick={() => onRemoveExtension(ext)}
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
  );
}
