import type { MouseEvent, ReactNode } from "react";

// 一覧行（プレフィックスコマンド候補・Web検索行・パス貼り付け候補・
// クリップボード履歴等）の共通ルート要素。行のルートは実在の <button> ではなく
// 常に <div role="button"> にする（キーボード操作は行そのものにフォーカスを
// 当てず、検索ボックス側の keydown リスナー・↑↓キーによる選択インデックス管理で
// 完結させる設計のため。詳細は docs/design/result-list-and-selection.md
// 「結果行の DOM 構造」節・「行ルート要素のフォーカス残留によるシステムコマンド
// 誤実行」節を参照）。行の実装者がこの2点（role="button" と tabIndexを
// 付与しないこと）を毎回意識せずに済むよう、このラッパーへ一本化する。
//
// `ResultList.tsx` の `rows.map` が描画する行（pinned 等）は、内部に複数の
// 操作ボタン・ドラッグ&ドロップを持つなど個別の事情があるため、このラッパーを
// 使わず直接 `<div role="button">` を書いている。新しい一覧・候補リストを
// 追加する場合は、まずこのラッパーで足りないか検討すること。
export function SelectableRow({
  index,
  className,
  onClick,
  onMouseEnter,
  children,
}: {
  index: number;
  className: string;
  // 呼び出し元が引数を無視する（`() => void`）場合もそのまま渡せるよう、
  // MouseEvent を受け取れる型にしている（TypeScript の関数型は引数を無視する
  // 側が広い型として互換になるため、既存の呼び出し元を変更する必要はない）。
  onClick: (e: MouseEvent) => void;
  onMouseEnter: (e: MouseEvent) => void;
  children: ReactNode;
}) {
  return (
    <div
      role="button"
      data-index={index}
      className={className}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
    >
      {children}
    </div>
  );
}
