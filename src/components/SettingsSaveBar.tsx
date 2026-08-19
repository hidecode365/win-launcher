import { ActionButton } from "./ActionButton";

// テキスト入力・数値入力・タグ入力による設定をまとめて保存する、タブ末尾に配置する
// 単一の保存UI（CLAUDE.md「設定画面」節の「保存モデル」を参照）。未保存の変更がある
// 場合のみボタンを活性化し、「未保存の変更があります」を表示する。保存失敗時のエラー
// メッセージもここに集約表示する。
export function SettingsSaveBar({
  isDirty,
  onSave,
  error,
}: {
  isDirty: boolean;
  onSave: () => void;
  error?: string | null;
}) {
  return (
    <div className="pt-1">
      <div className="flex items-center gap-3">
        <ActionButton
          size="standard"
          onClick={onSave}
          disabled={!isDirty}
        >
          保存
        </ActionButton>
        {isDirty && (
          <span className="text-xs text-amber-600">未保存の変更があります</span>
        )}
      </div>
      {error && <div className="text-xs text-red-500 mt-1">{error}</div>}
    </div>
  );
}
