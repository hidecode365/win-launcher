import { ReactNode } from "react";

// 設定項目1行の共通レイアウト：ラベル（左、固定幅）＋設定コントロール（右）を
// 横並びにし、直下に補足説明・エラーメッセージを添える。各タブで縦積み
// （ラベル→コントロール→補足の3段）だった単純な1項目1コントロールの行を、
// デスクトップ設定画面らしい横並びへ統一するための共有部品（SettingsGroup が
// 「複数項目をまとめる見出し」を担うのに対し、こちらは「1項目1行」の粒度を担う）。
//
// - ラベル列は `w-36`（9文字程度の「呼び出しキーワード」まで折り返さない幅）で
//   固定し、`flex-shrink-0` で潰れないようにする。同じタブ内で複数行が続く場合
//   （SystemCommandSettings の3コマンド等）、コントロールの開始位置が縦に揃う
// - `muted` を渡すと、ラベルを主要項目（`font-medium text-gray-800`）より一段
//   弱い見た目（`text-gray-700`）にする。低頻度の詳細設定（例:
//   FileSearchSettings の「詳細設定」内）向け
// - `hint`（補足説明）・`error`（エラーメッセージ）はどちらも省略可。両方渡された
//   場合は補足説明を先に表示する
export function SettingsField({
  label,
  hint,
  error,
  muted = false,
  children,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  muted?: boolean;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-3">
        <div
          className={`w-36 flex-shrink-0 text-sm ${
            muted ? "text-gray-700" : "font-medium text-gray-800"
          }`}
        >
          {label}
        </div>
        <div className="flex items-center gap-1.5">{children}</div>
      </div>
      {hint && <div className="text-xs text-gray-400 mt-1">{hint}</div>}
      {error && <div className="text-xs text-red-500 mt-1">{error}</div>}
    </div>
  );
}
