import { FeatureToggle } from "./FeatureToggle";

export function PathPasteSettings({
  enabled,
  onToggle,
}: {
  enabled: boolean;
  onToggle: (checked: boolean) => void;
}) {
  return (
    <FeatureToggle
      label="パス貼り付けによる検索フォルダ管理"
      description="ファイル/フォルダをコピーした状態で検索ボックスに貼り付けると、検索フォルダへの追加・ショートカットの配置・ピン止め・お気に入り登録ができます。"
      checked={enabled}
      onChange={onToggle}
    />
  );
}
