import { useState } from "react";
import { FeatureToggle } from "./FeatureToggle";
import { SettingsIndent } from "./SettingsIndent";
import { SettingsSaveBar } from "./SettingsSaveBar";
import { draftInputClassName } from "./settingsFieldStyles";
import { useSettingsDraft } from "../hooks/useSettingsDraft";

// クリップボード（ClipboardSettings.tsx）・最近使ったファイル（RecentFilesSettings.tsx）
// と同じ構成（機能ON/OFFトグル＋呼び出しキーワード欄＋タブ末尾の単一保存ボタン）に
// 揃えた「お気に入り」タブ。フィールドがキーワード1つのみのため、直列保存の打ち切り
// 判定（他タブに存在する複数フィールド共有エラーの考慮）は不要。
export function FavoriteSettings({
  enabled,
  onToggle,
  keyword,
  onChangeKeyword,
}: {
  enabled: boolean;
  onToggle: (checked: boolean) => void;
  keyword: string;
  onChangeKeyword: (keyword: string) => Promise<string | null>;
}) {
  const [keywordDraft, setKeywordDraft, keywordDirty] = useSettingsDraft(keyword);
  // タブコンポーネントのローカル state のため、他タブへ切り替える（＝このコンポーネントが
  // unmount される）と自動的に破棄される（詳細は CLAUDE.md「設定画面」節の
  // 「エラー状態の保持場所」を参照）。
  const [error, setError] = useState<string | null>(null);

  // 入力値を変更した時点でエラー表示をクリアする。保存失敗後に値を編集し直しても
  // （元の値に戻した場合を含む）古いエラーメッセージが残り続けないようにするため
  // （詳細は CLAUDE.md「設定画面」節の「エラー状態の保持場所」を参照）。
  const handleKeywordChange = (value: string) => {
    setKeywordDraft(value);
    setError(null);
  };

  const handleSave = async () => {
    setError(null);
    if (keywordDirty) {
      const err = await onChangeKeyword(keywordDraft);
      setError(err);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <FeatureToggle
        label="お気に入り"
        description="検索結果の★アイコンでファイルを登録し、検索ボックスに「/」＋呼び出しキーワードを入力すると一覧を呼び出せます。"
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
              onChange={(e) => handleKeywordChange(e.target.value)}
              className={draftInputClassName(keywordDirty)}
            />
          </div>
          <div className="text-xs text-gray-400 mt-1">
            「/」が自動的に先頭に付与されます
          </div>
        </div>
        <SettingsSaveBar isDirty={keywordDirty} onSave={handleSave} error={error} />
      </SettingsIndent>
    </div>
  );
}
