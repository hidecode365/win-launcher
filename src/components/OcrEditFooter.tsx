import { FooterBar } from "./FooterBar";
import { KeyHint } from "./KeyHint";

// OCR画面（issue 0024でFullscreen OverlayからL1画面へ再構成）専用のフッター。
// 06-keyboard-interactions.md表5「OCR画面のキー割当」に対応。Ctrl+Dは無効
// （何もしない）操作のためヒントを表示しない。「閉じる」「コピーして閉じる」は
// 右ペイン上部のActionButtonのみで提供し、フッターにEnter相当のヒントは持たせない
// （ボタン操作はマウス/Tabフォーカス経由のブラウザ標準の確定経路であり、フッターの
// 対象は「キーボードだけで何ができるか」を示すEsc等の共通操作のみのため）。
export function OcrEditFooter({ version }: { version: string }) {
  return (
    <FooterBar version={version}>
      <KeyHint keys="Esc" label="戻る" />
    </FooterBar>
  );
}
