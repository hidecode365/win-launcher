import { FooterBar } from "./FooterBar";
import { KeyHint } from "./KeyHint";

// 最近使ったファイル画面（issue 0024でL1画面化）専用のフッター。
// 06-keyboard-interactions.md表7「最近使ったファイルのキー割当」に対応。
// 一覧の行は常にファイル種別（kind: "file"）のみのため、Shift+Enterのヒントは
// selectionAvailableとだけ連動させればよい（お気に入り画面のようなフォルダ行との
// 出し分けは不要）。空のローカル絞り込み入力欄でのBackspace復帰はフッターに
// 表示しない（00-requirements.md「フッター表示規約」）。
export function RecentEditFooter({
  selectionAvailable,
  version,
}: {
  selectionAvailable: boolean;
  version: string;
}) {
  return (
    <FooterBar version={version}>
      {selectionAvailable && <KeyHint keys="↑↓" label="選択" />}
      {selectionAvailable && <KeyHint keys="Enter" label="起動" />}
      {selectionAvailable && (
        <KeyHint keys="Shift+Enter" label="フォルダを開く" />
      )}
      <KeyHint keys="Ctrl+D" label="クリア" />
      <KeyHint keys="Esc" label="戻る" />
    </FooterBar>
  );
}
