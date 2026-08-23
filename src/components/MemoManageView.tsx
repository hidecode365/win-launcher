import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import type { UseMemoManageResult, MemoManageRow } from "../hooks/useMemoManage";
import { MEMO_HEADER_CREATE_ANCHOR } from "../hooks/useMemoManage";
import { useScrollSelectedIntoView } from "../hooks/useScrollSelectedIntoView";
import { MEMO_FOLDER_ID, MEMO_TRASH_ID } from "../types";
import { memoNodeDisplayName } from "../lib/memoTree";
import { shouldStopEditInputKeyPropagation } from "../lib/treeEditUtils";
import { Tooltip } from "./Tooltip";
import { IconSlot } from "./IconSlot";
import { ResizableSplitPane } from "./ResizableSplitPane";
import { ActionButton } from "./ActionButton";
import { CreateFolderInlineRow } from "./FavoriteEditTree";
import { MemoNodeRenameInput } from "./MemoNodeRenameInput";
import { MemoIcon } from "./MemoIcon";
import { MemoManageFooter } from "./MemoManageFooter";
import {
  MANAGE_TREE_ROW_LABEL,
  manageTreeRowClass,
  EDITOR_SURFACE_CLASS,
  type ManageTreeRowVariant,
} from "../ui/sharedStyles";
import { CreateFolderIcon, FileIcon, FolderChevron, FOLDER_ICON_PATH, INDENT_BASE_REM, INDENT_STEP_REM, TRASH_ICON_PATH } from "./FavoriteTreeVisuals";

function DragHandle({ selected }: { selected: boolean }) {
  return (
    <Tooltip label="ドラッグして並び替え" className="mr-1.5 w-4 flex-shrink-0 justify-center">
      <span className={`cursor-grab select-none font-bold ${selected ? "text-white" : "text-gray-400"}`}>⋮⋮</span>
    </Tooltip>
  );
}

function MemoCreateRow({ depth, name, onNameChange, onCreate, onCancel }: { depth: number; name: string; onNameChange: (name: string) => void; onCreate: () => Promise<void>; onCancel: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);
  return (
    <form className="flex items-center gap-2 py-ui-row-y pr-ui-row-x" style={{ paddingLeft: `${depth * INDENT_STEP_REM + INDENT_BASE_REM}rem` }} onSubmit={(event) => { event.preventDefault(); onCreate().catch(console.error); }}>
      <MemoIcon className="h-4 w-4 flex-shrink-0 text-gray-400" />
      <input ref={inputRef} value={name} onChange={(event) => onNameChange(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onCancel(); } else if (shouldStopEditInputKeyPropagation(event)) { event.stopPropagation(); } }} placeholder="新しいメモ名" className="min-w-0 flex-1 rounded border border-gray-300 px-1.5 py-0.5 text-xs outline-none focus:border-blue-400" />
    </form>
  );
}

// issue 0026 軸A：/memo の統合画面。旧 MemoManageView.tsx（構造操作専用の左ツリー
// のみ）と旧 MemoPanel.tsx（左ツリー＋右本文編集ペインの閲覧専用パネル）を1画面へ
// 統合した。ツリー編集state・本文（下書き・確定版）の管理はいずれも App.tsx が
// 保持する useMemoManage フックへ引き上げ済み（設定画面往復でこのコンポーネント
// 自体がアンマウントされても、フック側のstateは消えない。issue 0026 横断整理C-3）。
// フォーカス管理（本文編集エリアへのフォーカス要求・Escでの一覧側への復帰）は、
// このコンポーネント内だけで完結するローカル関心事のため、あえて App.tsx へは
// 引き上げていない（本文フォーカス状態そのものが設定往復で消えても実害がないため）。
export function MemoManageView({
  manage,
  onClose,
  onCopyAndClose,
  onRegisterLocalQueryClearHandler,
  initialLeftWidth,
  onPaneResizeEnd,
  version,
}: {
  manage: UseMemoManageResult;
  onClose: () => void;
  onCopyAndClose: (content: string) => Promise<void>;
  onRegisterLocalQueryClearHandler: (handler: (() => void) | null) => void;
  initialLeftWidth: number;
  onPaneResizeEnd: (width: number) => void;
  version: string;
}) {
  const filterInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [editorFocused, setEditorFocused] = useState(false);
  const [editorFocusRequested, setEditorFocusRequested] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState(false);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    onRegisterLocalQueryClearHandler(() => manage.setFilterText(""));
    return () => onRegisterLocalQueryClearHandler(null);
  }, [manage.setFilterText, onRegisterLocalQueryClearHandler]);

  useEffect(() => {
    if (!manage.creating && !manage.renaming && !editorFocused) filterInputRef.current?.focus();
  }, [manage.creating, manage.renaming, editorFocused]);

  const { selection, selectedRow, selectedNode, visibleRows } = manage;
  useScrollSelectedIntoView(listRef, selection.selected);

  const document = manage.document;
  const content = document?.draft?.content ?? document?.content ?? "";
  const hasDraft = Boolean(document?.draft && document.draft.content !== document.content);
  useEffect(() => { setSaveFeedback(false); }, [selectedNode?.id]);
  useEffect(() => { if (hasDraft) setSaveFeedback(false); }, [hasDraft]);
  useEffect(() => () => { if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current); }, []);

  const saveWithFeedback = useCallback(async () => {
    if (!hasDraft) return;
    await manage.saveFinal();
    setSaveFeedback(true);
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    feedbackTimerRef.current = setTimeout(() => setSaveFeedback(false), 2000);
  }, [hasDraft, manage.saveFinal]);
  const discardDraft = useCallback(async () => {
    if (!hasDraft) return;
    await manage.discardDraft();
    setSaveFeedback(false);
  }, [hasDraft, manage.discardDraft]);

  const startEditing = useCallback((id: string) => {
    manage.selection.selectByKey(id);
    setEditorFocusRequested(true);
  }, [manage.selection]);

  useEffect(() => {
    if (!editorFocusRequested) return;
    if (!manage.renaming) textareaRef.current?.focus();
    setEditorFocusRequested(false);
  }, [editorFocusRequested, manage.renaming]);

  const exitEditor = useCallback(() => {
    filterInputRef.current?.focus();
  }, []);

  // 本文編集エリア（textarea）へフォーカスがある間のキー操作は、一覧側の
  // window keydown ハンドラより優先させる必要がある（06-keyboard-interactions.md
  // 「メモ画面」節：モーダル・一時的な編集状態 > 画面固有操作、の優先順位）。
  // capture フェーズで先取りし、対象外のキーはそのまま何もせず（textarea自身の
  // 既定動作＝通常のテキスト編集に委ねる）return する。
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.target !== textareaRef.current) return;
      if (event.ctrlKey && event.key.toLowerCase() === "s") {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (hasDraft) saveWithFeedback().catch(console.error);
      } else if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        exitEditor();
      } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        // textarea標準のカーソル移動だけを行わせる（一覧側の選択移動へは渡さない）。
        event.stopImmediatePropagation();
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [exitEditor, hasDraft, saveWithFeedback]);

  // 一覧側のキー操作（本文編集エリアにフォーカスがある間は上記capture handlerが
  // 先に処理しstopImmediatePropagationするため、ここへは届かない）。
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target === textareaRef.current) return;
      if (event.target instanceof HTMLInputElement && event.target !== filterInputRef.current) return;
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        if (event.ctrlKey && event.shiftKey) manage.moveSelectedWithinParent(event.key === "ArrowDown" ? 1 : -1).catch(console.error);
        else selection.moveSelection(event.key === "ArrowDown" ? 1 : -1);
        return;
      }
      if (event.ctrlKey && event.shiftKey && event.key === "ArrowLeft") { event.preventDefault(); manage.outdentSelected().catch(console.error); return; }
      if (event.ctrlKey && event.shiftKey && event.key === "ArrowRight" && !selectedRow?.trashed) { event.preventDefault(); manage.indentSelected().catch(console.error); return; }
      if (event.ctrlKey && event.key.toLowerCase() === "e" && selectedRow?.kind === "memo" && !selectedRow.trashed) {
        event.preventDefault();
        setEditorFocusRequested(true);
        return;
      }
      if (event.key === "Enter" && selectedRow?.kind === "memo" && !selectedRow.trashed && document) {
        event.preventDefault();
        onCopyAndClose(content).catch(console.error);
        return;
      }
      if (event.key === "Enter" && selectedNode?.type === "folder" && !manage.filtering) { event.preventDefault(); manage.toggleFolder(selectedNode).catch(console.error); return; }
      if (event.key === "F2" && selectedRow && !selectedRow.trashed && selectedNode && selectedNode.id !== MEMO_TRASH_ID) { event.preventDefault(); manage.setRenaming(selectedNode.id); return; }
      if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "n" && selectedRow && !selectedRow.trashed) { event.preventDefault(); manage.startCreate("folder"); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [content, document, manage, onCopyAndClose, selectedNode, selectedRow, selection]);

  const renderActionIcons = (row: MemoManageRow, selected: boolean) => {
    if (!selected || row.kind === "trash") return null;
    if (row.trashed) {
      return (
        <div className="ml-2 flex items-center gap-2">
          <IconSlot interactive selected tooltip={row.node.type === "folder" ? "このフォルダを完全に削除" : "このメモを完全に削除"} onClick={() => manage.remove().catch(console.error)}>
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={TRASH_ICON_PATH} /></svg>
          </IconSlot>
        </div>
      );
    }
    return (
      <div className="ml-2 flex items-center gap-2">
        <IconSlot interactive selected tooltip="ここにフォルダを作成" onClick={() => manage.startCreate("folder")}><CreateFolderIcon className="h-4 w-4" /></IconSlot>
        <IconSlot interactive selected tooltip="ここにメモを作成" onClick={() => manage.startCreate("memo")}><MemoIcon /></IconSlot>
        {row.node.type === "memo" && (
          <IconSlot interactive selected tooltip="本文を編集" onClick={() => startEditing(row.node.id)}>
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
          </IconSlot>
        )}
        <IconSlot interactive selected tooltip={row.node.type === "folder" ? "このフォルダをゴミ箱へ移動" : "このメモをゴミ箱へ移動"} onClick={() => manage.remove().catch(console.error)}>
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={TRASH_ICON_PATH} /></svg>
        </IconSlot>
      </div>
    );
  };

  const hasAnyMemo = manage.nodes.some((node) => node.type === "memo");
  const creatingAtHeader = manage.creatingAnchorId === MEMO_HEADER_CREATE_ANCHOR;

  return (
    <div className="relative flex h-screen flex-col overflow-hidden rounded-2xl border border-white/20 bg-white/90 shadow-2xl backdrop-blur-xl">
      <header data-tauri-drag-region="deep" className="flex items-center border-b border-gray-200/60 px-4 py-3">
        <Tooltip label="戻る" side="right" className="mr-2 flex-shrink-0">
          <button type="button" onClick={onClose} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </button>
        </Tooltip>
        <svg className="mr-3 h-5 w-5 flex-shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
        <input ref={filterInputRef} type="text" autoFocus autoComplete="off" spellCheck={false} value={manage.filterText} onChange={(event) => manage.setFilterText(event.target.value)} placeholder="メモを絞り込み..." className="flex-1 bg-transparent text-lg text-gray-800 outline-none placeholder-gray-400" />
        {/* issue 0026 軸A：固定行「メモ」を撤去した代わりに、常にメモルート直下へ
            作成する新規フォルダ・新規メモアイコンをヘッダーへ常設する。 */}
        <div className="ml-2 flex flex-shrink-0 items-center gap-2">
          <Tooltip label="新規フォルダ" className="flex-shrink-0">
            <button type="button" onClick={() => manage.startCreateAtRoot("folder")} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
              <CreateFolderIcon className="h-5 w-5" />
            </button>
          </Tooltip>
          <Tooltip label="新規メモ" className="flex-shrink-0">
            <button type="button" onClick={() => manage.startCreateAtRoot("memo")} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
              <MemoIcon className="h-5 w-5" />
            </button>
          </Tooltip>
        </div>
      </header>
      {manage.moveError && <div className="flex-shrink-0 border-b border-red-200 bg-red-50 px-4 py-2 text-xs text-red-600">{manage.moveError}</div>}
      <ResizableSplitPane
        className="flex-1"
        initialLeftWidth={initialLeftWidth}
        onResizeEnd={onPaneResizeEnd}
        left={
          <div ref={listRef} className="h-full overflow-y-auto" onMouseMove={(event) => selection.recordMouseMove(event.clientX, event.clientY)}>
            {!hasAnyMemo && !creatingAtHeader && (
              <div className="p-4 text-sm text-gray-400">クリップボード履歴からメモ登録するか、上部の新規作成アイコンで作成すると、ここに表示されます</div>
            )}
            {creatingAtHeader && manage.creating === "folder" && (
              <CreateFolderInlineRow depth={0} targetParentId={MEMO_FOLDER_ID} onCreateFolder={manage.createFolder} onFolderCreated={(id) => { manage.cancelCreate(); selection.selectByKey(id, Date.now() + 1000); }} onCancel={manage.cancelCreate} />
            )}
            {creatingAtHeader && manage.creating === "memo" && (
              <MemoCreateRow depth={0} name={manage.name} onNameChange={manage.setName} onCreate={manage.createMemo} onCancel={manage.cancelCreate} />
            )}
            {visibleRows.map((row, index) => {
              const { node, depth } = row;
              const position = manage.dropTarget?.id === node.id ? manage.dropTarget.position : null;
              const selected = selection.selected === index;
              const reserved = row.kind === "trash";
              const renamingThis = manage.renaming === node.id;
              const dropClass = position === "before" ? "border-t-2 border-blue-500" : position === "after" ? "border-b-2 border-blue-500" : position === "into" ? "ring-2 ring-inset ring-amber-400" : "";
              const rowVariant: ManageTreeRowVariant = row.kind === "trash" ? "fixed" : node.type === "folder" ? "folder" : "item";
              const rowClass = `${manageTreeRowClass(rowVariant, { selected, muted: row.trashed })} ${dropClass}`;
              const commonEvents = {
                onMouseEnter: (event: React.MouseEvent<HTMLDivElement>) => selection.selectByHover(node.id, event.clientX, event.clientY),
                onDragOver: (event: React.DragEvent<HTMLDivElement>) => manage.handleDragOver(event, row),
                onDragLeave: () => manage.setDropTarget((current) => (current?.id === node.id ? null : current)),
                onDrop: (event: React.DragEvent<HTMLDivElement>) => { manage.handleDrop(event, row).catch(console.error); },
              };
              const anchorAfter = manage.creatingAnchorId === node.id;
              return (
                <Fragment key={node.id}>
                  <div
                    role="button"
                    data-index={index}
                    draggable={!reserved && !renamingThis && !manage.filtering}
                    onDragStart={(event) => { manage.dragInfoRef.current = { id: node.id, isFolder: node.type === "folder" }; event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", node.id); }}
                    onDragEnd={() => { manage.dragInfoRef.current = null; manage.setDropTarget(null); }}
                    onDoubleClick={() => { if (!row.trashed && !reserved) manage.setRenaming(node.id); }}
                    onClick={() => {
                      selection.selectByKey(node.id);
                      if (node.type === "folder" && !manage.filtering) manage.toggleFolder(node).catch(console.error);
                    }}
                    className={rowClass}
                    style={{ paddingLeft: `${depth * INDENT_STEP_REM + INDENT_BASE_REM}rem` }}
                    {...commonEvents}
                  >
                    {!reserved && !manage.filtering ? <DragHandle selected={selected} /> : reserved ? null : <span className="mr-1.5 w-4 flex-shrink-0" />}
                    {node.type === "folder" && <FolderChevron collapsed={node.collapsed} />}
                    {row.kind === "trash" ? (
                      <svg className="ml-1.5 mr-2 h-4 w-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={TRASH_ICON_PATH} /></svg>
                    ) : node.type === "folder" ? (
                      <svg className="ml-1.5 mr-2 h-4 w-4 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24"><path d={FOLDER_ICON_PATH} /></svg>
                    ) : (
                      <FileIcon className="ml-1.5 mr-2 h-4 w-4 flex-shrink-0" />
                    )}
                    {renamingThis ? (
                      <MemoNodeRenameInput nodeId={node.id} initialName={node.name} className={rowVariant === "item" ? "text-ui-body" : "text-ui-meta"} onRenamed={async () => { manage.setRenaming(null); await manage.reload(); }} onCancel={() => manage.setRenaming(null)} />
                    ) : (
                      <span className={`${rowVariant === "item" ? "flex-1 " : ""}${MANAGE_TREE_ROW_LABEL[rowVariant]}`}>{memoNodeDisplayName(node)}</span>
                    )}
                    {!renamingThis && renderActionIcons(row, selected)}
                  </div>
                  {anchorAfter && manage.creating === "folder" && (
                    <CreateFolderInlineRow depth={node.type === "folder" ? depth + 1 : depth} targetParentId={manage.creatingParentId} onCreateFolder={manage.createFolder} onFolderCreated={(id) => { manage.cancelCreate(); selection.selectByKey(id, Date.now() + 1000); }} onCancel={manage.cancelCreate} />
                  )}
                  {anchorAfter && manage.creating === "memo" && (
                    <MemoCreateRow depth={node.type === "folder" ? depth + 1 : depth} name={manage.name} onNameChange={manage.setName} onCreate={manage.createMemo} onCancel={manage.cancelCreate} />
                  )}
                </Fragment>
              );
            })}
          </div>
        }
        right={
          <div className="h-full min-w-0 flex flex-col p-3 gap-2">
            <div className="flex items-center justify-between gap-2">
              <span className="flex min-w-0 items-center gap-2 text-sm text-gray-500">
                {document ? (
                  <>
                    {hasDraft ? (
                      <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">下書き中</span>
                    ) : (
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">v{document.revision}</span>
                    )}
                    {saveFeedback ? (
                      <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">✓ 保存しました</span>
                    ) : (
                      <span className="text-xs">{`${new Date(document.savedAt).toLocaleString("ja-JP", { year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}保存`}</span>
                    )}
                  </>
                ) : (
                  "メモを選択してください"
                )}
              </span>
              <div className="flex flex-shrink-0 items-center gap-2">
                <ActionButton variant="secondary" className="whitespace-nowrap" disabled={!hasDraft} onClick={() => discardDraft().catch(console.error)}>下書きを破棄</ActionButton>
                <ActionButton disabled={!hasDraft} onClick={() => saveWithFeedback().catch(console.error)}>保存</ActionButton>
              </div>
            </div>
            <textarea
              ref={textareaRef}
              disabled={!document}
              value={content}
              onFocus={() => setEditorFocused(true)}
              onBlur={() => setEditorFocused(false)}
              onChange={(event) => manage.updateContent(event.target.value)}
              className={`flex-1 min-h-0 ${EDITOR_SURFACE_CLASS}`}
              placeholder="メモを選択してください"
            />
          </div>
        }
      />
      <MemoManageFooter
        selectedKind={selectedRow?.kind ?? null}
        trashed={selectedRow?.trashed ?? false}
        filtering={manage.filtering}
        renaming={manage.renaming !== null}
        editorFocused={editorFocused}
        memoSelected={selectedRow?.kind === "memo"}
        saveAvailable={hasDraft}
        version={version}
      />
    </div>
  );
}
