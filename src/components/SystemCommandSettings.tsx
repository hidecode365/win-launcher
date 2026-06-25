import { FeatureToggle } from "./FeatureToggle";

export function SystemCommandSettings({
  enabled,
  onToggle,
}: {
  enabled: boolean;
  onToggle: (checked: boolean) => void;
}) {
  return (
    <FeatureToggle
      label="システムコマンド"
      description="shutdown / restart / sleep のキーワード入力でシステムコマンドを実行できるようにします。"
      checked={enabled}
      onChange={onToggle}
    />
  );
}
