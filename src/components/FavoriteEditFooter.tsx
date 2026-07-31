// お気に入り編集ビューのキー操作・アイコン操作ヒント。/favorite ブラウジング側の
// StatusFooter.tsx と同じ視覚スタイル（`<span>` チップの並び）を踏襲するが、
// 編集ビュー固有の操作（F2 リネーム・🗑 削除・★ 解除等）を持つため別コンポーネント
// として独立させる（StatusFooter.tsx はブラウジング/クリップボード/プレフィックス
// コマンド等の複数モードを1つに束ねた汎用フッターであり、編集ビュー用の分岐を
// そこへ増設すると条件分岐がさらに複雑化するため）。
//
// 選択中の行の種別ごとに、その行で実際に使える操作だけを表示する：
// - フォルダ選択中：↑↓ 選択／Enter 開閉／F2 リネーム／🗑 削除／ドラッグで並び替え
// - アイテム選択中：↑↓ 選択／F2 リネーム／★ 解除／ドラッグで並び替え
// - 何も選択されていない（tree が空）：「+ ここにフォルダを作成」のみ
//   （CreateFolderRow のボタン文言と一致させる。ドラッグ対象の行自体が無いため
//   ドラッグのヒントは表示しない）
// Esc 戻る はどの状態でも共通（ヘッダーの「戻る」ボタンと同じ操作）。
// 「ドラッグで並び替え」（4e）はフォルダ・アイテムどちらの行にも常に表示する
// （マウス操作のみで、選択状態によって可否が変わる操作ではないため）。
export function FavoriteEditFooter({
  selectedKind,
}: {
  selectedKind: "folder" | "item" | null;
}) {
  return (
    <div className="px-4 py-1.5 border-t border-gray-200/60 flex items-center gap-3 text-xs text-gray-400">
      {selectedKind === "folder" ? (
        <>
          <span>↑↓ 選択</span>
          <span>Enter 開閉</span>
          <span>F2 リネーム</span>
          <span>🗑 削除</span>
          <span>ドラッグで並び替え</span>
        </>
      ) : selectedKind === "item" ? (
        <>
          <span>↑↓ 選択</span>
          <span>F2 リネーム</span>
          <span>★ 解除</span>
          <span>ドラッグで並び替え</span>
        </>
      ) : (
        <span>+ ここにフォルダを作成</span>
      )}
      <span>Esc 戻る</span>
    </div>
  );
}
