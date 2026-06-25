import { FeatureToggle } from "./FeatureToggle";

export function WebSearchSettings({
  enabled,
  onToggle,
}: {
  enabled: boolean;
  onToggle: (checked: boolean) => void;
}) {
  return (
    <FeatureToggle
      label="Web検索"
      description="検索結果の末尾に「Googleで〇〇を検索」の行を表示します。"
      checked={enabled}
      onChange={onToggle}
    />
  );
}
