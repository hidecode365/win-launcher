import type { PathPasteWizardStep } from "../hooks/useSearch";
import type { ResultRow } from "../types";
import { FooterBar } from "./FooterBar";
import { KeyHint } from "./KeyHint";

// 軸4k：キー操作ヒントを KeyHint（チップ表示）＋ FooterBar（右端バージョン番号）
// の共通部品に統一した。以前はモードごとに文言を1本の文字列として組み立てて
// いたが、KeyHint は「キー表記」「効果」を別々の prop として受け取るため、
// Enter の効果文言（モードにより変化する部分）だけを算出する変数に分離した。
export function StatusFooter({
  pendingCommand,
  webSearchVisible,
  isWebSearchSelected,
  clipboardMode,
  pathPasteWizardStep,
  prefixCommandMode,
  settingsShortcutAvailable,
  selectionAvailable,
  registerDialogOpen,
  updateDialogOpen,
  updateInstalling,
  selectedRowKind,
  version,
}: {
  pendingCommand: boolean;
  webSearchVisible: boolean;
  isWebSearchSelected: boolean;
  clipboardMode: boolean;
  pathPasteWizardStep: PathPasteWizardStep | null;
  prefixCommandMode: boolean;
  settingsShortcutAvailable: boolean;
  selectionAvailable: boolean;
  registerDialogOpen: boolean;
  updateDialogOpen: boolean;
  updateInstalling: boolean;
  // 通常モードで現在選択中の行（rows[selected]）の種類。rows に該当する行が
  // ない場合（clipboardMode・prefixCommandMode・Web検索行選択中・範囲外等）は
  // null。並び順・rows の詳細は CLAUDE.md「結果行のフラット配列化（R-1）」節を参照。
  selectedRowKind: ResultRow["kind"] | null;
  version: string;
}) {
  const settingsHint = settingsShortcutAvailable ? (
    <KeyHint keys="Ctrl+," label="設定を開く" />
  ) : null;

  if (updateDialogOpen) {
    return (
      <FooterBar version={version}>
        <KeyHint keys="Ctrl+D" label="クリア" />
        {settingsHint}
        <KeyHint keys="Esc" label={updateInstalling ? "ウィンドウを隠す" : "閉じる"} />
      </FooterBar>
    );
  }

  if (registerDialogOpen) {
    return (
      <FooterBar version={version}>
        <KeyHint keys="Enter" label="保存" />
        <KeyHint keys="Ctrl+D" label="クリア" />
        {settingsHint}
        <KeyHint keys="Esc" label="キャンセル" />
      </FooterBar>
    );
  }

  if (pendingCommand) {
    return (
      <FooterBar version={version}>
        <KeyHint keys="Ctrl+D" label="クリア" />
        {settingsHint}
        <KeyHint keys="Esc" label="キャンセル" />
      </FooterBar>
    );
  }

  if (pathPasteWizardStep) {
    return (
      <FooterBar version={version}>
        {pathPasteWizardStep === "folderSelect" && selectionAvailable && (
          <KeyHint keys="↑↓" label="選択" />
        )}
        {(pathPasteWizardStep === "nameEdit" || selectionAvailable) && (
          <KeyHint
            keys="Enter"
            label={pathPasteWizardStep === "folderSelect" ? "次へ" : "保存"}
          />
        )}
        <KeyHint keys="Ctrl+D" label="クリア" />
        {settingsHint}
        <KeyHint keys="Esc" label="戻る" />
      </FooterBar>
    );
  }

  const enterLabel = webSearchVisible && isWebSearchSelected
    ? "ブラウザで開く"
    : clipboardMode
      ? "クリップボードにセット"
      : prefixCommandMode
        ? "実行"
        : selectedRowKind === "pathPasteShortcut" ||
            selectedRowKind === "pathPasteAddFolder" ||
            selectedRowKind === "pathPastePin" ||
            selectedRowKind === "pathPasteFavorite"
          ? "選択"
          : selectedRowKind === "calc" || selectedRowKind === "urlConvert"
            ? "コピー"
            : "起動";

  return (
    <FooterBar version={version}>
      {selectionAvailable && <KeyHint keys="↑↓" label="選択" />}
      {selectionAvailable && <KeyHint keys="Enter" label={enterLabel} />}
      {(selectedRowKind === "pinned" || selectedRowKind === "file") && (
        <KeyHint keys="Shift+Enter" label="フォルダを開く" />
      )}
      <KeyHint keys="Ctrl+D" label="クリア" />
      {settingsHint}
      <KeyHint keys="Esc" label="閉じる" />
    </FooterBar>
  );
}
