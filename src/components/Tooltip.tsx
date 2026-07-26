import { ReactNode, useEffect, useRef, useState } from "react";

// title 属性はブラウザ既定のツールチップ表示までの遅延（500ms〜1秒程度）を
// CSS/JS から制御できず、表示位置もマウスカーソル依存で画面右端の要素では
// 不自然な位置になる。WinLauncher の UI 上で操作部品にツールチップを付ける
// 場合は title 属性を使わず、必ずこのコンポーネントを使う（詳細・経緯は
// CLAUDE.md「ピン止め・お気に入り・メモ機能」節を参照）。
const SHOW_DELAY_MS = 300;

// 既定では対象要素の左側・垂直中央に表示する（右端に配置されることが多い操作
// アイコン向けの既定値）。ただし対象要素自身が画面左端に近い場合（例：検索結果
// 行の左端に配置されるドラッグハンドル）は、左側に表示すると逆に画面外へ
// はみ出すため、呼び出し元が `side="right"` を指定して右側表示に切り替えられる
// ようにしている（詳細は CLAUDE.md「ピン止め・お気に入り・メモ機能」節を参照）。
//
// 表示はホバー開始から SHOW_DELAY_MS 経過後（キーボードでの選択では表示しない
// ＝ onMouseEnter/onMouseLeave のみを見る）。非表示はマウスが離れた時点で
// 遅延・アニメーションなしに即座に行う（表示・非表示の間で振る舞いが非対称な
// ため、単一の transition では表現せず、条件付きレンダリングの有無で切り替える）。
export function Tooltip({
  label,
  className = "",
  side = "left",
  children,
}: {
  label: string;
  className?: string;
  side?: "left" | "right";
  children: ReactNode;
}) {
  const [visible, setVisible] = useState(false);
  const showTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (showTimeoutRef.current !== null) {
        clearTimeout(showTimeoutRef.current);
      }
    };
  }, []);

  const handleMouseEnter = () => {
    if (showTimeoutRef.current !== null) {
      clearTimeout(showTimeoutRef.current);
    }
    showTimeoutRef.current = setTimeout(() => {
      showTimeoutRef.current = null;
      setVisible(true);
    }, SHOW_DELAY_MS);
  };

  const handleMouseLeave = () => {
    if (showTimeoutRef.current !== null) {
      clearTimeout(showTimeoutRef.current);
      showTimeoutRef.current = null;
    }
    setVisible(false);
  };

  return (
    <span
      className={`relative inline-flex ${className}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {children}
      {visible && (
        <span
          role="tooltip"
          className={`pointer-events-none absolute top-1/2 z-50 -translate-y-1/2 whitespace-nowrap rounded-md bg-gray-800 px-2 py-1 text-xs text-white ${
            side === "right" ? "left-full ml-2" : "right-full mr-2"
          }`}
        >
          {label}
        </span>
      )}
    </span>
  );
}
