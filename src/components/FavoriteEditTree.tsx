import { useEffect, useRef, useState } from "react";
import { useScrollSelectedIntoView } from "../hooks/useScrollSelectedIntoView";
import { Tooltip } from "./Tooltip";
import { WarningIcon } from "./ToggleIcons";
import {
  FolderChevron,
  FileIcon,
  FOLDER_ICON_PATH,
  TRASH_ICON_PATH,
  INDENT_STEP_REM,
  INDENT_BASE_REM,
} from "./FavoriteTreeVisuals";
import { FavoriteTreeRow } from "../types";

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

// お気に入り編集ビューのツリー表示。走査結果（tree）自体は /favorite ブラウジング
// （FavoriteListPanel.tsx）と同じ favoriteTree をそのまま参照し、折りたたみ状態も
// 共有する（新規のツリー走査・折りたたみロジックは持たない。CLAUDE.md「同じ走査
// ロジックを2箇所に持たない」原則を参照）。行の見た目（チェブロン・フォルダ
// アイコン・インデント幅・ファイルアイコン・削除アイコン）は FavoriteTreeVisuals.tsx
// を共有する。
//
// FavoriteListPanel.tsx との違い：★トグル・「上へ/下へ移動」・ドラッグハンドルは
// 表示しない（4eで対応予定。REQUIREMENTS.md「お気に入り編集ビュー」節を参照）。
// 削除アイコンはフォルダ見出し行のみ、かつ選択中の行にのみ表示する（アイテム行の
// 削除・登録解除は /favorite ブラウジング側の★トグルのみで行う対象のため、この
// ビューには持たせない）。予約フォルダ（ピン止め・お気に入り・メモ）はこの
// tree（favoriteTree は「お気に入り」フォルダの子孫のみを列挙する）に現れないため、
// 予約フォルダ向けの削除・リネームアイコン非表示判定は別途不要（Rust側
// remove_favorite_folder・rename_favorite_node も二重に防御している）。
// アイテム行はクリック／Enterのいずれでもファイルを起動しない（このビューは
// ファイルを起動する画面ではなく、構造を閲覧・整理する画面のため）。
//
// リネーム（4d）：F2キー（選択中の行が対象。App.tsx の window レベルリスナー経由）・
// ダブルクリック（クリックした行が対象）のいずれでもインライン編集モードに入る。
// フォルダ見出し行をダブルクリックすると、通常の1クリック分（onClick による
// 折りたたみトグル）が2回発火した後にリネームモードへ入るため、開閉状態が
// 一瞬ちらつく副作用がある。ダブルクリックでのリネームは頻度の低い操作であり、
// クリック/ダブルクリックの判定タイマー等での回避は複雑さに見合わないため許容する。
export function FavoriteEditTree({
  tree,
  selected,
  onSelectRowByKey,
  onToggleCollapse,
  onRequestDeleteFolder,
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
  // 現在インライン編集中のノードID（FavoriteNode.id）。null なら編集中の行なし。
  renamingNodeId: string | null;
  onStartRename: (id: string) => void;
  onCancelRename: () => void;
  onConfirmRename: (id: string, newName: string) => Promise<string | null>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  useScrollSelectedIntoView(containerRef, selected);

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

        if (row.kind === "folder") {
          return (
            <div
              key={row.key}
              role="button"
              data-index={index}
              style={indentStyle}
              className={`w-full flex items-center py-2 pr-2 text-left transition-colors ${
                isSelected
                  ? "bg-blue-500 text-white"
                  : "text-gray-500 hover:bg-gray-50"
              }`}
              onClick={() => onToggleCollapse(row.node.id)}
              onDoubleClick={() => onStartRename(row.node.id)}
              onMouseEnter={() => onSelectRowByKey(row.key)}
            >
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
            style={indentStyle}
            className={`w-full flex items-center py-2.5 pr-4 text-left transition-colors ${
              isSelected
                ? "bg-blue-500 text-white"
                : "text-gray-700 hover:bg-gray-100"
            }`}
            onDoubleClick={() => onStartRename(row.node.id)}
            onMouseEnter={() => onSelectRowByKey(row.key)}
          >
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
          </div>
        );
      })}
    </div>
  );
}
