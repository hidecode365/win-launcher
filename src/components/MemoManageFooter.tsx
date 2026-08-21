import { FooterBar } from "./FooterBar";
import { KeyHint } from "./KeyHint";

export type MemoManageSelectedKind = "root" | "trash" | "folder" | "memo" | null;

export function MemoManageFooter({
  selectedKind,
  trashed,
  filtering,
  renaming,
  version,
}: {
  selectedKind: MemoManageSelectedKind;
  trashed: boolean;
  filtering: boolean;
  renaming: boolean;
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
  const editable = !trashed && (selectedKind === "folder" || selectedKind === "memo");
  const movable = selectedKind === "folder" || selectedKind === "memo";
  return (
    <FooterBar version={version}>
      <KeyHint keys="↑↓" label="選択" />
      {(selectedKind === "folder" || selectedKind === "trash") && !filtering && (
        <KeyHint keys="Enter" label="開閉" />
      )}
      {!trashed && (selectedKind === "root" || selectedKind === "folder" || selectedKind === "memo") && (
        <KeyHint keys="Ctrl+Shift+N" label="フォルダ作成" />
      )}
      {editable && <KeyHint keys="F2" label="リネーム" />}
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
