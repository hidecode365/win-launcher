import { ReactNode } from "react";
import { FeatureToggle } from "./FeatureToggle";
import { SettingsIndent } from "./SettingsIndent";

// 「計算・変換」カテゴリなど、複数の機能を1つのカテゴリ内で並べる設定画面向けの
// 再利用可能な単位。見出し（主設定チェックボックス）＋従属設定（children）をまとめ、
// 主設定が OFF のとき children をグレーアウトし操作不可にする。インデント自体は
// 共通コンポーネント SettingsIndent に委譲する（詳細は CLAUDE.md「設定画面」節を参照）。
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
        <SettingsIndent disabled={!checked} className="flex flex-col gap-3">
          {children}
        </SettingsIndent>
      )}
    </div>
  );
}
