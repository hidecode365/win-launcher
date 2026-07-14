import { useEffect, useState } from "react";
import { FeatureToggle } from "./FeatureToggle";
import { SystemCommandAction, SystemCommandKeywordErrors } from "../types";

function KeywordField({
  label,
  keyword,
  error,
  onSave,
}: {
  label: string;
  keyword: string;
  error: string | null;
  onSave: (keyword: string) => void;
}) {
  const [input, setInput] = useState(keyword);

  useEffect(() => setInput(keyword), [keyword]);

  return (
    <div className="pt-3 border-t border-gray-200/60">
      <div className="text-sm font-medium text-gray-800 mb-1">{label}</div>
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-400">/</span>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          className="border border-gray-300 rounded px-2 py-1 text-sm w-24"
        />
        <button
          type="button"
          onClick={() => onSave(input)}
          className="text-sm text-blue-600 hover:text-blue-700"
        >
          保存
        </button>
      </div>
      {error && <div className="text-xs text-red-500 mt-1">{error}</div>}
    </div>
  );
}

export function SystemCommandSettings({
  enabled,
  onToggle,
  shutdownKeyword,
  restartKeyword,
  sleepKeyword,
  onChangeKeyword,
  errors,
}: {
  enabled: boolean;
  onToggle: (checked: boolean) => void;
  shutdownKeyword: string;
  restartKeyword: string;
  sleepKeyword: string;
  onChangeKeyword: (command: SystemCommandAction, keyword: string) => void;
  errors: SystemCommandKeywordErrors;
}) {
  return (
    <div className="flex flex-col gap-4">
      <FeatureToggle
        label="システムコマンド"
        description="「/」に続けてキーワードを入力するとシステムコマンドを実行できるようにします（先頭の「/」は固定の区切り文字で、変更できません）。"
        checked={enabled}
        onChange={onToggle}
      />
      <KeywordField
        label="シャットダウン"
        keyword={shutdownKeyword}
        error={errors.shutdown}
        onSave={(keyword) => onChangeKeyword("shutdown", keyword)}
      />
      <KeywordField
        label="再起動"
        keyword={restartKeyword}
        error={errors.restart}
        onSave={(keyword) => onChangeKeyword("restart", keyword)}
      />
      <KeywordField
        label="スリープ"
        keyword={sleepKeyword}
        error={errors.sleep}
        onSave={(keyword) => onChangeKeyword("sleep", keyword)}
      />
    </div>
  );
}
