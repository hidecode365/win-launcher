import { FooterBar } from "./FooterBar";
import { KeyHint } from "./KeyHint";

export type MemoManageSelectedKind = "root" | "trash" | "folder" | "memo" | null;

// issue 0026 軸A：/memo を左ツリー＋右本文編集ペインの単一画面へ統合したことに伴い、
// 旧 MemoPanel.tsx（閲覧専用パネル）が持っていた本文編集関連のヒント
// （Ctrl+E／Ctrl+S／メモ行Enterでのクリップボードセット）をこのフッターへ統合した。
// issue 0026 補足仕様：メモ画面のEscapeは、お気に入り画面（ウィンドウを隠す）とは
// 非対称に「通常の検索画面へ戻る」（06-keyboard-interactions.md「メモ画面」表10・
// external-design/01-screen-transitions.md「メモ画面」行を参照）。ヘッダーの
// 「戻る」ボタンと同じ操作のため、ラベルは「戻る」で統一する（編集エリア
// フォーカス中のみ、本文編集を抜けて一覧側へ戻る意味の「一覧へ戻る」）。
export function MemoManageFooter({
  selectedKind,
  trashed,
  filtering,
  renaming,
  editorFocused,
  memoSelected,
  saveAvailable,
  version,
}: {
  selectedKind: MemoManageSelectedKind;
  trashed: boolean;
  filtering: boolean;
  renaming: boolean;
  editorFocused: boolean;
  memoSelected: boolean;
  saveAvailable: boolean;
  version: string;
}) {
  if (renaming) {
    return (
      <FooterBar version={version}>
        <KeyHint keys="Enter" label="確定" />
        <KeyHint keys="Ctrl+D" label="クリア" />
        <KeyHint keys="Esc" label="キャンセル" />
      </FooterBar>
    );
  }
  if (editorFocused) {
    return (
      <FooterBar version={version}>
        {saveAvailable && <KeyHint keys="Ctrl+S" label="保存" />}
        <KeyHint keys="Ctrl+D" label="クリア" />
        <KeyHint keys="Esc" label="一覧へ戻る" />
      </FooterBar>
    );
  }
  const editable = !trashed && (selectedKind === "folder" || selectedKind === "memo");
  const movable = selectedKind === "folder" || selectedKind === "memo";
  return (
    <FooterBar version={version}>
      <KeyHint keys="↑↓" label="選択" />
      {selectedKind === "memo" && !trashed && (
        <KeyHint keys="Enter" label="クリップボードにセット" />
      )}
      {(selectedKind === "folder" || selectedKind === "trash") && !filtering && (
        <KeyHint keys="Enter" label="開閉" />
      )}
      {!trashed && (selectedKind === "folder" || selectedKind === "memo") && (
        <KeyHint keys="Ctrl+Shift+N" label="フォルダ作成" />
      )}
      {editable && <KeyHint keys="F2" label="リネーム" />}
      {memoSelected && !trashed && <KeyHint keys="Ctrl+E" label="本文を編集" />}
      {movable && !filtering && !trashed && (
        <KeyHint keys="Ctrl+Shift+↑↓" label="並び替え" />
      )}
      {movable && !filtering && (
        <KeyHint
          keys={trashed ? "Ctrl+Shift+←" : "Ctrl+Shift+←→"}
          label={trashed ? "復元" : "再親化"}
        />
      )}
      <KeyHint keys="Ctrl+D" label="クリア" />
      <KeyHint keys="Esc" label="戻る" />
    </FooterBar>
  );
}
