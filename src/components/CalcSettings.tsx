import { FeatureToggle } from "./FeatureToggle";

export function CalcSettings({
  enabled,
  onToggle,
  copyWithComma,
  onToggleCopyWithComma,
}: {
  enabled: boolean;
  onToggle: (checked: boolean) => void;
  copyWithComma: boolean;
  onToggleCopyWithComma: (checked: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <FeatureToggle
        label="数式計算"
        description="検索ボックスに数式を入力したときに計算結果を表示します。"
        checked={enabled}
        onChange={onToggle}
      />
      <div className="pt-3 border-t border-gray-200/60">
        <FeatureToggle
          label="計算結果をカンマ区切りでコピー"
          description="OFF にすると Enter でのコピー時にカンマなしの数値（例: 1000）でコピーします。画面上の表示は常にカンマ区切りのままです。"
          checked={copyWithComma}
          onChange={onToggleCopyWithComma}
        />
      </div>
    </div>
  );
}
