import { SystemCommand } from "../types";

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
            onClick={onCancel}
            className="rounded px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded bg-red-500 px-3 py-1.5 text-sm text-white hover:bg-red-600"
          >
            実行
          </button>
        </div>
      </div>
    </div>
  );
}
