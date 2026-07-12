import { UpdateDialogState } from "../hooks/useUpdater";

export function UpdateDialog({
  state,
  onInstall,
  onDismiss,
}: {
  state: UpdateDialogState;
  onInstall: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="w-80 max-h-[80%] flex flex-col rounded-xl bg-white p-5 shadow-2xl">
        {state.kind === "checking" && (
          <div className="text-sm text-gray-600">
            アップデートを確認しています…
          </div>
        )}

        {state.kind === "upToDate" && (
          <>
            <div className="text-sm font-medium text-gray-800">
              最新バージョンです
            </div>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={onDismiss}
                className="rounded px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50"
              >
                閉じる
              </button>
            </div>
          </>
        )}

        {state.kind === "error" && (
          <>
            <div className="text-sm font-medium text-gray-800">
              アップデートを確認できませんでした
            </div>
            <div className="mt-1 text-xs text-gray-400">{state.message}</div>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={onDismiss}
                className="rounded px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50"
              >
                閉じる
              </button>
            </div>
          </>
        )}

        {state.kind === "available" && (
          <>
            <div className="text-sm font-medium text-gray-800">
              v{state.version} が利用可能です
            </div>
            {state.notes && (
              <div className="mt-2 flex-1 min-h-0 overflow-y-auto whitespace-pre-wrap rounded border border-gray-100 bg-gray-50 p-2 text-xs text-gray-600">
                {state.notes}
              </div>
            )}
            <div className="mt-4 flex justify-end gap-2 flex-shrink-0">
              <button
                type="button"
                onClick={onDismiss}
                className="rounded px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
              >
                後で
              </button>
              <button
                type="button"
                onClick={onInstall}
                className="rounded bg-blue-500 px-3 py-1.5 text-sm text-white hover:bg-blue-600"
              >
                今すぐ更新
              </button>
            </div>
          </>
        )}

        {state.kind === "installing" && (
          <>
            <div className="flex items-center gap-2 text-sm text-gray-700">
              <span className="h-4 w-4 flex-shrink-0 animate-spin rounded-full border-2 border-gray-300 border-t-blue-500" />
              ダウンロード中です…
            </div>
            <div className="mt-1 text-xs text-gray-400">
              完了後、更新を適用するためアプリを再起動します。
            </div>
          </>
        )}
      </div>
    </div>
  );
}
