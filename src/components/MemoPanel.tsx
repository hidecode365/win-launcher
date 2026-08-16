import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FavoriteNode, MemoDocument } from "../types";
import { groupNodesByParent, walkGroupedTree } from "../lib/nodeTree";
import { ResizableSplitPane } from "./ResizableSplitPane";
import { FileIcon, FolderChevron, FOLDER_ICON_PATH } from "./FavoriteTreeVisuals";

export function MemoPanel({
  nodes, documents, filterText, selectedId, document, onSelect, onContentChange, onSave,
  initialLeftWidth, onResizeEnd, onToggleFolder, onMoveSelection, focusEditor, onEditorFocused,
}: {
  nodes: FavoriteNode[];
  documents: Record<string, MemoDocument>;
  filterText: string;
  selectedId: string | null;
  document: MemoDocument | null;
  onSelect: (id: string, focusEditor: boolean) => void;
  onContentChange: (content: string) => void;
  onSave: () => Promise<void>;
  initialLeftWidth: number;
  onResizeEnd: (width: number) => void;
  onToggleFolder: (id: string, collapsed: boolean) => void;
  onMoveSelection: (direction: 1 | -1) => void;
  focusEditor?: boolean;
  onEditorFocused?: () => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [saveFeedback, setSaveFeedback] = useState(false);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveWithFeedback = useCallback(async () => {
    await onSave();
    setSaveFeedback(true);
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    feedbackTimerRef.current = setTimeout(() => setSaveFeedback(false), 2000);
  }, [onSave]);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.key.toLowerCase() === "s") {
        event.preventDefault();
        event.stopImmediatePropagation();
        saveWithFeedback().catch(console.error);
      } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        event.stopImmediatePropagation();
        onMoveSelection(event.key === "ArrowDown" ? 1 : -1);
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [onMoveSelection, saveWithFeedback]);
  // 矢印キーでの選択移動では本文へフォーカスを奪わない。明示的なクリック／管理画面からの遷移だけが指定する。
  useEffect(() => { if (focusEditor && selectedId) { textareaRef.current?.focus(); onEditorFocused?.(); } }, [focusEditor, selectedId, onEditorFocused]);
  const visible = useMemo(() => {
    const term = filterText.toLowerCase();
    const byParent = groupNodesByParent(nodes);
    const rows: Array<{ node: FavoriteNode; depth: number }> = [];
    walkGroupedTree(byParent, "__memo__", (node, depth) => {
      if (node.type === "folder") { rows.push({ node, depth }); return term ? undefined : { skipChildren: node.collapsed }; }
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
        <button key={node.id} type="button" onClick={() => onToggleFolder(node.id, !node.collapsed)} className="flex w-full items-center py-2 pr-3 text-left text-xs font-medium text-gray-500 hover:bg-gray-50" style={{ paddingLeft: 12 + depth * 16 }}><FolderChevron collapsed={node.collapsed} /><svg className="ml-1.5 mr-2 h-4 w-4 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24"><path d={FOLDER_ICON_PATH} /></svg><span className="truncate">{node.name}</span></button> :
        <button key={node.id} type="button" onMouseEnter={() => onSelect(node.id, false)} onClick={() => onSelect(node.id, true)} className={`flex w-full items-center py-2 pr-3 text-left text-sm ${node.id === selectedId ? "bg-blue-500 text-white" : "text-gray-700 hover:bg-gray-100"}`} style={{ paddingLeft: 12 + depth * 16 }}><FileIcon className="mr-2 h-4 w-4 flex-shrink-0" /><span className="truncate">{node.name}</span></button>
      )}
    </div>}
    right={<div className="h-full min-w-0 flex flex-col p-3 gap-2">
      <div className="flex items-center justify-between gap-2"><span className="flex items-center gap-2 text-sm text-gray-500">{document ? <><span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">v{document.revision}</span><span className="text-xs">{saveFeedback ? "保存しました" : `${new Date(document.savedAt).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}保存`}</span></> : "メモを選択してください"}</span><button type="button" disabled={!document} onClick={() => saveWithFeedback().catch(console.error)} className="px-3 py-1 text-xs rounded bg-blue-500 text-white disabled:opacity-50">保存</button></div>
      <textarea ref={textareaRef} disabled={!document} value={content} onChange={(event) => onContentChange(event.target.value)} className="flex-1 min-h-0 w-full resize-none rounded border border-gray-200 p-2 text-sm outline-none focus:ring-1 focus:ring-blue-400 disabled:bg-gray-50" placeholder="メモを選択してください" />
    </div>}
  />;
}
