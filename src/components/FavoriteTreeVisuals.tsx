// /favorite ブラウジング（FavoriteListPanel.tsx）・お気に入り編集ビュー
// （FavoriteEditTree.tsx）の両方で共有するツリー描画の見た目部品。フォルダ見出し行・
// アイテム行の走査結果（FavoriteTreeRow[]。useSearch.ts の favoriteTree）は両者で
// 共通のため、その描画に使う視覚要素も1箇所にまとめ、同じ見た目を2箇所に別々に
// 実装しない（CLAUDE.md「新しい行の種類を追加する場合、個別のオフセット変数は
// 新設しない」と同じ「走査・描画ロジックを1箇所にまとめる」原則をここにも適用する）。

// フォルダの折りたたみ・展開を示す▼/▶アイコン。フォルダ見出し行の視認性を
// 強めるため、アイテム行のアイコン類と同じ16px（w-4 h-4）に統一する。
export function FolderChevron({ collapsed }: { collapsed: boolean }) {
  return (
    <svg
      className={`w-4 h-4 flex-shrink-0 transition-transform ${
        collapsed ? "-rotate-90" : ""
      }`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M19 9l-7 7-7-7"
      />
    </svg>
  );
}

// フォルダアイコン（見出し行用）。検索結果行の汎用ドキュメントアイコンと視覚的に
// 区別するため、既存のパス貼り付け機能2の候補行等で使われているフォルダ形状の
// パスを流用する。アイテム行のファイルアイコンは輪郭線（stroke）で描くのに対し、
// こちらは塗りつぶし（fill）にすることで「見出し行である」ことの主張を強める。
// ピン・★アイコンの「輪郭=未登録/塗りつぶし=登録済み」という状態表現の規約とは
// 無関係（フォルダ/ファイルという種別の違いを表すだけで、登録状態を表すものではない）。
export const FOLDER_ICON_PATH =
  "M3 7a2 2 0 012-2h4l2 2h6a2 2 0 012 2v7a2 2 0 01-2 2H5a2 2 0 01-2-2V7z";

// アイテム行のファイルアイコン（サムネイルが無い場合のフォールバック）。
export function FileIcon({ className }: { className: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
      />
    </svg>
  );
}

// インデントの1段あたりの増分。フォルダ見出し行・アイテム行で共通の値を使う
// （階層は depth の値だけで表現し、種別によって基準位置をずらすと「兄弟なのに
// 縦位置がずれる」誤解を生むため）。
export const INDENT_STEP_REM = 1.5;
export const INDENT_BASE_REM = 1;
