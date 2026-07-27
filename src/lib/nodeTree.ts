// 隣接リスト（parentId方式）で管理されるノード配列（FavoriteNode がその代表例。
// 「ピン止め・お気に入り・メモ機能」節を参照）を、フォルダ見出し・アイテム行を
// 問わず「同じ parentId の中では order フィールドの昇順に並ぶ」という前提のもと、
// 深さ優先でフラットな表示順に変換するための汎用ユーティリティ。
//
// 現状これを使うのは /favorite モードの一覧（フォルダ階層あり）・登録ダイアログの
// 保存先フォルダプルダウン（フォルダのみ）の2箇所だが、いずれも「隣接リストを
// order順にグループ化 → 深さ優先で辿る」という同じ骨格を持つため、ここに共通化する。
// ピン止めは現状フラット構造のみで本ユーティリティを必要としないが、将来ツリー化
// する場合も同じ骨格をそのまま使える（お気に入り専用の概念——folderHasMatch 等の
// フィルタリング判定や FavoriteTreeRow への変換——はここには含めず、呼び出し側
// （useSearch.ts）に残す）。

/** `groupNodesByParent`/`walkGroupedTree` が要求する最小限のノード形。 */
export interface TreeNode {
  id: string;
  parentId: string;
  order: number;
}

/**
 * ノード配列を parentId ごとにグループ化し、各グループを order 昇順にソートして返す。
 * フォルダ・ファイル（あるいは将来追加される他の type）を問わず、同じ親の中では
 * order フィールドの順に並べる、という前提に基づく（1つの親の中で型ごとに別々の
 * 順序空間を持たせない）。
 */
export function groupNodesByParent<T extends TreeNode>(
  nodes: T[]
): Map<string, T[]> {
  const byParent = new Map<string, T[]>();
  for (const node of nodes) {
    const list = byParent.get(node.parentId) ?? [];
    list.push(node);
    byParent.set(node.parentId, list);
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => a.order - b.order);
  }
  return byParent;
}

/**
 * `groupNodesByParent` の戻り値を `rootId` から深さ優先で辿り、ノードを1件ずつ
 * `visit` コールバックへ渡す。`visit` が `{ skipChildren: true }` を返したノードは
 * 子孫を辿らない（フィルタでヒットしなかったフォルダ・折りたたまれたフォルダを
 * 除外する用途に使う）。`visit` 自体は行の生成（push）を一切行わず、呼び出し側の
 * クロージャに委ねる（フォルダ見出し＋アイテム行のような表示専用の形へ変換する
 * 処理は、ここではなく利用側で行う）。
 *
 * 循環参照は通常の操作では発生し得ないが、防御的に探索深さの上限を設ける。
 */
export function walkGroupedTree<T extends { id: string }>(
  byParent: Map<string, T[]>,
  rootId: string,
  visit: (node: T, depth: number) => { skipChildren?: boolean } | void,
  maxDepth = 64
): void {
  const walk = (parentId: string, depth: number) => {
    if (depth > maxDepth) return;
    for (const node of byParent.get(parentId) ?? []) {
      const result = visit(node, depth);
      if (!result?.skipChildren) {
        walk(node.id, depth + 1);
      }
    }
  };
  walk(rootId, 0);
}
