import { useEffect, useState } from "react";
import { FeatureToggle } from "./FeatureToggle";

export function RecentFilesSettings({
  enabled,
  onToggle,
  keyword,
  onChangeKeyword,
  maxAgeDays,
  onChangeMaxAgeDays,
  maxResults,
  onChangeMaxResults,
  error,
}: {
  enabled: boolean;
  onToggle: (checked: boolean) => void;
  keyword: string;
  onChangeKeyword: (keyword: string) => void;
  maxAgeDays: number;
  onChangeMaxAgeDays: (maxAgeDays: number) => void;
  maxResults: number;
  onChangeMaxResults: (maxResults: number) => void;
  error: string | null;
}) {
  const [keywordInput, setKeywordInput] = useState(keyword);
  const [maxAgeDaysInput, setMaxAgeDaysInput] = useState(String(maxAgeDays));
  const [maxResultsInput, setMaxResultsInput] = useState(String(maxResults));

  useEffect(() => setKeywordInput(keyword), [keyword]);
  useEffect(() => setMaxAgeDaysInput(String(maxAgeDays)), [maxAgeDays]);
  useEffect(() => setMaxResultsInput(String(maxResults)), [maxResults]);

  return (
    <div className="flex flex-col gap-4">
      <FeatureToggle
        label="最近使ったファイル"
        description="検索ボックスに「/」＋呼び出しキーワードを入力すると、Windows の Recent フォルダから最近使ったファイルの一覧を呼び出せます。"
        checked={enabled}
        onChange={onToggle}
      />
      <div className="pt-3 border-t border-gray-200/60">
        <div className="text-sm font-medium text-gray-800 mb-1">呼び出しキーワード</div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-400">/</span>
          <input
            type="text"
            value={keywordInput}
            onChange={(e) => setKeywordInput(e.target.value)}
            className="border border-gray-300 rounded px-2 py-1 text-sm w-24"
          />
          <button
            type="button"
            onClick={() => onChangeKeyword(keywordInput)}
            className="text-sm text-blue-600 hover:text-blue-700"
          >
            保存
          </button>
        </div>
        <div className="text-xs text-gray-400 mt-1">
          「/」が自動的に先頭に付与されます
        </div>
      </div>
      <div className="pt-3 border-t border-gray-200/60">
        <div className="text-sm font-medium text-gray-800 mb-1">保持期間（日）</div>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={1}
            max={3650}
            value={maxAgeDaysInput}
            onChange={(e) => setMaxAgeDaysInput(e.target.value)}
            className="border border-gray-300 rounded px-2 py-1 text-sm w-24"
          />
          <button
            type="button"
            onClick={() => onChangeMaxAgeDays(Number(maxAgeDaysInput))}
            className="text-sm text-blue-600 hover:text-blue-700"
          >
            保存
          </button>
        </div>
        <div className="text-xs text-gray-400 mt-1">
          最終アクセス日時がこの日数より前のファイルは一覧に表示されません（1〜3650日）
        </div>
      </div>
      <div className="pt-3 border-t border-gray-200/60">
        <div className="text-sm font-medium text-gray-800 mb-1">最大表示件数</div>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={1}
            max={200}
            value={maxResultsInput}
            onChange={(e) => setMaxResultsInput(e.target.value)}
            className="border border-gray-300 rounded px-2 py-1 text-sm w-24"
          />
          <button
            type="button"
            onClick={() => onChangeMaxResults(Number(maxResultsInput))}
            className="text-sm text-blue-600 hover:text-blue-700"
          >
            保存
          </button>
        </div>
        <div className="text-xs text-gray-400 mt-1">1〜200件</div>
      </div>
      {error && <div className="text-xs text-red-500">{error}</div>}
    </div>
  );
}
