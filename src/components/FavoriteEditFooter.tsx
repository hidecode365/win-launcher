import { FooterBar } from "./FooterBar";
import { KeyHint } from "./KeyHint";

// お気に入り編集ビューのキー操作ヒント。/favorite ブラウジング側の
// StatusFooter.tsx と同じ視覚スタイル（KeyHint チップの並び。共通コンポーネント
// を軸4kで両者に切り出した）を踏襲するが、編集ビュー固有の操作（F2 リネーム・
// Delete 削除/★解除・Ctrl+Shift+矢印による並び替え・再親化等）を持つため別
// コンポーネントとして独立させる（StatusFooter.tsx はブラウジング/クリップ
// ボード/プレフィックスコマンド等の複数モードを1つに束ねた汎用フッターであり、
// 編集ビュー用の分岐をそこへ増設すると条件分岐がさらに複雑化するため）。
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
//   F2 リネーム／Ctrl+Shift+↑↓ 並び替え／Ctrl+Shift+←→ 再親化
// - アイテム選択中：↑↓ 選択／Ctrl+Shift+N フォルダ作成／Delete ★解除／
//   F2 リネーム／Ctrl+Shift+↑↓ 並び替え／Ctrl+Shift+←→ 再親化
// Esc 戻る はどの状態でも共通（ヘッダーの「戻る」ボタンと同じ操作）。
//
// 軸4j：並び替え・再親化のキー割当は最終的に Ctrl+Shift+↑↓←→ に統一した
// （上下＝並び替え、左右＝再親化）。当初のAlt+↑↓←→のうち、Alt+←/→はWebView2
// 既定の「戻る/進む」ナビゲーションアクセラレーターとして処理され無反応になる
// 不具合があり軸4hでCtrl+Shift+←/→へ変更、軸4jで並び替え側のAlt+↑/↓も表記を
// 揃えてCtrl+Shift+↑/↓へ変更した。
//
// 絞り込み中（filtering）は、フォルダ開閉（Enter 開閉）・並び替え
// （Ctrl+Shift+↑↓）・再親化（Ctrl+Shift+←→）が無効化される（REQUIREMENTS.md
// 「お気に入り編集ビュー」節を参照）ため、これら3つのヒントは絞り込み中のみ
// 非表示にする（「今何ができるか」を示すフッターの原則に従う）。リネーム・
// 削除・★解除・フォルダ作成は絞り込み中でも有効なままのため、ヒントも表示し
// 続ける。
//
// 軸4k：右端のバージョン番号表示・キー操作チップの共通スタイルは
// FooterBar.tsx/KeyHint.tsx に切り出し、全画面で共有する。
export function FavoriteEditFooter({
  selectedKind,
  filtering,
  version,
}: {
  selectedKind: "top" | "folder" | "item" | null;
  filtering: boolean;
  version: string;
}) {
  return (
    <FooterBar version={version}>
      <KeyHint keys="↑↓" label="選択" />
      {selectedKind === "folder" && !filtering && (
        <KeyHint keys="Enter" label="開閉" />
      )}
      <KeyHint keys="Ctrl+Shift+N" label="フォルダ作成" />
      {selectedKind === "folder" && <KeyHint keys="Delete" label="削除" />}
      {selectedKind === "item" && <KeyHint keys="Delete" label="★解除" />}
      {(selectedKind === "folder" || selectedKind === "item") && (
        <KeyHint keys="F2" label="リネーム" />
      )}
      {(selectedKind === "folder" || selectedKind === "item") && !filtering && (
        <>
          <KeyHint keys="Ctrl+Shift+↑↓" label="並び替え" />
          <KeyHint keys="Ctrl+Shift+←→" label="再親化" />
        </>
      )}
      <KeyHint keys="Esc" label="戻る" />
    </FooterBar>
  );
}
