import { SystemCommand } from "../types";
import { logUiEvent } from "../lib/uiDebugLog";

export function SystemCommandModal({
  command,
  onCancel,
  onConfirm,
}: {
  command: SystemCommand;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/30 backdrop-blur-sm">
      <div className="w-72 rounded-xl bg-white p-5 shadow-2xl">
        <div className="text-sm font-medium text-gray-800">
          {command.label}を実行しますか？
        </div>
        <div className="mt-1 text-xs text-gray-400">
          この操作は元に戻せません
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={(e) => {
              // 400_テスト・バグ修正：調査用ログ（詳細は src/lib/uiDebugLog.ts を参照）。
              void logUiEvent(
                `[modal-cancel-click] x=${e.clientX} y=${e.clientY}`
              );
              onCancel();
            }}
            className="rounded px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={(e) => {
              void logUiEvent(
                `[modal-confirm-click] x=${e.clientX} y=${e.clientY}`
              );
              onConfirm();
            }}
            className="rounded bg-red-500 px-3 py-1.5 text-sm text-white hover:bg-red-600"
          >
            実行
          </button>
        </div>
      </div>
    </div>
  );
}
