// 選択状態を「識別子（key）を持つ意図（intent）」として持ち、現在の一覧から
// 毎回導出する（R-1の原則。CLAUDE.md「検索結果一覧の選択状態・行構造」節を参照）。
// 元は useSearch.ts 内にのみ定義されていたが、お気に入り編集ビュー
// （useFavoriteEditSelection.ts）が /favorite ブラウジングとは独立した選択
// ドメインとして同じ方式を採用するにあたり、状態管理そのものは共有せず、
// 型・純粋関数のみをここへ切り出して共有する（状態を共有すると2つの別ドメインの
// 選択が誤って混ざりかねないため、純粋なアルゴリズム部分だけを共通化する）。

export type SelectIntent =
  | { type: "top" }
  | { type: "key"; key: string; expiresAt?: number };

// resolveSelected が受け取る「選択対象になりうる一覧」の共通形。ResultRow・
// FavoriteTreeRow・クリップボードエントリから変換したオブジェクトも、この形さえ
// 満たせば対象にできる。
export interface SelectableItem {
  key: string;
}

// 純粋関数：intent と現在の行一覧から選択インデックスを導出する。
// - intent.type === "top" のときは常に 0
// - intent.type === "key" のとき、items 内に一致する key があればそのインデックス。
//   無ければ fallback（＝直前に導出できた選択インデックス）をそのまま返す
//   （「見つからない」は「1行目へリセットする理由」ではなく「今探している対象が
//   まだ一覧に反映されていないだけ」を意味するため、見つかるかタイムアウトする
//   まで現在の表示をそのまま維持する）
export function resolveSelected(
  intent: SelectIntent,
  items: SelectableItem[],
  fallback: number
): number {
  if (intent.type === "top") return 0;
  const index = items.findIndex((item) => item.key === intent.key);
  return index === -1 ? fallback : index;
}

// 復元待ち（intent.type === "key" かつ expiresAt 付き）が一定時間 items 上で
// 解決しない場合にあきらめるまでの猶予（ms）。
export const SELECT_INTENT_TIMEOUT_MS = 1000;
