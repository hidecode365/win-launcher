import { useEffect, useRef, useState } from "react";
import { useScrollSelectedIntoView } from "../hooks/useScrollSelectedIntoView";
import { Tooltip } from "./Tooltip";
import { WarningIcon, FavoriteToggleButton } from "./ToggleIcons";
import {
  FolderChevron,
  FileIcon,
  FOLDER_ICON_PATH,
  TRASH_ICON_PATH,
  INDENT_STEP_REM,
  INDENT_BASE_REM,
} from "./FavoriteTreeVisuals";
import { FavoriteTreeRow, FileEntry } from "../types";

// リネーム中の行のインライン入力欄（4d）。CreateFolderRow（FavoriteEditView.tsx）と
// 同じ「テキストボックス＋Enter確定・Esc取り消し」の見た目・操作感を踏襲する。
// フォーカス時にテキストを全選択する点は RegisterEntryDialog.tsx の表示名欄と同じ。
function RenameInput({
  initialName,
  className,
  onConfirm,
  onCancel,
}: {
  initialName: string;
  className: string;
  onConfirm: (newName: string) => Promise<string | null>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const confirm = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("名前を入力してください");
      return;
    }
    // 同名エラー等、Rust側のバリデーションメッセージをそのまま表示し、入力欄は
    // 開いたまま再入力させる（CreateFolderRow・RegisterEntryDialog.tsx の
    // handleCreateFolder と同じ挙動）。
    const err = await onConfirm(trimmed);
    if (err) {
      setError(err);
    }
  };

  return (
    <div
      className="flex-1 min-w-0 flex items-center gap-1"
      onClick={(e) => e.stopPropagation()}
    >
      <input
        ref={inputRef}
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            onCancel();
          } else if (e.key === "Enter" && !e.nativeEvent.isComposing) {
            e.preventDefault();
            e.stopPropagation();
            confirm();
          } else if (
            e.key === "ArrowUp" ||
            e.key === "ArrowDown" ||
            e.key === "F2"
          ) {
            // ツリーの選択移動・別の行への再リネーム開始（App.tsx の window
            // レベルリスナー）に奪われないよう、入力中はこれらのキーの伝播だけ
            // 止める（入力欄内で特に意味を持たないキーのため preventDefault は
            // しない）。
            e.stopPropagation();
          }
        }}
        className={`min-w-0 flex-1 rounded border border-gray-300 px-1.5 py-0.5 outline-none focus:border-blue-400 text-gray-800 ${className}`}
        autoComplete="off"
        spellCheck={false}
      />
      {error && (
        <span className="text-[11px] text-red-500 flex-shrink-0">
          {error}
        </span>
      )}
    </div>
  );
}

// ドラッグハンドル（⋮⋮）。ResultList.tsx のピン止めブロックと同じ見た目・
// Tooltip文言を踏襲する（REQUIREMENTS.md「お気に入り編集ビュー」節「ドラッグハンドル
// は、編集ビュー内の全行に常時表示する（ピン止めブロックのドラッグハンドルと同じ
// 扱い）」を参照）。実際の `draggable` 属性は行全体に付与しており、このハンドルは
// 視覚的な目印（掴める場所を示す）の役割のみを持つ（ピン止めブロックと同じ設計）。
function DragHandle({ selected }: { selected: boolean }) {
  return (
    <Tooltip
      label="ドラッグして並び替え"
      className="w-4 mr-1.5 flex-shrink-0 justify-center"
    >
      <span
        className={`cursor-grab select-none font-bold ${
          selected ? "text-white" : "text-gray-400"
        }`}
      >
        ⋮⋮
      </span>
    </Tooltip>
  );
}

// ドロップ位置。"before"/"after" はドロップ先の行と同じ親の下で前後どちらに
// 挿入するか、"into" はドロップ先のフォルダ行の配下（末尾）への再親化を表す
// （"into" はフォルダ見出し行のみが対象になりうる）。
type DropPosition = "before" | "after" | "into";

// マウスの相対Y位置（0〜1）から、そのポイントに対応するドロップ位置を判定する。
// フォルダ行は上下25%を「前後に挿入」、中央50%を「配下へ再親化」の3分割、
// アイテム行は「配下」の概念を持たないため上半分/下半分の2分割にする。
function dropPositionFromRatio(
  ratio: number,
  targetIsFolder: boolean
): DropPosition {
  if (targetIsFolder && ratio > 0.25 && ratio < 0.75) {
    return "into";
  }
  return ratio < 0.5 ? "before" : "after";
}

// ドロップ先の行・位置から、Rustコマンド（move_favorite_node_to）に渡す
// newParentId・targetIndex を算出する。target_index は「移動対象自身を除いた、
// 移動先の親を共有する兄弟を order 昇順に並べた配列」上の挿入位置（Rust側の
// 契約と揃える。main.rs の move_favorite_node_to のコメントを参照）。
//
// favoriteTree は深さ優先のフラット配列で、同じ親を持つ兄弟同士が配列上で
// 隣接しているとは限らない（間に子孫の行が挟まる）。ただし各親の子は既に
// order 昇順で辿られているため、`parentId` が一致する行だけを抽出すれば、
// その相対順序はそのまま order 順になる（groupNodesByParent/walkGroupedTree の
// 前提。詳細は src/lib/nodeTree.ts を参照）。
function computeMoveTarget(
  tree: FavoriteTreeRow[],
  draggedId: string,
  targetRow: FavoriteTreeRow,
  position: DropPosition
): { newParentId: string; targetIndex: number } {
  if (position === "into" && targetRow.kind === "folder") {
    // 末尾に追加する。target_index は Rust側で兄弟数にクランプされるため、
    // 実際の兄弟数（自分自身が既にその配下にある場合を含む）を気にせず
    // directChildCount をそのまま渡してよい。
    return { newParentId: targetRow.node.id, targetIndex: targetRow.directChildCount };
  }
  const parentId = targetRow.node.parentId;
  const siblings = tree.filter(
    (r) => r.node.parentId === parentId && r.node.id !== draggedId
  );
  const targetPos = siblings.findIndex((r) => r.node.id === targetRow.node.id);
  const insertIndex = position === "before" ? targetPos : targetPos + 1;
  return { newParentId: parentId, targetIndex: Math.max(insertIndex, 0) };
}

// お気に入り編集ビューのツリー表示。走査結果（tree）自体は /favorite ブラウジング
// （FavoriteListPanel.tsx）と同じ favoriteTree をそのまま参照し、折りたたみ状態も
// 共有する（新規のツリー走査・折りたたみロジックは持たない。CLAUDE.md「同じ走査
// ロジックを2箇所に持たない」原則を参照）。行の見た目（チェブロン・フォルダ
// アイコン・インデント幅・ファイルアイコン・削除アイコン）は FavoriteTreeVisuals.tsx
// を共有する。
//
// FavoriteListPanel.tsx との違い：「上へ/下へ移動」ボタンは表示しない（4eでD&Dに
// 置き換わったため。REQUIREMENTS.md「お気に入り編集ビュー」節を参照）。削除アイコンは
// フォルダ見出し行のみ、かつ選択中の行にのみ表示する。★解除アイコンはアイテム行の
// みに表示する（フォルダ見出し行には持たせない。当初はアイテムの削除・登録解除は
// /favorite ブラウジング側の★トグルのみで行う想定だったが、編集ビューを開いたまま
// 完結できないのは不便との判断で追加した）。予約フォルダ（ピン止め・お気に入り・
// メモ）はこの tree（favoriteTree は「お気に入り」フォルダの子孫のみを列挙する）に
// 現れないため、予約フォルダ向けの削除・リネーム・移動アイコン非表示判定は別途
// 不要（Rust側 remove_favorite_folder・rename_favorite_node・
// move_favorite_node_to も二重に防御している）。
// アイテム行はクリック／Enterのいずれでもファイルを起動しない（このビューは
// ファイルを起動する画面ではなく、構造を閲覧・整理する画面のため）。
//
// リネーム（4d）：F2キー（選択中の行が対象。App.tsx の window レベルリスナー経由）・
// ダブルクリック（クリックした行が対象）のいずれでもインライン編集モードに入る。
// フォルダ見出し行をダブルクリックすると、通常の1クリック分（onClick による
// 折りたたみトグル）が2回発火した後にリネームモードへ入るため、開閉状態が
// 一瞬ちらつく副作用がある。ダブルクリックでのリネームは頻度の低い操作であり、
// クリック/ダブルクリックの判定タイマー等での回避は複雑さに見合わないため許容する。
//
// D&D（4e）：HTML5 Drag and Drop API を使う（tauri.conf.json の dragDropEnabled は
// false のまま。既存のピン止めブロック並び替え（ResultList.tsx）と同じ技術選択）。
// 行全体に draggable を付与し、DragHandle（⋮⋮）は掴める場所を示す視覚的な目印
// としてのみ機能する（実装上はどこを掴んでもドラッグできる。ピン止めブロックと
// 同じ設計）。ドラッグ中の行の相対Y位置からドロップ位置（前/後/配下）を判定し、
// 挿入線（前後）またはリング枠（配下）で視覚的にフィードバックする。実際の
// newParentId・target_index の算出は onDrop 時点で e.clientY から再計算する
// （dragover のたびに更新される dropTarget state は表示専用とし、React の
// バッチ更新のタイミングに依存する値をロジックの入力にしない）。
export function FavoriteEditTree({
  tree,
  selected,
  onSelectRowByKey,
  onToggleCollapse,
  onRequestDeleteFolder,
  onToggleFavorite,
  onMoveNode,
  renamingNodeId,
  onStartRename,
  onCancelRename,
  onConfirmRename,
}: {
  tree: FavoriteTreeRow[];
  // tree（favoriteTree）上の選択インデックス。フォルダ見出し行・アイテム行の
  // 両方が対象（useFavoriteEditSelection.ts を参照）。
  selected: number;
  onSelectRowByKey: (key: string) => void;
  onToggleCollapse: (folderId: string) => void;
  onRequestDeleteFolder: (folderId: string, name: string) => void;
  // ★解除（アイテム行のみ）。この一覧内の項目はすべて登録済みのため常に
  // 塗りつぶし表示・即座に解除する（確認なし。/favorite モードでの★アイコンと
  // 同じ挙動。REQUIREMENTS.md「/favorite モードでの★アイコン」節を参照）。
  onToggleFavorite: (file: FileEntry) => void;
  // ドラッグ&ドロップによる並び替え・再親化（4e）。エラー時（重複名・循環参照等）は
  // メッセージ文字列を受け取るが、ドロップ操作自体に確認・再入力の余地は無いため
  // ここでは console.error に留める（呼び出し元 useSearch.ts の他の set_* 系
  // コールバックと同じ Promise<string|null> 契約のまま、UI側での表示は省略する）。
  onMoveNode: (
    id: string,
    newParentId: string,
    targetIndex: number
  ) => Promise<string | null>;
  // 現在インライン編集中のノードID（FavoriteNode.id）。null なら編集中の行なし。
  renamingNodeId: string | null;
  onStartRename: (id: string) => void;
  onCancelRename: () => void;
  onConfirmRename: (id: string, newName: string) => Promise<string | null>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  useScrollSelectedIntoView(containerRef, selected);

  // ドラッグ中のノードID。表示の再計算を必要としないため ref で保持する
  // （ResultList.tsx の dragFromIndexRef と同じ考え方）。
  const dragIdRef = useRef<string | null>(null);
  // ドロップ位置インジケーターの表示専用 state（ロジックの入力にはしない。
  // 上記コメントを参照）。
  const [dropTarget, setDropTarget] = useState<{
    key: string;
    position: DropPosition;
  } | null>(null);

  const handleDragOver = (
    e: React.DragEvent<HTMLDivElement>,
    row: FavoriteTreeRow
  ) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragIdRef.current === null || dragIdRef.current === row.node.id) {
      setDropTarget(null);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientY - rect.top) / rect.height;
    const position = dropPositionFromRatio(ratio, row.kind === "folder");
    setDropTarget({ key: row.key, position });
  };

  const handleDrop = (
    e: React.DragEvent<HTMLDivElement>,
    row: FavoriteTreeRow
  ) => {
    e.preventDefault();
    const draggedId = dragIdRef.current;
    dragIdRef.current = null;
    setDropTarget(null);
    if (!draggedId || draggedId === row.node.id) return;
    // dropTarget state（表示専用）には頼らず、ドロップ時点の e.clientY から
    // 位置を再計算する（onDragOver の最終更新が反映される前に drop が発火する
    // 競合を避けるため）。
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientY - rect.top) / rect.height;
    const position = dropPositionFromRatio(ratio, row.kind === "folder");
    const { newParentId, targetIndex } = computeMoveTarget(
      tree,
      draggedId,
      row,
      position
    );
    onMoveNode(draggedId, newParentId, targetIndex).then((err) => {
      if (err) console.error(`[favorite-edit] move failed: ${err}`);
    });
  };

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto">
      {tree.length === 0 && (
        <div className="flex items-center justify-center text-gray-400 text-sm py-6">
          ★ボタンでファイルを登録すると、ここに表示されます
        </div>
      )}
      {tree.map((row, index) => {
        const indentStyle = {
          paddingLeft: `${row.depth * INDENT_STEP_REM + INDENT_BASE_REM}rem`,
        };
        const isSelected = index === selected;
        const isRenaming = row.node.id === renamingNodeId;
        const drop = dropTarget?.key === row.key ? dropTarget.position : null;
        const dropClasses = [
          drop === "before" ? "border-t-2 border-blue-500" : "",
          drop === "after" ? "border-b-2 border-blue-500" : "",
          drop === "into" ? "ring-2 ring-inset ring-amber-400" : "",
        ]
          .filter(Boolean)
          .join(" ");

        if (row.kind === "folder") {
          return (
            <div
              key={row.key}
              role="button"
              data-index={index}
              draggable={!isRenaming}
              style={indentStyle}
              className={`w-full flex items-center py-2 pr-2 text-left transition-colors ${
                isSelected
                  ? "bg-blue-500 text-white"
                  : "text-gray-500 hover:bg-gray-50"
              } ${dropClasses}`}
              onClick={() => onToggleCollapse(row.node.id)}
              onDoubleClick={() => onStartRename(row.node.id)}
              onMouseEnter={() => onSelectRowByKey(row.key)}
              onDragStart={(e) => {
                dragIdRef.current = row.node.id;
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", row.node.id);
              }}
              onDragOver={(e) => handleDragOver(e, row)}
              onDragLeave={() =>
                setDropTarget((prev) => (prev?.key === row.key ? null : prev))
              }
              onDrop={(e) => handleDrop(e, row)}
              onDragEnd={() => {
                dragIdRef.current = null;
                setDropTarget(null);
              }}
            >
              <DragHandle selected={isSelected} />
              <FolderChevron collapsed={row.collapsed} />
              <svg
                className="w-4 h-4 ml-1.5 mr-2 flex-shrink-0"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d={FOLDER_ICON_PATH} />
              </svg>
              {isRenaming ? (
                <RenameInput
                  initialName={row.node.name}
                  className="text-xs"
                  onConfirm={(newName) => onConfirmRename(row.node.id, newName)}
                  onCancel={onCancelRename}
                />
              ) : (
                <span className="text-xs font-medium truncate flex-1">
                  {row.node.name}
                </span>
              )}
              <span
                className={`ml-2 flex-shrink-0 inline-flex items-center rounded-full px-1.5 py-0.5 text-[11px] ${
                  isSelected
                    ? "bg-white/20 text-white"
                    : "bg-gray-100 text-gray-500"
                }`}
              >
                {row.directChildCount}
              </span>
              {/* 削除アイコン。選択中の行にのみ表示する（ピン・★アイコンの
                  「選択時のみ表示」と同じ考え方）。行全体のクリック（折りたたみ
                  切替）に伝播させないよう stopPropagation する。 */}
              {isSelected && !isRenaming && (
                <Tooltip label="このフォルダを削除" className="flex-shrink-0">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRequestDeleteFolder(row.node.id, row.node.name);
                    }}
                    className="ml-1 p-1 rounded text-white/80 hover:bg-white/20"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d={TRASH_ICON_PATH}
                      />
                    </svg>
                  </button>
                </Tooltip>
              )}
            </div>
          );
        }

        const item = row.file;
        return (
          <div
            key={row.key}
            data-index={index}
            draggable={!isRenaming}
            style={indentStyle}
            className={`w-full flex items-center py-2.5 pr-4 text-left transition-colors ${
              isSelected
                ? "bg-blue-500 text-white"
                : "text-gray-700 hover:bg-gray-100"
            } ${dropClasses}`}
            onDoubleClick={() => onStartRename(row.node.id)}
            onMouseEnter={() => onSelectRowByKey(row.key)}
            onDragStart={(e) => {
              dragIdRef.current = row.node.id;
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/plain", row.node.id);
            }}
            onDragOver={(e) => handleDragOver(e, row)}
            onDragLeave={() =>
              setDropTarget((prev) => (prev?.key === row.key ? null : prev))
            }
            onDrop={(e) => handleDrop(e, row)}
            onDragEnd={() => {
              dragIdRef.current = null;
              setDropTarget(null);
            }}
          >
            <DragHandle selected={isSelected} />
            <div
              className={`flex items-center min-w-0 flex-1 ${
                !row.exists ? "opacity-50" : ""
              }`}
            >
              {item.icon ? (
                <img
                  src={item.icon}
                  alt=""
                  className="w-4 h-4 mr-3 flex-shrink-0"
                />
              ) : (
                <FileIcon className="w-4 h-4 mr-3 flex-shrink-0 opacity-60" />
              )}
              {isRenaming ? (
                <RenameInput
                  initialName={row.node.name}
                  className="text-sm"
                  onConfirm={(newName) => onConfirmRename(row.node.id, newName)}
                  onCancel={onCancelRename}
                />
              ) : (
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">
                    {item.name}
                  </div>
                  <div
                    className={`text-xs truncate ${
                      isSelected ? "text-blue-100" : "text-gray-400"
                    }`}
                  >
                    {item.path}
                  </div>
                </div>
              )}
            </div>
            {!row.exists && <WarningIcon selected={isSelected} />}
            {isSelected && !isRenaming && (
              <FavoriteToggleButton
                active
                selected={isSelected}
                onToggle={() => onToggleFavorite(item)}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
