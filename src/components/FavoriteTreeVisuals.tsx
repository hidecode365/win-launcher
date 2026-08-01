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

// フォルダ削除アイコン。FileSearchSettings.tsx の「このフォルダを検索対象から
// 削除」ボタンと同じゴミ箱アイコン・配色（グレー→ホバーで赤）を流用し、既存の
// 削除操作の見た目に揃える。ボタン自体（表示条件・選択時の配色切り替え）は
// FavoriteListPanel.tsx・FavoriteEditTree.tsx それぞれの表示条件が異なるため、
// アイコンのパスのみをここで共有する。
export const TRASH_ICON_PATH =
  "M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16";

// フォルダ作成アイコン（軸4f：行内アイコン化）。既存の塗りつぶしフォルダアイコン
// （FOLDER_ICON_PATH）のシルエットに、小さな「+」を合成する。WarningIcon の
// 「!」と同じ「fillRule="evenodd" による穴抜き」手法で、folder 本体の塗りに対する
// 穴として「+」形の1つの閉じたポリゴンを抜く（穴の部分は常に行の背景色がそのまま
// 透けるため、選択中/非選択どちらの背景でも視認できる）。「+」アイコン自体は
// 段階5（/memo）でのメモ作成用に予約するため（REQUIREMENTS.md「お気に入り編集
// ビュー」節を参照）、フォルダ作成にはこのフォルダ+プラス合成アイコンを別途用意
// する。
//
// 初版（横長矩形＋縦長矩形の2サブパスを重ねる方式）は2つの不具合があり、実機で
// 「+」が視認できないと判明した：(1) 腕の太さ1.4viewBox単位は表示サイズ
// （w-4 h-4=16px、viewBoxは0 0 24 24のためスケール比 16/24≈0.667）で
// 1.4*0.667≈0.93px しかなく、ブラウザのアンチエイリアシングで実質潰れていた。
// (2) 2つの矩形サブパスが交差する中央部分は、evenodd の交差回数が奇数→偶数→
// 奇数と変化するため「穴の中に穴じゃない小さな正方形」ができてしまい、たとえ
// 太くしてもクロス形状として綺麗に抜けない構造上の欠陥があった。
// 対策として、「+」を2つの矩形の重ね合わせではなく、12頂点の単一の閉じた
// ポリゴン（自己交差なし）として1つのサブパスで表現し直した。単一の閉曲線なら
// evenodd/nonzero のどちらでも交差回数は内側で常に偶数（穴）になり、中央が
// 欠けることはない。腕の太さも4viewBox単位（実寸 4*0.667≈2.7px）に拡大した。
export const CREATE_FOLDER_ICON_PATH =
  `${FOLDER_ICON_PATH} M13 9.5H17V11.5H19V15.5H17V17.5H13V15.5H11V11.5H13Z`;

// フォルダ作成アイコン本体。表示サイズは他の行内アイコン（トラッシュ・★等）と
// 揃えて呼び出し側が className（w-4 h-4 等）で制御する。
export function CreateFolderIcon({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d={CREATE_FOLDER_ICON_PATH}
      />
    </svg>
  );
}
