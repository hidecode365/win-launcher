import { ReactNode } from "react";

// 複数の設定項目を1グループとしてまとめる場合の共通表現（CLAUDE.md「設定画面」節の
// 「設定グループの表現」を参照）。グループ名の小見出し＋直下の水平区切り線で、以降の
// 項目がそのグループに属することを示す。カード背景や左端の縦ラインは使わない。
//
// - 要素順は「小見出し → 区切り線 → 説明文（任意） → 設定項目」。区切り線は小見出しの
//   直下（数px程度）に配置し、「見出しに引かれた下線」として認識できるようにする
//   （説明文や設定項目との間に置くと、見出しの下線ではなく単なる仕切り線に見えるため）
// - 区切り線は `<hr>` に頼らず、border-t を持つ div で明示的に描画する（`<hr>` は
//   Tailwind の preflight リセットの影響で意図した太さ・色で描画されないことがあり、
//   実際に視認できないほど薄くなる事例があったため）。色も通常の項目間セパレータ
//   （border-gray-200/60）より濃い border-gray-300 にし、確実に視認できる濃さにする
// - 小見出しはサイズ・太さを通常の項目ラベル（text-sm font-medium text-gray-800）と
//   揃え、色のみ一段抑える（text-gray-700）。「項目ラベルより目立たなくする」のではなく
//   「項目ラベルとは役割が違う」ことが伝わるようにするための、控えめな差別化に留める
// - グループ開始前の余白は、通常の項目間の余白（呼び出し側の flex gap。多くの場合
//   gap-4 = 16px）より明確に広くする（目安2倍）。呼び出し側の gap 値に依存せず、この
//   コンポーネント自身が mt-8（32px）を持つことで担保する
// - description は省略可能。グループの意味が自明でない場合にのみ使う（例えば
//   「このタブでしか見ないユーザーには伝わらない内部的な補足」のような説明は付けない）
// - `className`（既定 "mt-8"）は外側ラッパーの上マージン等を、`contentClassName`
//   （既定 "mt-3 flex flex-col gap-3"）は子要素コンテナのレイアウトを上書きするための
//   任意 prop。タブの先頭に来るグループで余白が不要な場合（例: 全般タブの「起動
//   ホットキー」）や、内部にスクロール可能な一覧を持つため flex-1/min-h-0 を伝播させたい
//   場合（例: ファイル検索タブの「検索フォルダ」）に使う。SettingsIndent の className
//   prop と同じ考え方
export function SettingsGroup({
  title,
  description,
  children,
  className = "mt-8",
  contentClassName = "mt-3 flex flex-col gap-3",
}: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <div className={className}>
      <div className="text-sm font-medium text-gray-700">{title}</div>
      <div className="mt-1.5 border-t border-gray-300" />
      {description && (
        <div className="text-xs text-gray-400 mt-3">{description}</div>
      )}
      <div className={contentClassName}>{children}</div>
    </div>
  );
}
