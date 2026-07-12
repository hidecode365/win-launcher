export function StatusFooter({
  pendingCommand,
  webSearchVisible,
  isWebSearchSelected,
  clipboardMode,
  calcMode,
  systemMode,
  isUrlConvertSelected,
}: {
  pendingCommand: boolean;
  webSearchVisible: boolean;
  isWebSearchSelected: boolean;
  clipboardMode: boolean;
  calcMode: boolean;
  systemMode: boolean;
  isUrlConvertSelected: boolean;
}) {
  return (
    <div className="px-4 py-1.5 border-t border-gray-200/60 flex items-center gap-3 text-xs text-gray-400">
      {pendingCommand ? (
        <>
          <span>Enter 実行</span>
          <span>Esc キャンセル</span>
        </>
      ) : (
        <>
          <span>↑↓ 選択</span>
          <span>
            {webSearchVisible && isWebSearchSelected
              ? "Enter ブラウザで開く"
              : clipboardMode
                ? "Enter クリップボードにセット"
                : calcMode
                  ? "Enter コピー"
                  : systemMode
                    ? "Enter 確認"
                    : isUrlConvertSelected
                      ? "Enter コピー"
                      : "Enter 起動"}
          </span>
          <span>Esc 閉じる</span>
        </>
      )}
    </div>
  );
}
