import { ResizableSplitPane } from "./ResizableSplitPane";
import { ActionButton } from "./ActionButton";
import { EDITOR_SURFACE_CLASS } from "../ui/sharedStyles";

export function OcrPreview({
  imageUrl,
  loading,
  text,
  error,
  onTextChange,
  onClose,
  onCopyAndClose,
}: {
  imageUrl: string | null;
  loading: boolean;
  text: string | null;
  error: string | null;
  onTextChange: (t: string) => void;
  onClose: () => void;
  onCopyAndClose: () => void;
}) {
  return (
    <ResizableSplitPane
      className="flex-1 border-t border-gray-200/60"
      initialLeftWidth={320}
      left={<div className="h-full flex items-center justify-center overflow-hidden p-3">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt=""
            className="max-w-full max-h-full object-contain"
          />
        ) : (
          <div className="text-gray-400 text-sm">画像がありません</div>
        )}
      </div>}
      right={<div className="h-full flex flex-col p-3 gap-2 overflow-hidden">
        {loading && (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <svg
              className="w-4 h-4 animate-spin text-blue-500 flex-shrink-0"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8v8z"
              />
            </svg>
            OCR処理中...
          </div>
        )}

        {error && !loading && (
          <div className="text-xs text-red-500 leading-snug">{error}</div>
        )}

        {text !== null && !loading && (
          <div className="flex-1 flex flex-col min-h-0 gap-2">
            <textarea
              className={`flex-1 min-h-0 overflow-y-auto ${EDITOR_SURFACE_CLASS}`}
              value={text}
              onChange={(e) => onTextChange(e.target.value)}
              autoFocus
            />
            <div className="flex justify-end gap-2 flex-shrink-0">
              <ActionButton
                variant="secondary"
                onClick={onClose}
              >
                閉じる
              </ActionButton>
              <ActionButton
                onClick={onCopyAndClose}
              >
                コピーして閉じる
              </ActionButton>
            </div>
          </div>
        )}
      </div>}
    />
  );
}
