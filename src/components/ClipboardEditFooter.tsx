import { FooterBar } from "./FooterBar";
import { KeyHint } from "./KeyHint";

// クリップボード履歴画面（issue 0024でL1画面化）専用のフッター。StatusFooter.tsx
// （検索画面・旧clipboardMode等を束ねた汎用フッター）へ分岐を増やさず、
// FavoriteEditFooter.tsx/MemoManageFooter.tsx と同じく専用コンポーネントとして
// 分離する（画面ごとに操作体系が独立しているため）。
// 06-keyboard-interactions.md表6「クリップボード履歴画面のキー割当」に対応。
// 空のローカル絞り込み入力欄でのBackspace復帰は「入力欄に付随する戻り操作」として
// 00-requirements.md「フッター表示規約」に明記の通りここには表示しない。
export function ClipboardEditFooter({
  selectionAvailable,
  version,
}: {
  selectionAvailable: boolean;
  version: string;
}) {
  return (
    <FooterBar version={version}>
      {selectionAvailable && <KeyHint keys="↑↓" label="選択" />}
      {selectionAvailable && (
        <KeyHint keys="Enter" label="クリップボードにセット" />
      )}
      <KeyHint keys="Ctrl+D" label="クリア" />
      <KeyHint keys="Esc" label="戻る" />
    </FooterBar>
  );
}
