import { useRef } from "react";
import { SearchBox } from "./SearchBox";
import { OcrPreview } from "./OcrPreview";
import { OcrEditFooter } from "./OcrEditFooter";

// issue 0024：OCRをFullscreen OverlayからL1画面へ再構成した。上部は他のL1画面と
// 位置を揃えた「検索欄と同じ形の非活性入力欄」とする。既存のSearchBoxコンポーネント
// は disabled prop で <input readOnly> にマッピングされる実装を既に持つため、
// そのまま流用する（歯車ボタンはdisabledの影響を受けず常時クリック可能なため、
// Ctrl+,に加えマウスでも設定を開ける）。query は常に空文字の固定値でよい
// （このL1画面滞在中、検索ボックスの内容を表示・編集する必要はない）。
// key に ocrRunId を使い、新しい画像が貼り付けられるたびにOcrPreviewを再マウント
// して左右ペインの分割幅を50:50の初期状態にリセットする（既存の挙動を維持）。
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
  const dummyInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="relative flex h-screen flex-col overflow-hidden rounded-2xl border border-white/20 bg-white/90 shadow-2xl backdrop-blur-xl">
      <SearchBox
        inputRef={dummyInputRef}
        query=""
        onQueryChange={() => {}}
        onKeyDown={() => {}}
        disabled
        onOpenSettings={onOpenSettings}
      />
      <OcrPreview
        key={ocrRunId}
        imageUrl={imageUrl}
        loading={loading}
        text={text}
        error={error}
        onTextChange={onTextChange}
        onClose={onClose}
        onCopyAndClose={onCopyAndClose}
      />
      <OcrEditFooter version={version} />
    </div>
  );
}
