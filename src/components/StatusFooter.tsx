export function StatusFooter({
  pendingCommand,
  webSearchVisible,
  isWebSearchSelected,
  clipboardMode,
  isCalcSelected,
  prefixCommandMode,
  isUrlConvertSelected,
  isFileSelected,
}: {
  pendingCommand: boolean;
  webSearchVisible: boolean;
  isWebSearchSelected: boolean;
  clipboardMode: boolean;
  isCalcSelected: boolean;
  prefixCommandMode: boolean;
  isUrlConvertSelected: boolean;
  isFileSelected: boolean;
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
                : prefixCommandMode
                  ? "Enter 実行"
                  : isCalcSelected || isUrlConvertSelected
                    ? "Enter コピー"
                    : "Enter 起動"}
          </span>
          {isFileSelected && <span>Shift+Enter フォルダを開く</span>}
          <span>Ctrl+D クリア</span>
          <span>Esc 閉じる</span>
        </>
      )}
    </div>
  );
}
