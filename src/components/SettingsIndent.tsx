import { ReactNode } from "react";

// 設定画面の共通レイアウト規約（CLAUDE.md「設定画面」節を参照）における
// 「親チェックボックスより一段インデントして配置する」を担う共通コンポーネント。
// タブ・機能ブロックを問わず、親トグルに従属する設定項目群はすべてこれで包む。
// `disabled` を渡すと、従属設定をグレーアウト・操作不可にする（FeatureBlock が使用）。
export function SettingsIndent({
  children,
  disabled = false,
  className = "flex flex-col gap-4",
}: {
  children: ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`pl-7 ${className} transition-opacity ${
        disabled ? "opacity-40 pointer-events-none" : ""
      }`}
      aria-disabled={disabled || undefined}
    >
      {children}
    </div>
  );
}
