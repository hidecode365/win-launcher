import { useLayoutEffect, useRef, useState } from "react";
import { ResizableSplitPane } from "./ResizableSplitPane";
import { ActionButton } from "./ActionButton";
import { EDITOR_SURFACE_CLASS } from "../ui/sharedStyles";

// 400_テスト・バグ修正（issue 0024）：
// - 「閉じる」はOCR画面の「戻る」操作そのものであり、他のL1画面と同じく画面最上部
//   左端のヘッダーへ移設した（OcrEditView.tsx を参照）。このコンポーネント自身は
//   もう「閉じる」ボタンを持たない
// - 「コピーして閉じる」はメモ画面と同じく、本文（textarea）の直上に配置する
//   （以前は下に配置しており、レイアウトの型がメモ画面と揃っていなかった）
// - 初期分割幅は固定px値ではなく、実際に描画されたコンテナ幅の50%から算出する。
//   固定px（旧実装は320px）だとウィンドウ幅によって50:50からずれるため、
//   useLayoutEffectでマウント直後に実測してから初期幅を確定する（描画前に確定する
//   ため画面のちらつきは発生しない）。新しい画像が貼り付けられるたびに
//   OcrEditView.tsx側のkey={ocrRunId}でこのコンポーネント自体が再マウントされ、
//   このロジックも再実行される。
export function OcrPreview({
  imageUrl,
  loading,
  text,
  error,
  onTextChange,
  onCopyAndClose,
}: {
  imageUrl: string | null;
  loading: boolean;
  text: string | null;
  error: string | null;
  onTextChange: (t: string) => void;
  onCopyAndClose: () => void;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [initialLeftWidth, setInitialLeftWidth] = useState<number | null>(null);

  useLayoutEffect(() => {
    const width = wrapperRef.current?.getBoundingClientRect().width ?? 0;
    setInitialLeftWidth(width > 0 ? width / 2 : null);
  }, []);

  return (
    <div
      ref={wrapperRef}
      className="flex-1 min-h-0 flex border-t border-gray-200/60"
    >
      {initialLeftWidth !== null && (
        <ResizableSplitPane
          className="flex-1"
          initialLeftWidth={initialLeftWidth}
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
                <div className="flex justify-end flex-shrink-0">
                  <ActionButton onClick={onCopyAndClose}>
                    コピーして閉じる
                  </ActionButton>
                </div>
                <textarea
                  className={`flex-1 min-h-0 overflow-y-auto ${EDITOR_SURFACE_CLASS}`}
                  value={text}
                  onChange={(e) => onTextChange(e.target.value)}
                  autoFocus
                />
              </div>
            )}
          </div>}
        />
      )}
    </div>
  );
}
