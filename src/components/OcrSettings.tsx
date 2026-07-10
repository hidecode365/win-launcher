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
      <div className="text-xs text-gray-400 leading-relaxed">
        Windows OCR APIを使用します。日本語・英語の混在に対応しています。
        <br />
        対応言語が利用できない場合は、設定→時刻と言語→言語から該当言語のOCRパックをインストールしてください。
      </div>
    </div>
  );
}
