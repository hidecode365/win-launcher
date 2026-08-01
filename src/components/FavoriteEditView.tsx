import { useEffect, useRef } from "react";
import { Tooltip } from "./Tooltip";
import { FavoriteEditTree } from "./FavoriteEditTree";
import { FavoriteFolderDeleteModal } from "./FavoriteFolderDeleteModal";
import { FavoriteEditFooter } from "./FavoriteEditFooter";
import { CreateFolderResult, FavoriteEditTreeRow, FileEntry } from "../types";

// お気に入り編集ビュー。4bで読み取り専用のツリー描画＋選択、4cでフォルダの
// 作成・削除、4dでリネームを実装した。4eでドラッグ&ドロップによる並び替え・
// 再親化、軸4fで仮想行「Top」（表示名は軸4gで「お気に入り」へ改称）・
// Delete/Ctrl+Shift+N/Alt+矢印キーによる操作・行内アイコン化（フォルダ作成
// ボタンの撤去）を実装した。軸4gではヘッダーを固定見出しから常時表示の検索
// ボックスに置き換え、絞り込み機能を追加した（REQUIREMENTS.md「お気に入り
// 編集ビュー」節を参照）。
//
// ヘッダーの構成（戻るボタン＋検索ボックス＋ドラッグ領域）は SearchBox.tsx と
// 同じ視覚パターンを踏襲する。
//
// 「検索」「設定」に続く3枚目のビューとして、App.tsx の view state 切り替えのみで
// 表示する（新規のOSウィンドウは作らない）。useSearch/useSettings 自体はこの
// ビューを開いてもアンマウントされないため、閉じて /favorite ブラウジングへ戻った
// 際の絞り込み文字列・選択位置・フォルダ展開状態の保持は、この仕組み自体から自動的に
// 得られる（専用の保存・復元コードをここに持たせる必要はない）。
//
// ツリーのデータソース（tree）・折りたたみ状態（onToggleCollapse）は /favorite
// ブラウジングとそのまま共有する favoriteTree に、仮想行「Top」を先頭に合成した
// もの（App.tsx が useFavoriteEditSelection 経由で渡す）。フォルダ作成/削除/
// リネーム/移動の実コマンド呼び出し（createFavoriteFolder/
// requestDeleteFavoriteFolder 等、useSearch.ts に定義）は編集ビュー専用
// （/favorite ブラウジング側の暫定UIは撤去済み）。選択状態のみ、
// useFavoriteEditSelection による独立したドメインを App.tsx 側で持つ（props で
// selected/onSelectRowByKey として受け取る）。
//
// 画面下部の固定「+ ここにフォルダを作成」ボタンは撤去済み。フォルダ作成の起点は
// 選択中の行（Topを含む）に表示する行内アイコン、または Ctrl+Shift+N キー
// （App.tsx の window レベルリスナー）に一本化した（REQUIREMENTS.md
// 「お気に入り編集ビュー」節を参照）。
export function FavoriteEditView({
  tree,
  selected,
  onSelectRowByKey,
  onToggleCollapse,
  filterText,
  onFilterTextChange,
  onCreateFolder,
  onFolderCreated,
  creatingFolderAnchorKey,
  onStartCreateFolder,
  onCancelCreateFolder,
  onRequestDeleteFolder,
  pendingDeleteFolder,
  onCancelDeleteFolder,
  onConfirmDeleteFolder,
  onToggleFavorite,
  onMoveNode,
  renamingNodeId,
  onStartRename,
  onCancelRename,
  onConfirmRename,
  onClose,
  version,
}: {
  tree: FavoriteEditTreeRow[];
  selected: number;
  onSelectRowByKey: (key: string) => void;
  onToggleCollapse: (folderId: string) => void;
  // 軸4g：編集ビュー専用の絞り込み文字列。ヘッダーの検索ボックスに束縛する
  // （REQUIREMENTS.md「お気に入り編集ビュー」節を参照）。
  filterText: string;
  onFilterTextChange: (text: string) => void;
  onCreateFolder: (
    parentId: string,
    name: string
  ) => Promise<CreateFolderResult>;
  onFolderCreated: (folderId: string) => void;
  creatingFolderAnchorKey: string | null;
  onStartCreateFolder: () => void;
  onCancelCreateFolder: () => void;
  onRequestDeleteFolder: (folderId: string, name: string) => void;
  pendingDeleteFolder: { name: string; descendantCount: number } | null;
  onCancelDeleteFolder: () => void;
  onConfirmDeleteFolder: () => void;
  onToggleFavorite: (file: FileEntry) => void;
  onMoveNode: (
    id: string,
    newParentId: string,
    targetIndex: number
  ) => Promise<string | null>;
  renamingNodeId: string | null;
  onStartRename: (id: string) => void;
  onCancelRename: () => void;
  onConfirmRename: (id: string, newName: string) => Promise<string | null>;
  onClose: () => void;
  version: string;
}) {
  // マウント時（編集ビューを開いた時点）に検索ボックスへフォーカスする
  // （メイン検索画面の SearchBox と同じ「常にフォーカスされた入力欄」という
  // 前提。↑↓・F2・Delete・Ctrl+Shift+N・Alt+矢印は window レベルリスナーが
  // フォーカス位置に関わらず処理するため、この入力欄にフォーカスがあっても
  // ツリー操作は妨げられない）。
  const filterInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    filterInputRef.current?.focus();
  }, []);

  const filtering = filterText.length > 0;
  // フッター（FavoriteEditFooter）へ渡す選択中の行種別の算出用。
  const selectedRow = tree[selected] ?? null;

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
        <svg
          className="w-5 h-5 text-gray-400 mr-3 flex-shrink-0"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
        <input
          ref={filterInputRef}
          type="text"
          value={filterText}
          onChange={(e) => onFilterTextChange(e.target.value)}
          onKeyDown={(e) => {
            // 軸4g：Delete のみ、通常のテキスト編集（文字の後方削除）として
            // window レベルリスナーへ伝播させない。それ以外のキー（Escape・
            // ↑↓・F2・Ctrl+Shift+N・Alt+矢印）は、絞り込み中でもリネーム・
            // 削除・★解除・フォルダ作成・選択移動を通常通り行えるよう、あえて
            // stopPropagation せず window レベルリスナーへ伝播させる
            // （REQUIREMENTS.md「お気に入り編集ビュー」節「絞り込み文字列が
            // 1文字以上入力されている間は...リネーム・削除・★解除・フォルダ
            // 作成は...通常通り操作可能とする」を参照）。
            if (e.key === "Delete") {
              e.stopPropagation();
            }
          }}
          placeholder="お気に入りを絞り込み..."
          className="flex-1 bg-transparent outline-none text-lg text-gray-800 placeholder-gray-400"
          autoComplete="off"
          spellCheck={false}
        />
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
        filtering={filtering}
        onRequestDeleteFolder={onRequestDeleteFolder}
        onToggleFavorite={onToggleFavorite}
        onMoveNode={onMoveNode}
        renamingNodeId={renamingNodeId}
        onStartRename={onStartRename}
        onCancelRename={onCancelRename}
        onConfirmRename={onConfirmRename}
        onCreateFolder={onCreateFolder}
        onFolderCreated={onFolderCreated}
        creatingFolderAnchorKey={creatingFolderAnchorKey}
        onStartCreateFolder={onStartCreateFolder}
        onCancelCreateFolder={onCancelCreateFolder}
      />

      <FavoriteEditFooter
        selectedKind={selectedRow?.kind ?? null}
        filtering={filtering}
        version={version}
      />
    </div>
  );
}
