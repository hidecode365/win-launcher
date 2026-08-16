import { useEffect, useMemo, useRef } from "react";
import { FavoriteNode, MemoDocument } from "../types";
import { groupNodesByParent, walkGroupedTree } from "../lib/nodeTree";
import { ResizableSplitPane } from "./ResizableSplitPane";

export function MemoPanel({
  nodes, documents, filterText, selectedId, document, onSelect, onContentChange, onSave,
  initialLeftWidth, onResizeEnd, onOpenManagement, focusEditor, onEditorFocused,
}: {
  nodes: FavoriteNode[];
  documents: Record<string, MemoDocument>;
  filterText: string;
  selectedId: string | null;
  document: MemoDocument | null;
  onSelect: (id: string) => void;
  onContentChange: (content: string) => void;
  onSave: () => void;
  initialLeftWidth: number;
  onResizeEnd: (width: number) => void;
  onOpenManagement: () => void;
  focusEditor?: boolean;
  onEditorFocused?: () => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // 矢印キーでの選択移動では本文へフォーカスを奪わない。明示的なクリック／管理画面からの遷移だけが指定する。
  useEffect(() => { if (focusEditor && selectedId) { textareaRef.current?.focus(); onEditorFocused?.(); } }, [focusEditor, selectedId, onEditorFocused]);
  const visible = useMemo(() => {
    const term = filterText.toLowerCase();
    const byParent = groupNodesByParent(nodes);
    const rows: Array<{ node: FavoriteNode; depth: number }> = [];
    walkGroupedTree(byParent, "__memo__", (node, depth) => {
      if (node.type === "folder") { rows.push({ node, depth }); return; }
      if (node.type === "memo") {
        const content = documents[node.id];
        const searchable = `${node.name}\n${content?.draft?.content ?? content?.content ?? ""}`.toLowerCase();
        if (!term || searchable.includes(term)) rows.push({ node, depth });
      }
    });
    return rows;
  }, [nodes, documents, filterText]);
  const content = document?.draft?.content ?? document?.content ?? "";
  return <ResizableSplitPane
    className="flex-1 border-t border-gray-200/60"
    initialLeftWidth={initialLeftWidth}
    onResizeEnd={onResizeEnd}
    left={<div className="h-full overflow-y-auto">
      {visible.length === 0 ? <div className="p-4 text-sm text-gray-400">メモがありません</div> : visible.map(({ node, depth }) => node.type === "folder" ?
        <div key={node.id} className="px-3 py-2 text-xs font-medium text-gray-500" style={{ paddingLeft: 12 + depth * 16 }}>{node.name}</div> :
        <button key={node.id} type="button" onClick={() => onSelect(node.id)} className={`w-full px-3 py-2 text-left text-sm truncate ${node.id === selectedId ? "bg-blue-500 text-white" : "text-gray-700 hover:bg-gray-100"}`} style={{ paddingLeft: 12 + depth * 16 }}>{node.name}</button>
      )}
    </div>}
    right={<div className="h-full min-w-0 flex flex-col p-3 gap-2">
      <div className="flex items-center justify-between gap-2"><span className="flex items-center gap-2 text-sm text-gray-500">{document ? <><span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">v{document.revision}</span><span className="text-xs">{new Date(document.savedAt).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}保存</span></> : "メモを選択してください"}</span><div className="flex gap-2"><button type="button" onClick={onOpenManagement} className="text-xs text-gray-500 hover:text-gray-700">メモを管理</button><button type="button" disabled={!document} onClick={onSave} className="px-3 py-1 text-xs rounded bg-blue-500 text-white disabled:opacity-50">保存</button></div></div>
      <textarea ref={textareaRef} disabled={!document} value={content} onChange={(event) => onContentChange(event.target.value)} className="flex-1 min-h-0 w-full resize-none rounded border border-gray-200 p-2 text-sm outline-none focus:ring-1 focus:ring-blue-400 disabled:bg-gray-50" placeholder="メモを選択してください" />
    </div>}
  />;
}
