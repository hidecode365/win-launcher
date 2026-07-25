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
        <button
          type="button"
          onClick={onSave}
          disabled={!isDirty}
          className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed"
        >
          保存
        </button>
        {isDirty && (
          <span className="text-xs text-amber-600">未保存の変更があります</span>
        )}
      </div>
      {error && <div className="text-xs text-red-500 mt-1">{error}</div>}
    </div>
  );
}
