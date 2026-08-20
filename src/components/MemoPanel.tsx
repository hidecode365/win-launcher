import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FavoriteNode, MemoDocument } from "../types";
import { buildMemoVisibleRows } from "../lib/memoTree";
import { useScrollSelectedIntoView } from "../hooks/useScrollSelectedIntoView";
import { ResizableSplitPane } from "./ResizableSplitPane";
import { ActionButton } from "./ActionButton";
import { browseTreeRowClass, EDITOR_SURFACE_CLASS } from "../ui/sharedStyles";
import {
  FileIcon,
  FolderChevron,
  FOLDER_ICON_PATH,
  INDENT_BASE_REM,
  INDENT_STEP_REM,
} from "./FavoriteTreeVisuals";

function DiscardDraftIcon() {
  return <svg aria-hidden="true" className="h-3.5 w-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v6h6" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.6 9A8 8 0 1 1 7 17.3" /></svg>;
}

export function MemoPanel({
  nodes, documents, filterText, selectedId, document, onSelect, onContentChange, onSave, onDiscardDraft,
  onCopyAndClose, initialLeftWidth, onResizeEnd, onToggleFolder, onMoveSelection,
  focusEditor, onEditorFocused, onEditorFocusChange, onExitEditor,
}: {
  nodes: FavoriteNode[];
  documents: Record<string, MemoDocument>;
  filterText: string;
  selectedId: string | null;
  document: MemoDocument | null;
  onSelect: (id: string, focusEditor: boolean) => void;
  onContentChange: (content: string) => void;
  onSave: () => Promise<void>;
  onDiscardDraft: () => Promise<void>;
  onCopyAndClose: (content: string) => Promise<void>;
  initialLeftWidth: number;
  onResizeEnd: (width: number) => void;
  onToggleFolder: (id: string, collapsed: boolean) => void;
  onMoveSelection: (direction: 1 | -1) => void;
  focusEditor?: boolean;
  onEditorFocused?: () => void;
  onEditorFocusChange?: (focused: boolean) => void;
  onExitEditor: () => void;
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
  const content = document?.draft?.content ?? document?.content ?? "";
  const hasDraft = Boolean(
    document?.draft && document.draft.content !== document.content
  );
  useEffect(() => {
    if (hasDraft) setSaveFeedback(false);
  }, [hasDraft]);
  const saveWithFeedback = useCallback(async () => {
    if (!hasDraft) return;
    await onSave();
    setSaveFeedback(true);
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    feedbackTimerRef.current = setTimeout(() => setSaveFeedback(false), 2000);
  }, [hasDraft, onSave]);
  const discardDraft = useCallback(async () => {
    if (!hasDraft) return;
    await onDiscardDraft();
    setSaveFeedback(false);
  }, [hasDraft, onDiscardDraft]);
  const visible = useMemo(
    () => buildMemoVisibleRows(nodes, documents, filterText),
    [nodes, documents, filterText]
  );
  const selectedIndex = visible.findIndex(({ node }) => node.id === selectedId);
  const selectedNode = visible[selectedIndex]?.node ?? null;
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const editorFocused = event.target === textareaRef.current;
      if (editorFocused) {
        if (event.ctrlKey && event.key.toLowerCase() === "s") {
          event.preventDefault();
          event.stopImmediatePropagation();
          if (hasDraft) saveWithFeedback().catch(console.error);
        } else if (event.key === "Escape") {
          event.preventDefault();
          event.stopImmediatePropagation();
          onExitEditor();
        } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          // window上の他のリスナーへは渡さず、preventDefaultは行わない。
          // これによりtextarea内のブラウザ標準カーソル移動だけが動作する。
          event.stopImmediatePropagation();
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
  }, [content, document, filterText, hasDraft, onCopyAndClose, onExitEditor, onMoveSelection, onToggleFolder, saveWithFeedback, selectedNode]);
  useEffect(() => {
    const activeElement = window.document.activeElement;
    if (activeElement instanceof Node && listRef.current?.contains(activeElement)) {
      selectedRowButtonRef.current?.focus({ preventScroll: true });
    }
  }, [selectedId]);
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
        <button ref={node.id === selectedId ? selectedRowButtonRef : undefined} key={node.id} data-index={index} type="button" onMouseEnter={() => onSelect(node.id, false)} onClick={() => { onSelect(node.id, false); if (!filterText) onToggleFolder(node.id, !node.collapsed); }} className={`${browseTreeRowClass("folder", { selected: node.id === selectedId })} text-ui-meta font-medium outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ui-focus`} style={{ paddingLeft: `${depth * INDENT_STEP_REM + INDENT_BASE_REM}rem` }}><FolderChevron collapsed={node.collapsed} /><svg className="ml-1.5 mr-2 h-4 w-4 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24"><path d={FOLDER_ICON_PATH} /></svg><span className="truncate">{node.name}</span></button> :
        <button ref={node.id === selectedId ? selectedRowButtonRef : undefined} key={node.id} data-index={index} type="button" onMouseEnter={() => onSelect(node.id, false)} onClick={() => onSelect(node.id, true)} className={`${browseTreeRowClass("item", { selected: node.id === selectedId })} text-ui-body font-medium outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ui-focus`} style={{ paddingLeft: `${depth * INDENT_STEP_REM + INDENT_BASE_REM}rem` }}><FileIcon className="mr-2 h-4 w-4 flex-shrink-0" /><span className="truncate">{node.name}</span></button>
      )}
    </div>}
    right={<div className="h-full min-w-0 flex flex-col p-3 gap-2">
      <div className="flex items-center justify-between gap-2"><span className="flex min-w-0 items-center gap-2 text-sm text-gray-500">{document ? <>{hasDraft ? <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">下書き中</span> : <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">v{document.revision}</span>}{saveFeedback ? <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">✓ 保存しました</span> : <span className="text-xs">{`${new Date(document.savedAt).toLocaleString("ja-JP", { year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}保存`}</span>}</> : "メモを選択してください"}</span><div className="flex flex-shrink-0 items-center gap-2"><ActionButton variant="secondary" className="whitespace-nowrap" disabled={!hasDraft} onClick={() => discardDraft().catch(console.error)}><DiscardDraftIcon />下書きを破棄</ActionButton><ActionButton disabled={!hasDraft} onClick={() => saveWithFeedback().catch(console.error)}>保存</ActionButton></div></div>
      <textarea ref={textareaRef} disabled={!document} value={content} onFocus={() => onEditorFocusChange?.(true)} onBlur={() => onEditorFocusChange?.(false)} onChange={(event) => onContentChange(event.target.value)} className={`flex-1 min-h-0 ${EDITOR_SURFACE_CLASS}`} placeholder="メモを選択してください" />
    </div>}
  />;
}
