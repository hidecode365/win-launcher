import { useEffect, useRef, useState } from "react";
import { Tooltip } from "./Tooltip";
import { FavoriteEditTree } from "./FavoriteEditTree";
import { FavoriteFolderDeleteModal } from "./FavoriteFolderDeleteModal";
import {
  CreateFolderResult,
  FAVORITES_FOLDER_ID,
  FavoriteTreeRow,
} from "../types";

// 画面下部に常時表示する「ここにフォルダを作成」行。RegisterEntryDialog.tsx の
// 「+ 新規フォルダ作成」と同じインライン入力パターン（テキストボタン→入力欄＋
// 作成/キャンセルボタンへの切り替え、Enter確定・Esc取り消し、入力欄自身の
// onKeyDown で stopPropagation）をそのまま踏襲する。ツリーの走査には含めない
// （tree/selected のドメイン外の固定行のため、favoriteTree・intentベースの
// 選択には一切影響しない）。
function CreateFolderRow({
  targetParentId,
  onCreateFolder,
  onFolderCreated,
}: {
  targetParentId: string;
  onCreateFolder: (
    parentId: string,
    name: string
  ) => Promise<CreateFolderResult>;
  onFolderCreated: (folderId: string) => void;
}) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (creating) {
      inputRef.current?.focus();
    }
  }, [creating]);

  const cancel = () => {
    setCreating(false);
    setName("");
    setError(null);
  };

  const confirm = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("フォルダ名を入力してください");
      return;
    }
    const result = await onCreateFolder(targetParentId, trimmed);
    if (result.folder) {
      onFolderCreated(result.folder.id);
      cancel();
    } else {
      // 同名フォルダの重複等、Rust側のバリデーションエラーメッセージをそのまま
      // 表示し、入力欄は開いたまま再入力させる（RegisterEntryDialog.tsx の
      // handleCreateFolder と同じ挙動）。
      setError(result.error ?? "フォルダの作成に失敗しました");
    }
  };

  if (!creating) {
    return (
      <button
        type="button"
        onClick={() => setCreating(true)}
        className="w-full flex-shrink-0 border-t border-gray-200/60 px-4 py-2 text-left text-xs text-blue-600 hover:bg-blue-50"
      >
        + ここにフォルダを作成
      </button>
    );
  }

  return (
    <div className="flex-shrink-0 border-t border-gray-200/60 px-4 py-2">
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              cancel();
            } else if (e.key === "Enter" && !e.nativeEvent.isComposing) {
              e.preventDefault();
              e.stopPropagation();
              confirm();
            } else if (
              e.key === "ArrowUp" ||
              e.key === "ArrowDown" ||
              e.key === "F2"
            ) {
              // ツリーの選択移動・別の行のリネーム開始（App.tsx の window
              // レベルリスナー）に奪われないよう、入力中はこれらのキーの伝播
              // だけ止める（入力欄内で特に意味を持たないキーのため
              // preventDefault はしない）。
              e.stopPropagation();
            }
          }}
          placeholder="新しいフォルダ名"
          className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm text-gray-800 outline-none focus:border-blue-400"
          autoComplete="off"
          spellCheck={false}
        />
        <button
          type="button"
          onClick={confirm}
          className="rounded px-2 py-1 text-xs text-blue-600 hover:bg-blue-50"
        >
          作成
        </button>
        <button
          type="button"
          onClick={cancel}
          className="rounded px-2 py-1 text-xs text-gray-500 hover:bg-gray-100"
        >
          キャンセル
        </button>
      </div>
      {error && <div className="text-xs text-red-500 mt-1">{error}</div>}
    </div>
  );
}

// お気に入り編集ビュー。4bで読み取り専用のツリー描画＋選択、4cでフォルダの
// 作成・削除、4dでリネームを実装した。ドラッグ&ドロップによる並び替えは 4e で
// 実装する（REQUIREMENTS.md「お気に入り編集ビュー」節を参照）。
//
// ヘッダーの構成（戻るボタン＋タイトル＋ドラッグ領域）は SettingsPanel.tsx と
// 同じパターンを踏襲する。
//
// 「検索」「設定」に続く3枚目のビューとして、App.tsx の view state 切り替えのみで
// 表示する（新規のOSウィンドウは作らない）。useSearch/useSettings 自体はこの
// ビューを開いてもアンマウントされないため、閉じて /favorite ブラウジングへ戻った
// 際の絞り込み文字列・選択位置・フォルダ展開状態の保持は、この仕組み自体から自動的に
// 得られる（専用の保存・復元コードをここに持たせる必要はない）。
//
// ツリーのデータソース（favoriteTree）・折りたたみ状態（onToggleCollapse）・
// フォルダ作成/削除の実コマンド呼び出し（createFavoriteFolder/
// requestDeleteFavoriteFolder 等）は /favorite ブラウジング（useSearch.ts）と
// そのまま共有する。選択状態のみ、useFavoriteEditSelection による独立した
// ドメインを App.tsx 側で持つ（props で selected/onSelectRowByKey として受け取る）。
export function FavoriteEditView({
  tree,
  selected,
  onSelectRowByKey,
  onToggleCollapse,
  onCreateFolder,
  onFolderCreated,
  onRequestDeleteFolder,
  pendingDeleteFolder,
  onCancelDeleteFolder,
  onConfirmDeleteFolder,
  renamingNodeId,
  onStartRename,
  onCancelRename,
  onConfirmRename,
  onClose,
}: {
  tree: FavoriteTreeRow[];
  selected: number;
  onSelectRowByKey: (key: string) => void;
  onToggleCollapse: (folderId: string) => void;
  onCreateFolder: (
    parentId: string,
    name: string
  ) => Promise<CreateFolderResult>;
  onFolderCreated: (folderId: string) => void;
  onRequestDeleteFolder: (folderId: string, name: string) => void;
  pendingDeleteFolder: { name: string; descendantCount: number } | null;
  onCancelDeleteFolder: () => void;
  onConfirmDeleteFolder: () => void;
  renamingNodeId: string | null;
  onStartRename: (id: string) => void;
  onCancelRename: () => void;
  onConfirmRename: (id: string, newName: string) => Promise<string | null>;
  onClose: () => void;
}) {
  // 画面下部の詳細表示ペイン用。フォルダ見出し行選択時はフォルダ名のみ、
  // アイテム行選択時はフルパスを表示する（REQUIREMENTS.md「お気に入り編集ビュー」節）。
  const selectedRow = tree[selected] ?? null;

  // 新規フォルダの作成先。現在選択中の行に応じて決める：フォルダ行が選択中なら
  // そのフォルダの直下、アイテム行が選択中ならそのアイテムの親フォルダの直下、
  // 何も選択されていなければ（tree が空）予約フォルダ「お気に入り」の直下
  // （REQUIREMENTS.md「お気に入り編集ビュー」節を参照）。
  const createFolderTargetParentId =
    selectedRow?.kind === "folder"
      ? selectedRow.node.id
      : selectedRow?.kind === "item"
        ? selectedRow.node.parentId
        : FAVORITES_FOLDER_ID;

  return (
    <div className="relative flex flex-col h-screen bg-white/90 backdrop-blur-xl rounded-2xl overflow-hidden border border-white/20 shadow-2xl">
      <div
        data-tauri-drag-region="deep"
        className="flex items-center px-4 py-3 border-b border-gray-200/60"
      >
        <Tooltip label="戻る" side="right" className="mr-2 flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </button>
        </Tooltip>
        <span className="text-base font-medium text-gray-800">
          お気に入りの編集
        </span>
      </div>

      {pendingDeleteFolder && (
        <FavoriteFolderDeleteModal
          target={pendingDeleteFolder}
          onCancel={onCancelDeleteFolder}
          onConfirm={onConfirmDeleteFolder}
        />
      )}

      <FavoriteEditTree
        tree={tree}
        selected={selected}
        onSelectRowByKey={onSelectRowByKey}
        onToggleCollapse={onToggleCollapse}
        onRequestDeleteFolder={onRequestDeleteFolder}
        renamingNodeId={renamingNodeId}
        onStartRename={onStartRename}
        onCancelRename={onCancelRename}
        onConfirmRename={onConfirmRename}
      />

      <CreateFolderRow
        targetParentId={createFolderTargetParentId}
        onCreateFolder={onCreateFolder}
        onFolderCreated={onFolderCreated}
      />

      {/* 詳細表示ペイン。選択中のアイテム行のフルパスを読み取り専用で表示する
          （行自体にも truncate 済みのパスを表示しているが、長いパスは省略される
          ため、ここで全文を確認できるようにする）。 */}
      <div className="flex-shrink-0 border-t border-gray-200/60 px-4 py-2 text-xs text-gray-500 truncate">
        {selectedRow?.kind === "item" ? (
          <>
            {selectedRow.file.path}
            {!selectedRow.exists && (
              <span className="ml-2 text-amber-600">実体が見つかりません</span>
            )}
          </>
        ) : selectedRow?.kind === "folder" ? (
          selectedRow.node.name
        ) : (
          ""
        )}
      </div>
    </div>
  );
}
