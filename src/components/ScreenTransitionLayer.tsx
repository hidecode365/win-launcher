import { useSyncExternalStore } from "react";
import { screenTransition } from "../lib/screenTransitionController";

// 画面切替の枠内演出（issue 0032）の描画面。画面（ビュー）の切替でアンマウントされない
// App の最外側に1つだけ置き、再生中だけ Canvas を載せる。全画面の上に重ねるが、
// pointer-events を持たず、フォーカス不可・支援技術の対象外にして、クリック・キー入力・
// フォーカス・アクセシビリティ操作を一切妨げない。モーダルとは視覚的に重なり得る
// （外部設計01「対象画面切替の枠内演出」）。
export function ScreenTransitionLayer() {
  const active = useSyncExternalStore(screenTransition.subscribe, screenTransition.isActive);
  if (!active) return null;
  return (
    <canvas
      ref={screenTransition.attachCanvas}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-40 h-full w-full"
    />
  );
}
