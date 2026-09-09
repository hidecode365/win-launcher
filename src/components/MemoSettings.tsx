import { useState } from "react";
import { FeatureToggle } from "./FeatureToggle";
import { SettingsField } from "./SettingsField";
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
    <SettingsIndent>
      <SettingsField label="呼び出しキーワード" hint="「/」が自動的に先頭に付与されます">
        <span className="text-sm text-gray-400">/</span>
        <input type="text" value={draft} onChange={(event) => { setDraft(event.target.value); setError(null); }} className={draftInputClassName(dirty)} />
      </SettingsField>
      <SettingsSaveBar isDirty={dirty} onSave={save} error={error} />
    </SettingsIndent>
  </div>;
}
