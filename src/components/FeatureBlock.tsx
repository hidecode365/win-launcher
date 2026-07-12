import { ReactNode } from "react";
import { FeatureToggle } from "./FeatureToggle";

// 「計算・変換」カテゴリなど、複数の機能を1つのカテゴリ内で並べる設定画面向けの
// 再利用可能な単位。見出し（主設定チェックボックス）＋従属設定（children）をまとめ、
// 主設定が OFF のとき children をグレーアウトし操作不可にする。
// 今後このカテゴリに新機能（単位変換等）を追加する場合も同じ型を踏襲する。
export function FeatureBlock({
  label,
  description,
  checked,
  onChange,
  children,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3">
      <FeatureToggle
        label={label}
        description={description}
        checked={checked}
        onChange={onChange}
      />
      {children && (
        <div
          className={`pl-7 flex flex-col gap-3 transition-opacity ${
            checked ? "" : "opacity-40 pointer-events-none"
          }`}
          aria-disabled={!checked}
        >
          {children}
        </div>
      )}
    </div>
  );
}
