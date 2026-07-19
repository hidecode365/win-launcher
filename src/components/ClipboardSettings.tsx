import { useEffect, useState } from "react";
import { FeatureToggle } from "./FeatureToggle";

export function ClipboardSettings({
  enabled,
  onToggle,
  prefix,
  onChangePrefix,
  maxItems,
  onChangeMaxItems,
  error,
}: {
  enabled: boolean;
  onToggle: (checked: boolean) => void;
  prefix: string;
  onChangePrefix: (prefix: string) => void;
  maxItems: number;
  onChangeMaxItems: (maxItems: number) => void;
  error: string | null;
}) {
  const [prefixInput, setPrefixInput] = useState(prefix);
  const [maxItemsInput, setMaxItemsInput] = useState(String(maxItems));

  useEffect(() => setPrefixInput(prefix), [prefix]);
  useEffect(() => setMaxItemsInput(String(maxItems)), [maxItems]);

  const isPrefixDirty = prefixInput !== prefix;
  const isMaxItemsDirty = maxItemsInput !== String(maxItems);

  return (
    <div className="flex flex-col gap-4">
      <FeatureToggle
        label="クリップボード履歴"
        description="クリップボードの変化を監視し、検索ボックスに「/」＋呼び出しキーワードを入力すると履歴を呼び出せます。"
        checked={enabled}
        onChange={onToggle}
      />
      <div className="pt-3 border-t border-gray-200/60">
        <div className="text-sm font-medium text-gray-800 mb-1">呼び出しキーワード</div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-400">/</span>
          <input
            type="text"
            value={prefixInput}
            onChange={(e) => setPrefixInput(e.target.value)}
            className={`border rounded px-2 py-1 text-sm w-24 ${
              isPrefixDirty
                ? "border-amber-400 ring-1 ring-amber-200"
                : "border-gray-300"
            }`}
          />
          <button
            type="button"
            onClick={() => onChangePrefix(prefixInput)}
            className="text-sm text-blue-600 hover:text-blue-700"
          >
            保存
          </button>
        </div>
        {isPrefixDirty && (
          <div className="text-xs text-amber-600 mt-1">
            未保存の変更があります
          </div>
        )}
        <div className="text-xs text-gray-400 mt-1">
          「/」が自動的に先頭に付与されます
        </div>
      </div>
      <div className="pt-3 border-t border-gray-200/60">
        <div className="text-sm font-medium text-gray-800 mb-1">最大保持件数</div>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={1}
            max={200}
            value={maxItemsInput}
            onChange={(e) => setMaxItemsInput(e.target.value)}
            className={`border rounded px-2 py-1 text-sm w-24 ${
              isMaxItemsDirty
                ? "border-amber-400 ring-1 ring-amber-200"
                : "border-gray-300"
            }`}
          />
          <button
            type="button"
            onClick={() => onChangeMaxItems(Number(maxItemsInput))}
            className="text-sm text-blue-600 hover:text-blue-700"
          >
            保存
          </button>
        </div>
        {isMaxItemsDirty && (
          <div className="text-xs text-amber-600 mt-1">
            未保存の変更があります
          </div>
        )}
        <div className="text-xs text-gray-400 mt-1">1〜200件</div>
      </div>
      {error && <div className="text-xs text-red-500">{error}</div>}
    </div>
  );
}
