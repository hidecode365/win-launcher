import { FeatureBlock } from "./FeatureBlock";
import { FeatureToggle } from "./FeatureToggle";

// 「計算・変換」カテゴリ。数式計算・URLエンコード/デコードの自動表示など、
// 計算・変換系の入力補助機能を機能ブロック単位（見出し＋主設定＋従属設定）で並べる。
// 機能ブロック同士は border-t の区切り線で視覚的に区切る。
export function ConvertSettings({
  calcEnabled,
  onToggleCalc,
  copyWithComma,
  onToggleCopyWithComma,
  urlConvertEnabled,
  onToggleUrlConvert,
}: {
  calcEnabled: boolean;
  onToggleCalc: (checked: boolean) => void;
  copyWithComma: boolean;
  onToggleCopyWithComma: (checked: boolean) => void;
  urlConvertEnabled: boolean;
  onToggleUrlConvert: (checked: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <FeatureBlock
        label="数式計算"
        description="検索ボックスに数式を入力したときに計算結果を表示します。"
        checked={calcEnabled}
        onChange={onToggleCalc}
      >
        <FeatureToggle
          label="計算結果をカンマ区切りでコピー"
          description="OFF にすると Enter でのコピー時にカンマなしの数値（例: 1000）でコピーします。画面上の表示は常にカンマ区切りのままです。"
          checked={copyWithComma}
          onChange={onToggleCopyWithComma}
        />
      </FeatureBlock>

      <div className="pt-4 border-t border-gray-200/60">
        <FeatureBlock
          label="URLエンコード/デコードの自動表示"
          description="検索ボックスの入力内容に応じて URL エンコード/デコード結果を検索結果に自動表示します。"
          checked={urlConvertEnabled}
          onChange={onToggleUrlConvert}
        />
      </div>
    </div>
  );
}
