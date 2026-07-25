import { useState } from "react";
import { FeatureToggle } from "./FeatureToggle";
import { SettingsIndent } from "./SettingsIndent";
import { SettingsSaveBar } from "./SettingsSaveBar";
import { draftInputClassName } from "./settingsFieldStyles";
import { useSettingsDraft } from "../hooks/useSettingsDraft";

export function ClipboardSettings({
  enabled,
  onToggle,
  prefix,
  onChangePrefix,
  maxItems,
  onChangeMaxItems,
}: {
  enabled: boolean;
  onToggle: (checked: boolean) => void;
  prefix: string;
  onChangePrefix: (prefix: string) => Promise<string | null>;
  maxItems: number;
  onChangeMaxItems: (maxItems: number) => Promise<string | null>;
}) {
  const [prefixDraft, setPrefixDraft, prefixDirty] = useSettingsDraft(prefix);
  const [maxItemsInput, setMaxItemsInput, maxItemsDirty] = useSettingsDraft(
    String(maxItems)
  );
  // 2フィールド共有の単一エラー文字列。タブコンポーネントのローカル state のため、
  // 他タブへ切り替える（＝このコンポーネントが unmount される）と自動的に破棄される
  // （詳細は CLAUDE.md「設定画面」節の「エラー状態の保持場所」を参照）。
  const [error, setError] = useState<string | null>(null);

  const isDirty = prefixDirty || maxItemsDirty;

  // 直列保存で打ち切り式にする理由は SystemCommandSettings と同じ
  // （error は2フィールド共有の単一エラー文字列のため、後続の成功で先行フィールドの
  // 失敗表示を上書き・消去しないようにするため）。
  const handleSave = async () => {
    setError(null);
    if (prefixDirty) {
      const err = await onChangePrefix(prefixDraft);
      if (err) {
        setError(err);
        return;
      }
    }
    if (maxItemsDirty) {
      const err = await onChangeMaxItems(Number(maxItemsInput));
      if (err) setError(err);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <FeatureToggle
        label="クリップボード履歴"
        description="クリップボードの変化を監視し、検索ボックスに「/」＋呼び出しキーワードを入力すると履歴を呼び出せます。"
        checked={enabled}
        onChange={onToggle}
      />
      <SettingsIndent>
        <div>
          <div className="text-sm font-medium text-gray-800 mb-1">呼び出しキーワード</div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-400">/</span>
            <input
              type="text"
              value={prefixDraft}
              onChange={(e) => setPrefixDraft(e.target.value)}
              className={draftInputClassName(prefixDirty)}
            />
          </div>
          <div className="text-xs text-gray-400 mt-1">
            「/」が自動的に先頭に付与されます
          </div>
        </div>
        <div>
          <div className="text-sm font-medium text-gray-800 mb-1">最大保持件数</div>
          <input
            type="number"
            min={1}
            max={200}
            value={maxItemsInput}
            onChange={(e) => setMaxItemsInput(e.target.value)}
            className={draftInputClassName(maxItemsDirty)}
          />
          <div className="text-xs text-gray-400 mt-1">1〜200件</div>
        </div>
        <SettingsSaveBar isDirty={isDirty} onSave={handleSave} error={error} />
      </SettingsIndent>
    </div>
  );
}
