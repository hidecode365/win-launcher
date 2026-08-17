import type { FavoriteNode, MemoDocument } from "../types";
import { MEMO_FOLDER_ID } from "../types";
import { groupNodesByParent, walkGroupedTree } from "./nodeTree";

export type MemoVisibleRow = { node: FavoriteNode; depth: number };

export function buildMemoVisibleRows(
  nodes: FavoriteNode[],
  documents: Record<string, MemoDocument>,
  filterText: string
): MemoVisibleRow[] {
  const term = filterText.trim().toLowerCase();
  const grouped = groupNodesByParent(nodes);
  const included = new Set<string>();

  if (term) {
    const byId = new Map(nodes.map((node) => [node.id, node]));
    for (const node of nodes) {
      if (node.type !== "memo") continue;
      const document = documents[node.id];
      const searchable = `${node.name}\n${document?.draft?.content ?? document?.content ?? ""}`.toLowerCase();
      if (!searchable.includes(term)) continue;
      included.add(node.id);
      let parentId = node.parentId;
      while (parentId !== MEMO_FOLDER_ID) {
        const parent = byId.get(parentId);
        if (!parent) break;
        included.add(parent.id);
        parentId = parent.parentId;
      }
    }
  }

  const rows: MemoVisibleRow[] = [];
  walkGroupedTree(grouped, MEMO_FOLDER_ID, (node, depth) => {
    if (term && !included.has(node.id)) return { skipChildren: true };
    rows.push({ node, depth });
    if (term) return undefined;
    return node.type === "folder" ? { skipChildren: node.collapsed } : undefined;
  });
  return rows;
}
