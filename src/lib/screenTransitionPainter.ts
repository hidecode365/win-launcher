// 画面切替の枠内演出（issue 0032）のCanvas 2D描画。選定済みの見た目（試作
// mode-switch-pearl-timing.html の「パール・フェード」）を、位相 t（0〜1）から
// 1フレーム分描く。試作と異なり、経路は弧長テーブルを事前計算して使い、粒化フェーズの
// 全断片は同じ見た目（透明度・線幅）を共有するため方向ごとに1本のパスへまとめて描く。

import { GLOW_STRENGTH, pointAt, smooth } from "./screenTransition.ts";
import type { Outline } from "./screenTransition.ts";

export interface PainterColors {
  // 上辺側（時計回り）へ進む光の色。
  primary: string;
  // 左辺側（反時計回り）へ進む光の色。
  secondary: string;
}

// Canvas 2D の描画に使うメソッドだけを要求する（テストで記録用の代替を渡せる）。
export interface PaintContext {
  save(): void;
  restore(): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  stroke(): void;
  globalAlpha: number;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  lineCap: CanvasLineCap;
  lineJoin: CanvasLineJoin;
  lineWidth: number;
  shadowColor: string;
  shadowBlur: number;
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

function appendRange(ctx: PaintContext, outline: Outline, from: number, to: number) {
  const steps = Math.max(2, Math.ceil(Math.abs(to - from) / 5));
  const first = pointAt(outline, from);
  ctx.moveTo(first.x, first.y);
  for (let i = 1; i <= steps; i++) {
    const p = pointAt(outline, from + ((to - from) * i) / steps);
    ctx.lineTo(p.x, p.y);
  }
}

function strokeStyled(
  ctx: PaintContext,
  color: string,
  alpha: number,
  width: number,
  build: () => void
) {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = clamp01(alpha * GLOW_STRENGTH);
  ctx.strokeStyle = color;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.shadowColor = color;
  ctx.shadowBlur = 7 * GLOW_STRENGTH;
  ctx.lineWidth = width * GLOW_STRENGTH;
  ctx.beginPath();
  build();
  ctx.stroke();
  ctx.restore();
}

// 描画フェーズ：左上の始点から二手に分かれ、先頭付近は16段階の濃淡の尾を引く。
function paintDraw(ctx: PaintContext, outline: Outline, colors: PainterColors, t: number) {
  const head = outline.length * 0.5 * smooth(t / 0.56);
  const alpha = smooth(t / 0.05) * (1 - smooth((t - 0.92) / 0.08));
  if (head < 0.01) return;
  ([1, -1] as const).forEach((direction) => {
    const color = direction === 1 ? colors.primary : colors.secondary;
    strokeStyled(ctx, color, alpha * 0.75, 1.15, () =>
      appendRange(ctx, outline, 0, direction * head)
    );
    const tail = Math.max(0, head - 65);
    for (let j = 0; j < 16; j++) {
      const a = tail + ((head - tail) * j) / 16;
      const b = tail + ((head - tail) * (j + 1)) / 16;
      strokeStyled(ctx, color, (alpha * (j + 1)) / 16, 1.8, () =>
        appendRange(ctx, outline, direction * a, direction * b)
      );
    }
  });
}

// 粒化フェーズ：全周の線が縫い目に分かれ、全断片が同じ位相で丸い点へ縮んで消える。
function paintFade(ctx: PaintContext, outline: Outline, colors: PainterColors, t: number) {
  const phase = clamp01((t - 0.59) / 0.41);
  const split = smooth(phase / 0.18);
  const half = outline.length * 0.5;
  const count = Math.ceil(half / 19);
  const alpha = 0.75 * (1 - smooth((phase - 0.58) / 0.42));
  if (alpha <= 0.0001) return;
  ([1, -1] as const).forEach((direction) => {
    const color = direction === 1 ? colors.primary : colors.secondary;
    strokeStyled(ctx, color, alpha, 1.15, () => {
      for (let i = 0; i < count; i++) {
        const a = (half * i) / count;
        const b = (half * (i + 1)) / count;
        const mid = (a + b) * 0.5;
        let remaining = (b - a) * 0.5 * (1 - 0.25 * split);
        remaining *= 1 - smooth((phase - 0.12) / 0.65);
        remaining = Math.max(0.015, remaining);
        appendRange(ctx, outline, direction * (mid - remaining), direction * (mid + remaining));
      }
    });
  });
}

/** 位相 t（0〜1）の1フレームを描く。呼び出し側が事前に clearRect する。 */
export function paintFrame(
  ctx: PaintContext,
  outline: Outline,
  colors: PainterColors,
  t: number
) {
  if (t < 0.59) paintDraw(ctx, outline, colors, t);
  else paintFade(ctx, outline, colors, t);
}
