// ドラフト中（未保存）のテキスト/数値入力欄を強調するための共通クラス名。
// 「設定グループの表現」節に合わせ、各タブのテキスト/数値フィールドで共有する。
export function draftInputClassName(isDirty: boolean, extra = "w-24"): string {
  return `border rounded px-2 py-1 text-sm ${extra} ${
    isDirty ? "border-amber-400 ring-1 ring-amber-200" : "border-gray-300"
  }`;
}
