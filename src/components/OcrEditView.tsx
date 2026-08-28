import { Tooltip } from "./Tooltip";
import { OcrPreview } from "./OcrPreview";
import { OcrEditFooter } from "./OcrEditFooter";

// issue 0024：OCRをFullscreen OverlayからL1画面へ再構成した。
// 400_テスト・バグ修正：POの指摘を受け、ヘッダー構成をFavoriteEditView.tsx/
// MemoManageView.tsx/ClipboardEditView.tsx/RecentEditView.tsxと同じ型（戻る
// ボタン＋検索アイコン＋入力欄枠＋右端の設定アイコン）に揃えた。「閉じる」は
// 実質的に他画面の「戻る」と同じ操作のため、ここではSearchBoxコンポーネントを
// 再利用せず、戻るボタンを最上部左端に持てる専用ヘッダーを組む（共有SearchBoxに
// 戻るボタンの差し込み口を新設すると、通常検索画面という戻る概念を持たない
// 呼び出し元にまで影響するため、この画面専用の実装に留める）。入力欄自体は
// 「検索欄と同じ形の非活性入力欄」の要件どおり常にreadOnly・空文字で、
// クリック・キー入力とも何も起こさない。
export function OcrEditView({
  imageUrl,
  loading,
  text,
  error,
  onTextChange,
  onClose,
  onCopyAndClose,
  onOpenSettings,
  ocrRunId,
  version,
}: {
  imageUrl: string | null;
  loading: boolean;
  text: string | null;
  error: string | null;
  onTextChange: (t: string) => void;
  onClose: () => void;
  onCopyAndClose: () => void;
  onOpenSettings: () => void;
  ocrRunId: number;
  version: string;
}) {
  return (
    <div className="relative flex h-screen flex-col overflow-hidden rounded-2xl border border-white/20 bg-white/90 shadow-2xl backdrop-blur-xl">
      <header
        data-tauri-drag-region="deep"
        className="flex items-center border-b border-gray-200/60 px-4 py-3"
      >
        <Tooltip label="戻る" side="right" className="mr-2 flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </button>
        </Tooltip>
        <svg
          className="mr-3 h-5 w-5 flex-shrink-0 text-gray-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
        <input
          type="text"
          value=""
          readOnly
          tabIndex={-1}
          placeholder="OCR結果"
          className="flex-1 bg-transparent text-lg text-gray-800 outline-none placeholder-gray-400 opacity-50"
        />
        <Tooltip label="設定" className="ml-2 flex-shrink-0">
          <button
            type="button"
            onClick={onOpenSettings}
            className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a7.65 7.65 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.28Z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
              />
            </svg>
          </button>
        </Tooltip>
      </header>
      <OcrPreview
        key={ocrRunId}
        imageUrl={imageUrl}
        loading={loading}
        text={text}
        error={error}
        onTextChange={onTextChange}
        onCopyAndClose={onCopyAndClose}
      />
      <OcrEditFooter version={version} />
    </div>
  );
}
