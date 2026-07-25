import { useState } from "react";
import { FeatureToggle } from "./FeatureToggle";
import { SettingsIndent } from "./SettingsIndent";
import { SettingsSaveBar } from "./SettingsSaveBar";
import { draftInputClassName } from "./settingsFieldStyles";
import { useSettingsDraft } from "../hooks/useSettingsDraft";
import { SystemCommandAction, SystemCommandKeywordErrors } from "../types";

const EMPTY_ERRORS: SystemCommandKeywordErrors = {
  shutdown: null,
  restart: null,
  sleep: null,
};

function KeywordField({
  label,
  value,
  onChange,
  isDirty,
  error,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  isDirty: boolean;
  error: string | null;
}) {
  return (
    <div>
      <div className="text-sm font-medium text-gray-800 mb-1">{label}</div>
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-400">/</span>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={draftInputClassName(isDirty)}
        />
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
}: {
  enabled: boolean;
  onToggle: (checked: boolean) => void;
  shutdownKeyword: string;
  restartKeyword: string;
  sleepKeyword: string;
  onChangeKeyword: (
    command: SystemCommandAction,
    keyword: string
  ) => Promise<string | null>;
}) {
  const [shutdownDraft, setShutdownDraft, shutdownDirty] =
    useSettingsDraft(shutdownKeyword);
  const [restartDraft, setRestartDraft, restartDirty] =
    useSettingsDraft(restartKeyword);
  const [sleepDraft, setSleepDraft, sleepDirty] = useSettingsDraft(sleepKeyword);

  // コマンドごとに独立したエラー表示。タブコンポーネントのローカル state のため、
  // 他タブへ切り替える（＝このコンポーネントが unmount される）と自動的に破棄される
  // （詳細は CLAUDE.md「設定画面」節の「エラー状態の保持場所」を参照）。
  const [errors, setErrors] = useState<SystemCommandKeywordErrors>(EMPTY_ERRORS);

  const isDirty = shutdownDirty || restartDirty || sleepDirty;

  // 直列で1件ずつ保存する。あるコマンドの保存が失敗した時点で打ち切り、そのエラー
  // 表示を維持する（後続コマンドの保存成功が先行コマンドのエラー表示を巻き戻さない
  // ようにするため。3コマンドの `errors` はコマンドごとに独立しているが、保存自体は
  // 「未保存の変更があります」を1つの状態として扱うため打ち切り順にしている）。
  const handleSave = async () => {
    if (shutdownDirty) {
      const err = await onChangeKeyword("shutdown", shutdownDraft);
      setErrors((prev) => ({ ...prev, shutdown: err }));
      if (err) return;
    }
    if (restartDirty) {
      const err = await onChangeKeyword("restart", restartDraft);
      setErrors((prev) => ({ ...prev, restart: err }));
      if (err) return;
    }
    if (sleepDirty) {
      const err = await onChangeKeyword("sleep", sleepDraft);
      setErrors((prev) => ({ ...prev, sleep: err }));
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <FeatureToggle
        label="システムコマンド"
        description="「/」に続けてキーワードを入力するとシステムコマンドを実行できるようにします（先頭の「/」は固定の区切り文字で、変更できません）。"
        checked={enabled}
        onChange={onToggle}
      />
      <SettingsIndent>
        <KeywordField
          label="シャットダウン"
          value={shutdownDraft}
          onChange={setShutdownDraft}
          isDirty={shutdownDirty}
          error={errors.shutdown}
        />
        <KeywordField
          label="再起動"
          value={restartDraft}
          onChange={setRestartDraft}
          isDirty={restartDirty}
          error={errors.restart}
        />
        <KeywordField
          label="スリープ"
          value={sleepDraft}
          onChange={setSleepDraft}
          isDirty={sleepDirty}
          error={errors.sleep}
        />
        <SettingsSaveBar isDirty={isDirty} onSave={handleSave} />
      </SettingsIndent>
    </div>
  );
}
