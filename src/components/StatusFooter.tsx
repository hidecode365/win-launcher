import type { PathPasteWizardStep } from "../hooks/useSearch";
import type { ResultRow } from "../types";

export function StatusFooter({
  pendingCommand,
  webSearchVisible,
  isWebSearchSelected,
  clipboardMode,
  pathPasteWizardStep,
  prefixCommandMode,
  selectedRowKind,
  favoriteItemSelected,
}: {
  pendingCommand: boolean;
  webSearchVisible: boolean;
  isWebSearchSelected: boolean;
  clipboardMode: boolean;
  pathPasteWizardStep: PathPasteWizardStep | null;
  prefixCommandMode: boolean;
  // 通常モードで現在選択中の行（rows[selected]）の種類。rows に該当する行が
  // ない場合（clipboardMode・prefixCommandMode・Web検索行選択中・範囲外等）は
  // null。並び順・rows の詳細は CLAUDE.md「結果行のフラット配列化（R-1）」節を参照。
  selectedRowKind: ResultRow["kind"] | null;
  // /favorite モードでアイテム行が選択中かどうか。/favorite モードは rows を
  // 使わない専用一覧のため selectedRowKind では判定できず、別途渡す
  // （Shift+Enter フォルダを開くヒントの表示条件に使う）。
  favoriteItemSelected: boolean;
}) {
  return (
    <div className="px-4 py-1.5 border-t border-gray-200/60 flex items-center gap-3 text-xs text-gray-400">
      {pendingCommand ? (
        <>
          <span>Enter 実行</span>
          <span>Esc キャンセル</span>
        </>
      ) : pathPasteWizardStep ? (
        <>
          {pathPasteWizardStep === "folderSelect" && <span>↑↓ 選択</span>}
          <span>
            {pathPasteWizardStep === "folderSelect" ? "Enter 次へ" : "Enter 保存"}
          </span>
          <span>Esc 戻る</span>
        </>
      ) : (
        <>
          <span>↑↓ 選択</span>
          <span>
            {webSearchVisible && isWebSearchSelected
              ? "Enter ブラウザで開く"
              : clipboardMode
                ? "Enter クリップボードにセット"
                : prefixCommandMode
                  ? "Enter 実行"
                  : selectedRowKind === "pathPasteShortcut" ||
                      selectedRowKind === "pathPasteAddFolder"
                    ? "Enter 選択"
                    : selectedRowKind === "calc" ||
                        selectedRowKind === "urlConvert"
                      ? "Enter コピー"
                      : "Enter 起動"}
          </span>
          {(selectedRowKind === "pinned" ||
            selectedRowKind === "file" ||
            favoriteItemSelected) && (
            <span>Shift+Enter フォルダを開く</span>
          )}
          <span>Ctrl+D クリア</span>
          <span>Esc 閉じる</span>
        </>
      )}
    </div>
  );
}
