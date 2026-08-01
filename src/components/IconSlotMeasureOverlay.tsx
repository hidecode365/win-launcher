import { useEffect, useState } from "react";

// 400_テスト・バグ修正：IconSlot（ピン・★・件数バッジ・フォルダ作成・削除）の
// 実測サイズを、画面をまたいで比較するための一時的なデバッグ表示。
//
// 開発者ツール（F12）は、別ウィンドウにフォーカスが移った瞬間に既存の
// 「フォーカスアウトで自動的にウィンドウを隠す」仕様（window-lifecycle.md
// 「フォーカスアウトでの自動非表示」節を参照）が働いてしまい使えないため、
// アプリ本体のウィンドウ内に直接、固定表示（`position: fixed`）のオーバーレイ
// として描画する方式にした。alert() 等のネイティブダイアログは使わない
// （同様に別ウィンドウ扱いとなりフォーカスが奪われる可能性があるため）。
//
// 表示はマウント時（＝App.tsx が Ctrl+Alt+M でこのコンポーネントを描画した
// 瞬間）に1回だけ document.querySelectorAll("[data-icon-slot]") を実行し、
// 各要素の getBoundingClientRect() から width/height を測る。継続的な
// 再測定は行わない（デバッグ用の1回きりのスナップショットで十分なため）。
//
// 追加計測（circle・right-gap）：
// - circle：「背景円（塗りつぶし部分）の実際の直径」。要素自身の
//   computed backgroundColor が透明でなければ要素自身の幅を、透明なら
//   子孫要素を探索して最初に見つかった非透明背景の幅を使う（件数バッジは
//   IconSlotの透明な箱の内側に、実際に色を持つ子要素（ピル/円）を持つため
//   この経路で見つかる）。どちらも見つからない場合（例：ホバーしていない
//   ピン・★・削除・フォルダ作成アイコンは背景が hover: 限定のため、通常時は
//   透明）は、要素自身の幅にフォールバックする（IconSlot自体がrounded-full
//   の箱であり、ホバー時にはその箱がそのまま円として表示されるため）
// - right-gap：`el.closest("[data-index]")` で最も近い行ルート要素（
//   ResultList.tsx・FavoriteEditTree.tsx・FavoriteListPanel.tsx のいずれの
//   行も data-index を持つ既存の属性で、新規追加は不要）を探し、その右端との
//   距離を計算する
//
// これはデバッグ専用の一時的な機能であり、恒久機能ではない。計測確認が
// 終わったら、呼び出し元（App.tsx の Ctrl+Alt+M 分岐・この描画箇所）ごと
// 削除してよい（IconSlot.tsx 側の measureId prop・data-icon-slot 属性自体は
// 恒久的に残しても無害）。
type MeasureRow = {
  key: string;
  label: string;
  width: number;
  height: number;
  circle: number | null;
  rightGap: number | null;
};

function isTransparent(color: string): boolean {
  return color === "" || color === "transparent" || color === "rgba(0, 0, 0, 0)";
}

// 要素自身、または子孫要素の中から最初に見つかった「実際に色を持つ背景」の
// 幅を返す。どこにも色付き背景が見つからない場合は要素自身の幅を返す
// （上記コメントの「追加計測（circle）」を参照）。
function findCircleWidth(el: HTMLElement): number {
  const ownColor = getComputedStyle(el).backgroundColor;
  if (!isTransparent(ownColor)) {
    return el.getBoundingClientRect().width;
  }
  const descendants = el.querySelectorAll<HTMLElement>("*");
  for (const d of Array.from(descendants)) {
    const color = getComputedStyle(d).backgroundColor;
    if (!isTransparent(color)) {
      return d.getBoundingClientRect().width;
    }
  }
  return el.getBoundingClientRect().width;
}

export function IconSlotMeasureOverlay({ onClose }: { onClose: () => void }) {
  const [rows, setRows] = useState<MeasureRow[]>([]);

  useEffect(() => {
    const elements = document.querySelectorAll<HTMLElement>("[data-icon-slot]");
    const counts = new Map<string, number>();
    const measured: MeasureRow[] = [];
    elements.forEach((el) => {
      const id = el.getAttribute("data-icon-slot") ?? "(unknown)";
      const n = (counts.get(id) ?? 0) + 1;
      counts.set(id, n);
      const rect = el.getBoundingClientRect();
      const circle = findCircleWidth(el);
      const row = el.closest<HTMLElement>("[data-index]");
      const rightGap = row ? row.getBoundingClientRect().right - rect.right : null;
      measured.push({
        key: `${id}-${n}`,
        label: `${id} #${n}`,
        width: rect.width,
        height: rect.height,
        circle,
        rightGap,
      });
    });
    setRows(measured);
  }, []);

  return (
    <div
      role="dialog"
      className="fixed top-3 right-3 z-[9999] max-h-[80vh] w-80 overflow-y-auto rounded-lg bg-black/85 px-3 py-2 font-mono text-xs text-white shadow-2xl"
    >
      <div className="mb-1 font-bold">
        IconSlot 実測サイズ（Ctrl+Alt+M / Esc で閉じる）
      </div>
      {rows.length === 0 ? (
        <div className="opacity-70">data-icon-slot 要素が見つかりません</div>
      ) : (
        rows.map((row) => (
          <div key={row.key} className="mb-1 whitespace-nowrap">
            <div>{row.label}</div>
            <div className="pl-2 opacity-90">
              W={row.width.toFixed(1)} H={row.height.toFixed(1)} circle=
              {row.circle !== null ? row.circle.toFixed(1) : "-"} right-gap=
              {row.rightGap !== null ? row.rightGap.toFixed(1) : "-"}
            </div>
          </div>
        ))
      )}
      <button
        type="button"
        onClick={onClose}
        className="mt-2 rounded bg-white/20 px-2 py-0.5 hover:bg-white/30"
      >
        閉じる
      </button>
    </div>
  );
}
