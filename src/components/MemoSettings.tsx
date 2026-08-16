import { useState } from "react";
import { FeatureToggle } from "./FeatureToggle";
import { SettingsIndent } from "./SettingsIndent";
import { SettingsSaveBar } from "./SettingsSaveBar";
import { draftInputClassName } from "./settingsFieldStyles";
import { useSettingsDraft } from "../hooks/useSettingsDraft";

export function MemoSettings({ enabled, onToggle, keyword, onChangeKeyword }: { enabled: boolean; onToggle: (checked: boolean) => void; keyword: string; onChangeKeyword: (keyword: string) => Promise<string | null> }) {
  const [draft, setDraft, dirty] = useSettingsDraft(keyword);
  const [error, setError] = useState<string | null>(null);
  const save = async () => { setError(null); if (dirty) setError(await onChangeKeyword(draft)); };
  return <div className="flex flex-col gap-4">
    <FeatureToggle label="メモ" description="クリップボードのテキストをメモへ登録し、「/」＋呼び出しキーワードでメモ画面を開きます。" checked={enabled} onChange={onToggle} />
    <SettingsIndent><div><div className="mb-1 text-sm font-medium text-gray-800">呼び出しキーワード</div><div className="flex items-center gap-2"><span className="text-sm text-gray-400">/</span><input type="text" value={draft} onChange={(event) => { setDraft(event.target.value); setError(null); }} className={draftInputClassName(dirty)} /></div><div className="mt-1 text-xs text-gray-400">「/」が自動的に先頭に付与されます</div></div><SettingsSaveBar isDirty={dirty} onSave={save} error={error} /></SettingsIndent>
  </div>;
}
