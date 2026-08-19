import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FavoriteNode, MemoDocument } from "../types";
import { buildMemoVisibleRows } from "../lib/memoTree";
import { useScrollSelectedIntoView } from "../hooks/useScrollSelectedIntoView";
import { ResizableSplitPane } from "./ResizableSplitPane";
import { FileIcon, FolderChevron, FOLDER_ICON_PATH } from "./FavoriteTreeVisuals";

export function MemoPanel({
  nodes, documents, filterText, selectedId, document, onSelect, onContentChange, onSave,
  onCopyAndClose, initialLeftWidth, onResizeEnd, onToggleFolder, onMoveSelection,
  focusEditor, onEditorFocused, onEditorFocusChange,
}: {
  nodes: FavoriteNode[];
  documents: Record<string, MemoDocument>;
  filterText: string;
  selectedId: string | null;
  document: MemoDocument | null;
  onSelect: (id: string, focusEditor: boolean) => void;
  onContentChange: (content: string) => void;
  onSave: () => Promise<void>;
  onCopyAndClose: (content: string) => Promise<void>;
  initialLeftWidth: number;
  onResizeEnd: (width: number) => void;
  onToggleFolder: (id: string, collapsed: boolean) => void;
  onMoveSelection: (direction: 1 | -1) => void;
  focusEditor?: boolean;
  onEditorFocused?: () => void;
  onEditorFocusChange?: (focused: boolean) => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const selectedRowButtonRef = useRef<HTMLButtonElement>(null);
  const [saveFeedback, setSaveFeedback] = useState(false);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    setSaveFeedback(false);
  }, [selectedId]);
  useEffect(() => () => {
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
  }, []);
  const saveWithFeedback = useCallback(async () => {
    await onSave();
    setSaveFeedback(true);
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    feedbackTimerRef.current = setTimeout(() => setSaveFeedback(false), 2000);
  }, [onSave]);
  const visible = useMemo(
    () => buildMemoVisibleRows(nodes, documents, filterText),
    [nodes, documents, filterText]
  );
  const selectedIndex = visible.findIndex(({ node }) => node.id === selectedId);
  const selectedNode = visible[selectedIndex]?.node ?? null;
  const content = document?.draft?.content ?? document?.content ?? "";
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const editorFocused = event.target === textareaRef.current;
      if (editorFocused) {
        if (event.ctrlKey && event.key.toLowerCase() === "s") {
          event.preventDefault();
          event.stopImmediatePropagation();
          if (document) saveWithFeedback().catch(console.error);
        } else if (event.key === "Escape") {
          event.preventDefault();
          event.stopImmediatePropagation();
          selectedRowButtonRef.current?.focus();
        }
        return;
      }
      const target = event.target;
      const listFocused =
        target === window.document.body ||
        target instanceof HTMLInputElement ||
        (target instanceof Node && listRef.current?.contains(target));
      if (!listFocused) return;
      if (event.ctrlKey && event.key.toLowerCase() === "e" && document) {
        event.preventDefault();
        event.stopImmediatePropagation();
        textareaRef.current?.focus();
      } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        event.stopImmediatePropagation();
        onMoveSelection(event.key === "ArrowDown" ? 1 : -1);
      } else if (event.key === "Enter") {
        if (selectedNode?.type === "memo" && document) {
          event.preventDefault();
          event.stopImmediatePropagation();
          onCopyAndClose(content).catch(console.error);
        } else if (selectedNode?.type === "folder" && !filterText) {
          event.preventDefault();
          event.stopImmediatePropagation();
          onToggleFolder(selectedNode.id, !selectedNode.collapsed);
        }
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [content, document, filterText, onCopyAndClose, onMoveSelection, onToggleFolder, saveWithFeedback, selectedNode]);
  // 矢印キーでの選択移動では本文へフォーカスを奪わない。明示的なクリック／管理画面からの遷移だけが指定する。
  useEffect(() => { if (focusEditor && selectedId) { textareaRef.current?.focus(); onEditorFocused?.(); } }, [focusEditor, selectedId, onEditorFocused]);
  useScrollSelectedIntoView(listRef, selectedIndex);
  const hasMemo = nodes.some((node) => node.type === "memo");
  return <ResizableSplitPane
    className="flex-1 border-t border-gray-200/60"
    initialLeftWidth={initialLeftWidth}
    onResizeEnd={onResizeEnd}
    left={<div ref={listRef} className="h-full overflow-y-auto">
      {!hasMemo ? (
        <div className="p-4 text-sm text-gray-400">クリップボード履歴からメモ登録するか、管理画面で新規作成すると、ここに表示されます</div>
      ) : visible.length === 0 ? (
        <div className="p-4 text-sm text-gray-400">一致するメモがありません</div>
      ) : visible.map(({ node, depth }, index) => node.type === "folder" ?
        <button ref={node.id === selectedId ? selectedRowButtonRef : undefined} key={node.id} data-index={index} type="button" onMouseEnter={() => onSelect(node.id, false)} onClick={() => { onSelect(node.id, false); if (!filterText) onToggleFolder(node.id, !node.collapsed); }} className={`flex w-full items-center py-2 pr-3 text-left text-xs font-medium ${node.id === selectedId ? "bg-blue-500 text-white" : "text-gray-500 hover:bg-gray-50"}`} style={{ paddingLeft: 12 + depth * 16 }}><FolderChevron collapsed={node.collapsed} /><svg className="ml-1.5 mr-2 h-4 w-4 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24"><path d={FOLDER_ICON_PATH} /></svg><span className="truncate">{node.name}</span></button> :
        <button ref={node.id === selectedId ? selectedRowButtonRef : undefined} key={node.id} data-index={index} type="button" onMouseEnter={() => onSelect(node.id, false)} onClick={() => onSelect(node.id, true)} className={`flex w-full items-center py-2 pr-3 text-left text-sm ${node.id === selectedId ? "bg-blue-500 text-white" : "text-gray-700 hover:bg-gray-100"}`} style={{ paddingLeft: 12 + depth * 16 }}><FileIcon className="mr-2 h-4 w-4 flex-shrink-0" /><span className="truncate">{node.name}</span></button>
      )}
    </div>}
    right={<div className="h-full min-w-0 flex flex-col p-3 gap-2">
      <div className="flex items-center justify-between gap-2"><span className="flex items-center gap-2 text-sm text-gray-500">{document ? <><span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">v{document.revision}</span>{saveFeedback ? <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">✓ 保存しました</span> : <span className="text-xs">{`${new Date(document.savedAt).toLocaleString("ja-JP", { year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}保存`}</span>}</> : "メモを選択してください"}</span><button type="button" disabled={!document} onClick={() => saveWithFeedback().catch(console.error)} className="px-3 py-1 text-xs rounded bg-blue-500 text-white disabled:opacity-50">保存</button></div>
      <textarea ref={textareaRef} disabled={!document} value={content} onFocus={() => onEditorFocusChange?.(true)} onBlur={() => onEditorFocusChange?.(false)} onChange={(event) => onContentChange(event.target.value)} className="flex-1 min-h-0 w-full resize-none rounded border border-gray-200 p-2 text-sm outline-none focus:ring-1 focus:ring-blue-400 disabled:bg-gray-50" placeholder="メモを選択してください" />
    </div>}
  />;
}
