import { FeatureToggle } from "./FeatureToggle";

export function OcrSettings({
  enabled,
  onToggle,
}: {
  enabled: boolean;
  onToggle: (checked: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <FeatureToggle
        label="OCR（画像からのテキスト抽出）"
        description="検索ボックスにフォーカスがある状態で画像をペースト（Ctrl+V）すると、画像内のテキストをOCRで抽出してプレビューします。"
        checked={enabled}
        onChange={onToggle}
      />
      <div className="flex items-start gap-3">
        <input type="checkbox" aria-hidden="true" tabIndex={-1} className="mt-0.5 flex-shrink-0 invisible" />
        <div className="text-xs text-gray-400 leading-relaxed">
          日本語のOCR言語パックが導入されている前提で、Windows OCR APIを使用します。
          <br />
          対応言語が不足する場合は、設定→時刻と言語→言語からOCR言語パックを追加してください。
        </div>
      </div>
    </div>
  );
}
