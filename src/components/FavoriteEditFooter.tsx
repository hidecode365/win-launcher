// お気に入り編集ビューのキー操作ヒント。/favorite ブラウジング側の
// StatusFooter.tsx と同じ視覚スタイル（`<span>` チップの並び）を踏襲するが、
// 編集ビュー固有の操作（F2 リネーム・Delete 削除/★解除・Alt+矢印による並び替え・
// 再親化等）を持つため別コンポーネントとして独立させる（StatusFooter.tsx は
// ブラウジング/クリップボード/プレフィックスコマンド等の複数モードを1つに束ねた
// 汎用フッターであり、編集ビュー用の分岐をそこへ増設すると条件分岐がさらに
// 複雑化するため）。
//
// 「フッター表示規約（全画面共通）」（REQUIREMENTS.md「キー操作」節）に従い、
// ここにはキーボード操作のみを表示する。ドラッグ&ドロップ・アイコンクリック等の
// マウス専用操作はここには表示しない（マウスでのみ可能な操作の存在は
// ツールチップとホバー反応で示す）。
//
// 選択中の行の種別ごとに、その行で実際に使える操作だけを表示する：
// - Top選択中：↑↓ 選択／Ctrl+Shift+N フォルダ作成（Topはリネーム・削除・★解除・
//   並び替え・再親化のいずれの対象にもならないため、それらは表示しない）
// - フォルダ選択中：↑↓ 選択／Enter 開閉／Ctrl+Shift+N フォルダ作成／Delete 削除／
//   F2 リネーム／Alt+↑↓ 並び替え／Alt+←→ 再親化
// - アイテム選択中：↑↓ 選択／Ctrl+Shift+N フォルダ作成／Delete ★解除／
//   F2 リネーム／Alt+↑↓ 並び替え／Alt+←→ 再親化
// Esc 戻る はどの状態でも共通（ヘッダーの「戻る」ボタンと同じ操作）。
//
// 軸4g：絞り込み中（filtering）は、フォルダ開閉（Enter 開閉）・並び替え
// （Alt+↑↓）・再親化（Alt+←→）が無効化される（REQUIREMENTS.md「お気に入り
// 編集ビュー」節を参照）ため、これら3つのヒントは絞り込み中のみ非表示にする
// （「今何ができるか」を示すフッターの原則に従う）。リネーム・削除・★解除・
// フォルダ作成は絞り込み中でも有効なままのため、ヒントも表示し続ける。
export function FavoriteEditFooter({
  selectedKind,
  filtering,
}: {
  selectedKind: "top" | "folder" | "item" | null;
  filtering: boolean;
}) {
  return (
    <div className="px-4 py-1.5 border-t border-gray-200/60 flex items-center gap-3 text-xs text-gray-400 flex-wrap">
      <span>↑↓ 選択</span>
      {selectedKind === "folder" && !filtering && <span>Enter 開閉</span>}
      <span>Ctrl+Shift+N フォルダ作成</span>
      {selectedKind === "folder" && <span>Delete 削除</span>}
      {selectedKind === "item" && <span>Delete ★解除</span>}
      {(selectedKind === "folder" || selectedKind === "item") && (
        <span>F2 リネーム</span>
      )}
      {(selectedKind === "folder" || selectedKind === "item") && !filtering && (
        <>
          <span>Alt+↑↓ 並び替え</span>
          <span>Alt+←→ 再親化</span>
        </>
      )}
      <span>Esc 戻る</span>
    </div>
  );
}
