import { Tooltip } from "./Tooltip";
import { FavoriteEditTree } from "./FavoriteEditTree";
import { FavoriteTreeRow } from "../types";

// お気に入り編集ビュー。4bで読み取り専用のツリー描画＋選択を実装した。
// フォルダの作成・削除・リネーム・ドラッグ&ドロップによる並び替えは 4c〜4e で
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
// ツリーのデータソース（favoriteTree）・折りたたみ状態（onToggleCollapse）は
// /favorite ブラウジング（useSearch.ts）とそのまま共有する。選択状態のみ、
// useFavoriteEditSelection による独立したドメインを App.tsx 側で持つ
// （props で selected/onSelectRowByKey として受け取る）。
export function FavoriteEditView({
  tree,
  selected,
  onSelectRowByKey,
  onToggleCollapse,
  onClose,
}: {
  tree: FavoriteTreeRow[];
  selected: number;
  onSelectRowByKey: (key: string) => void;
  onToggleCollapse: (folderId: string) => void;
  onClose: () => void;
}) {
  // 画面下部の詳細表示ペイン用。フォルダ見出し行選択時はフォルダ名のみ、
  // アイテム行選択時はフルパスを表示する（REQUIREMENTS.md「お気に入り編集ビュー」節）。
  const selectedRow = tree[selected] ?? null;

  return (
    <div className="flex flex-col h-screen bg-white/90 backdrop-blur-xl rounded-2xl overflow-hidden border border-white/20 shadow-2xl">
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

      <FavoriteEditTree
        tree={tree}
        selected={selected}
        onSelectRowByKey={onSelectRowByKey}
        onToggleCollapse={onToggleCollapse}
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
