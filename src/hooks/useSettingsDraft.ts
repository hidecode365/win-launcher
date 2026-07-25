import { Dispatch, SetStateAction, useEffect, useState } from "react";

// タブ末尾の単一保存ボタンで一括保存する設定項目（テキスト・数値・タグ入力）向けの
// ドラフト state 管理（CLAUDE.md「設定画面」節の「保存モデル」を参照）。
// committedValue（保存済みの値。呼び出し元の prop）が変化した時点（保存成功時、または
// タブ再マウント時の初期値）でドラフトを committedValue に同期し直す。isDirty は
// ドラフトと committedValue の差分から都度算出し、別 state としては持たない。
// 配列など参照比較では常に異なると判定される値は、第2引数に値の等価判定関数を渡す。
export function useSettingsDraft<T>(
  committedValue: T,
  isEqual: (a: T, b: T) => boolean = Object.is
): [T, Dispatch<SetStateAction<T>>, boolean] {
  const [draft, setDraft] = useState(committedValue);

  useEffect(() => {
    setDraft(committedValue);
  }, [committedValue]);

  const isDirty = !isEqual(draft, committedValue);
  return [draft, setDraft, isDirty];
}
