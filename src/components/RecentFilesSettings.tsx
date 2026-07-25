import { useState } from "react";
import { ExtensionFilterMode, RecentDisplaySettings } from "../types";
import { ExtensionFilterEditor } from "./ExtensionFilterEditor";
import { FeatureToggle } from "./FeatureToggle";
import { SettingsGroup } from "./SettingsGroup";
import { SettingsIndent } from "./SettingsIndent";
import { SettingsSaveBar } from "./SettingsSaveBar";
import { draftInputClassName } from "./settingsFieldStyles";
import { useSettingsDraft } from "../hooks/useSettingsDraft";
import { arraysEqual } from "../lib/arrayUtils";

export function RecentFilesSettings({
  enabled,
  onToggle,
  keyword,
  onChangeKeyword,
  maxAgeDays,
  onChangeMaxAgeDays,
  maxResults,
  onChangeMaxResults,
  includeFolders,
  extensionFilterMode,
  blacklistExtensions,
  whitelistExtensions,
  onSaveDisplaySettings,
}: {
  enabled: boolean;
  onToggle: (checked: boolean) => void;
  keyword: string;
  onChangeKeyword: (keyword: string) => Promise<string | null>;
  maxAgeDays: number;
  onChangeMaxAgeDays: (maxAgeDays: number) => Promise<string | null>;
  maxResults: number;
  onChangeMaxResults: (maxResults: number) => Promise<string | null>;
  includeFolders: boolean;
  extensionFilterMode: ExtensionFilterMode;
  blacklistExtensions: string[];
  whitelistExtensions: string[];
  onSaveDisplaySettings: (
    detail: RecentDisplaySettings
  ) => Promise<string | null>;
}) {
  const [keywordDraft, setKeywordDraft, keywordDirty] = useSettingsDraft(keyword);
  const [maxAgeDaysInput, setMaxAgeDaysInput, maxAgeDaysDirty] = useSettingsDraft(
    String(maxAgeDays)
  );
  const [maxResultsInput, setMaxResultsInput, maxResultsDirty] = useSettingsDraft(
    String(maxResults)
  );

  // 拡張子フィルタリング（モード・ブラックリスト・ホワイトリスト）はタグ入力のため
  // タブ末尾の一括保存対象。「フォルダを対象に含める」はトグルのため即時保存とし、
  // このドラフト管理の対象には含めない（下記 handleToggleIncludeFolders を参照）。
  const [filterModeDraft, setFilterModeDraft, filterModeDirty] =
    useSettingsDraft<ExtensionFilterMode>(extensionFilterMode);
  const [blacklistDraft, setBlacklistDraft, blacklistDirty] = useSettingsDraft(
    blacklistExtensions,
    arraysEqual
  );
  const [whitelistDraft, setWhitelistDraft, whitelistDirty] = useSettingsDraft(
    whitelistExtensions,
    arraysEqual
  );

  const activeExtensionsDraft =
    filterModeDraft === "blacklist" ? blacklistDraft : whitelistDraft;
  const setActiveExtensionsDraft =
    filterModeDraft === "blacklist" ? setBlacklistDraft : setWhitelistDraft;

  const extensionFilterDirty = filterModeDirty || blacklistDirty || whitelistDirty;
  const isDirty =
    keywordDirty || maxAgeDaysDirty || maxResultsDirty || extensionFilterDirty;

  // 4フィールド共有の単一エラー文字列。タブコンポーネントのローカル state のため、
  // 他タブへ切り替える（＝このコンポーネントが unmount される）と自動的に破棄される
  // （詳細は CLAUDE.md「設定画面」節の「エラー状態の保持場所」を参照）。
  const [error, setError] = useState<string | null>(null);

  // 「フォルダを対象に含める」はトグルのため、操作した時点で即時保存する
  // （CLAUDE.md「設定画面」節の「保存モデル」を参照）。拡張子フィルタリングの
  // ドラフト（未保存の可能性がある）は巻き込まず、保存済みの現在値を使う。
  const handleToggleIncludeFolders = async (checked: boolean) => {
    const err = await onSaveDisplaySettings({
      includeFolders: checked,
      extensionFilterMode,
      blacklistExtensions,
      whitelistExtensions,
    });
    setError(err);
  };

  // 直列保存で打ち切り式にする理由は SystemCommandSettings/ClipboardSettings と同じ
  // （error は4フィールド共有の単一エラー文字列のため）。
  const handleSave = async () => {
    setError(null);
    if (keywordDirty) {
      const err = await onChangeKeyword(keywordDraft);
      if (err) {
        setError(err);
        return;
      }
    }
    if (maxAgeDaysDirty) {
      const err = await onChangeMaxAgeDays(Number(maxAgeDaysInput));
      if (err) {
        setError(err);
        return;
      }
    }
    if (maxResultsDirty) {
      const err = await onChangeMaxResults(Number(maxResultsInput));
      if (err) {
        setError(err);
        return;
      }
    }
    if (extensionFilterDirty) {
      const err = await onSaveDisplaySettings({
        includeFolders,
        extensionFilterMode: filterModeDraft,
        blacklistExtensions: blacklistDraft,
        whitelistExtensions: whitelistDraft,
      });
      if (err) setError(err);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <FeatureToggle
        label="最近使ったファイル"
        description="検索ボックスに「/」＋呼び出しキーワードを入力すると、Windows の Recent フォルダから最近使ったファイルの一覧を呼び出せます。"
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
              value={keywordDraft}
              onChange={(e) => setKeywordDraft(e.target.value)}
              className={draftInputClassName(keywordDirty)}
            />
          </div>
          <div className="text-xs text-gray-400 mt-1">
            「/」が自動的に先頭に付与されます
          </div>
        </div>
        <div>
          <div className="text-sm font-medium text-gray-800 mb-1">保持期間（日）</div>
          <input
            type="number"
            min={1}
            max={3650}
            value={maxAgeDaysInput}
            onChange={(e) => setMaxAgeDaysInput(e.target.value)}
            className={draftInputClassName(maxAgeDaysDirty)}
          />
          <div className="text-xs text-gray-400 mt-1">
            最終アクセス日時がこの日数より前のファイルは一覧に表示されません（1〜3650日）
          </div>
        </div>
        <div>
          <div className="text-sm font-medium text-gray-800 mb-1">最大表示件数</div>
          <input
            type="number"
            min={1}
            max={200}
            value={maxResultsInput}
            onChange={(e) => setMaxResultsInput(e.target.value)}
            className={draftInputClassName(maxResultsDirty)}
          />
          <div className="text-xs text-gray-400 mt-1">1〜200件</div>
        </div>
        <SettingsGroup title="表示対象設定">
          <FeatureToggle
            label="フォルダを対象に含める"
            description="OFFの場合、リンク先がフォルダのショートカットは一覧から除外されます。"
            checked={includeFolders}
            onChange={handleToggleIncludeFolders}
          />
          <div>
            <div className="text-sm font-medium text-gray-800 mb-2">拡張子フィルタリング</div>
            <ExtensionFilterEditor
              mode={filterModeDraft}
              onModeChange={setFilterModeDraft}
              extensions={activeExtensionsDraft}
              onAddExtension={(ext) =>
                setActiveExtensionsDraft([...activeExtensionsDraft, ext])
              }
              onRemoveExtension={(ext) =>
                setActiveExtensionsDraft(activeExtensionsDraft.filter((e) => e !== ext))
              }
            />
          </div>
        </SettingsGroup>
        <SettingsSaveBar isDirty={isDirty} onSave={handleSave} error={error} />
      </SettingsIndent>
    </div>
  );
}
