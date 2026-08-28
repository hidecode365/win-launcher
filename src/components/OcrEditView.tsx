import { Tooltip } from "./Tooltip";
import { SettingsButton } from "./SettingsButton";
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
        <SettingsButton onOpenSettings={onOpenSettings} className="ml-2" />
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
