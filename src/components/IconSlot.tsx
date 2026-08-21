import type { ReactNode } from "react";
import { Tooltip } from "./Tooltip";

// 行末アイコン群（ピン・★・フォルダ作成・削除・件数バッジ等）の「箱」を一括
// 管理する共通ラッパー。経緯・原則は docs/internal-design/favorites-ui-iconography.md
// 「行内アイコンの共通ラッパー化（IconSlot）」節を参照。
//
// 呼び出し元は、これらを並べる1つのflexコンテナに `gap-2` を指定し、
// 個々の要素へ `ml-2` 等の個別マージンを持たせない前提で使う（マージンの
// 付け忘れという人為的ミスの余地をなくすため。IconSlot自体はマージンを
// 持たない）。
//
// interactive=true（ピン・★・フォルダ作成・削除）：ホバー時の円形背景
// （非選択行は hover:bg-black/[6%]、選択中の青ハイライト行は
// hover:bg-white/20）とテキスト色（選択中は白、非選択はgray-600）を、
// p-1 込みの「箱」自体（実質24×24px相当）に適用した実際のボタンとして
// 描画する。Tooltip文言（`tooltip` prop）を渡した場合のみ Tooltip でラップする。
//
// interactive=false（件数バッジ等の表示専用要素）：ホバー反応・Tooltipは
// 持たないが、同じ「箱」サイズ（p-1込み）を持つ透明なラッパーとして描画する。
// 箱自体は背景・文字色を一切持たないため、中身（children）自体の見た目
// （件数バッジの塗りつぶし円・文字色等）はそのまま保たれる。これにより、
// 「ボタン系の隣にあるかどうか」に関わらず、要素の実際の占有幅（＝隣接要素との
// 実際の隙間）が統一される。
//
// 箱には常に `relative` と、明示的な固定サイズ（`w-6 h-6`＝24px、border-box）を
// 付与する。以前は幅・高さを指定せず、in-flowの子要素（w-4 h-4のSVG等）の
// 実寸から `p-1` を含めて自動的に24×24へサイズが決まる想定だったが、件数バッジ
// 側の子要素を `absolute inset-0`（箱のpaddingを無視して外形いっぱいに広がる
// ための指定）に変更した際、絶対配置要素は通常のレイアウト計算から除外される
// ため、箱には「サイズを決める根拠となる in-flow の中身」が無くなり、
// `p-1` の分（8px）だけの大きさに縮んでしまう不具合が発生した（実測で
// W=H=circle=8 と判明。詳細は docs/internal-design/favorites-ui-iconography.md
// 「行内アイコンの共通ラッパー化（IconSlot）」節の経緯を参照）。
// `w-6 h-6` を明示することで、中身が in-flow か absolute かに関わらず箱自体の
// 外形サイズが常に24×24に固定される（`absolute inset-0` の子要素は、箱の
// border-box全体＝24×24いっぱいに広がる。in-flowの子要素は `p-1` を差し引いた
// 内側の16×16に収まる）。
export function IconSlot({
  children,
  interactive,
  selected,
  tooltip,
  onClick,
}: {
  children: ReactNode;
  interactive: boolean;
  selected: boolean;
  tooltip?: string;
  onClick?: () => void;
}) {
  const boxClassName = `relative flex-shrink-0 w-6 h-6 rounded-full p-1 inline-flex items-center justify-center transition-colors ${
    interactive
      ? selected
        ? "hover:bg-white/20 text-white"
        : "hover:bg-black/[6%] text-gray-600"
      : ""
  }`;

  if (!interactive) {
    return (
      <span className={boxClassName}>
        {children}
      </span>
    );
  }

  const button = (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      className={boxClassName}
    >
      {children}
    </button>
  );

  return tooltip ? (
    <Tooltip label={tooltip} className="flex-shrink-0">
      {button}
    </Tooltip>
  ) : (
    button
  );
}
