// フォルダ削除確認モーダル。/favorite ブラウジングの暫定UI（FavoriteListPanel.tsx
// の削除アイコン）・お気に入り編集ビュー（FavoriteEditView.tsx。4c）の両方から
// 共有する。既存の SystemCommandModal・FileSearchSettings.tsx の削除確認モーダルと
// 同じ見た目のパターンを踏襲する。
//
// 呼び出し側（App.tsx）が useSearch.ts の pendingDeleteFavoriteFolder/
// cancelDeleteFavoriteFolder/confirmDeleteFavoriteFolder をそのまま props として渡す。
// 状態自体は共有しているが、削除確定後にどちらの選択ドメイン（ブラウジング側の
// intent／編集ビューの useFavoriteEditSelection）をリセットするかは、request 側
// （requestDeleteFavoriteFolder の onRemoved 引数）で呼び出し元ごとに切り替え済みの
// ため、このモーダル自体はどちらの文脈から開かれたかを意識しない。
export function FavoriteFolderDeleteModal({
  target,
  onCancel,
  onConfirm,
}: {
  target: { name: string; descendantCount: number };
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="w-72 rounded-xl bg-white p-5 shadow-2xl">
        <div className="text-sm font-medium text-gray-800">
          「{target.name}」を削除しますか？
        </div>
        <div className="mt-1 text-xs text-gray-400">
          フォルダ内の{target.descendantCount}
          件の登録情報が削除されます。実ファイルは削除されません。
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded bg-red-500 px-3 py-1.5 text-sm text-white hover:bg-red-600"
          >
            削除
          </button>
        </div>
      </div>
    </div>
  );
}
