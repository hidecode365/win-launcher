// フォルダ削除確認モーダル。お気に入り編集ビュー（FavoriteEditView.tsx。4c）が使う
// （/favorite ブラウジング側の暫定削除UIは編集ビュー完成に伴い撤去済み。詳細は
// docs/design/favorites-data-model.md#favorite-mode-provisional-features を参照）。
// 既存の SystemCommandModal・FileSearchSettings.tsx の削除確認モーダルと同じ見た目の
// パターンを踏襲する。
//
// 呼び出し側（App.tsx）が useSearch.ts の pendingDeleteFavoriteFolder/
// cancelDeleteFavoriteFolder/confirmDeleteFavoriteFolder をそのまま props として渡す。
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
