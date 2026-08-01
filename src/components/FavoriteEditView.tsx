import { Tooltip } from "./Tooltip";
import { FavoriteEditTree } from "./FavoriteEditTree";
import { FavoriteFolderDeleteModal } from "./FavoriteFolderDeleteModal";
import { FavoriteEditFooter } from "./FavoriteEditFooter";
import { CreateFolderResult, FavoriteEditTreeRow, FileEntry } from "../types";

// お気に入り編集ビュー。4bで読み取り専用のツリー描画＋選択、4cでフォルダの
// 作成・削除、4dでリネームを実装した。4eでドラッグ&ドロップによる並び替え・
// 再親化、軸4fで仮想行「Top」・Delete/Ctrl+Shift+N/Alt+矢印キーによる操作・
// 行内アイコン化（フォルダ作成ボタンの撤去）を実装した
// （REQUIREMENTS.md「お気に入り編集ビュー」節を参照）。
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
}: {
  tree: FavoriteEditTreeRow[];
  selected: number;
  onSelectRowByKey: (key: string) => void;
  onToggleCollapse: (folderId: string) => void;
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
}) {
  // 画面下部の詳細表示ペイン用。フォルダ見出し行選択時はフォルダ名のみ、
  // アイテム行選択時はフルパスを表示する（REQUIREMENTS.md「お気に入り編集ビュー」節）。
  // 仮想行「Top」選択時は実体を持たないため固定文言「Top」を表示する。
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

      <FavoriteEditFooter selectedKind={selectedRow?.kind ?? null} />

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
        ) : selectedRow?.kind === "top" ? (
          "Top"
        ) : (
          ""
        )}
      </div>
    </div>
  );
}
