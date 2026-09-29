// 画面切替の枠内演出（issue 0032）の制御。画面（ビュー）のマウント切替をまたいで
// 存続する単一のインスタンスで、開始判定・連続切替の中断・非表示／OFF／利用者リサイズでの
// 同期中断・再生ループを担う。Canvas要素は再生中だけ ScreenTransitionLayer が載せる。
// DOM・rAF・時計は依存注入でき、テストでは代替を渡す。

import {
  buildOutline,
  classifyResize,
  PROGRAMMATIC_RESIZE_DEADLINE_MS,
  phaseAt,
  shouldStartTransition,
  TOTAL_MS,
} from "./screenTransition.ts";
import type {
  ExpectedResize,
  LogicalSize,
  Outline,
  TransitionSnapshot,
} from "./screenTransition.ts";
import { paintFrame } from "./screenTransitionPainter.ts";
import type { PainterColors, PaintContext } from "./screenTransitionPainter.ts";

export interface TransitionInput extends TransitionSnapshot {
  enabled: boolean;
}

export interface ControllerEnv {
  requestFrame: (cb: (timestamp: number) => void) => number;
  cancelFrame: (handle: number) => void;
  now: () => number;
  // 描画領域の論理サイズ（CSS px）と表示倍率。
  viewport: () => { width: number; height: number; dpr: number };
  // 演出色。取得できなければ null（その場合は再生しない）。
  colors: () => PainterColors | null;
}

export interface CanvasLike {
  width: number;
  height: number;
  getContext(kind: "2d"): (PaintContext & {
    clearRect(x: number, y: number, w: number, h: number): void;
    setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void;
  }) | null;
}

type Listener = () => void;

export class ScreenTransitionController {
  private env: ControllerEnv;
  private prev: TransitionSnapshot | null = null;
  private active = false;
  private canvas: CanvasLike | null = null;
  private frameHandle: number | null = null;
  private startTime: number | null = null;
  private colors: PainterColors | null = null;
  private outline: Outline | null = null;
  private outlineKey = "";
  private lastSize: LogicalSize | null = null;
  private expected: ExpectedResize | null = null;
  private listeners = new Set<Listener>();

  constructor(env: ControllerEnv) {
    this.env = env;
  }

  // useSyncExternalStore 用。
  subscribe = (listener: Listener) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  isActive = () => this.active;

  /**
   * Canvas要素の取り付け（callback ref）。取り付けた時点で開始待ちがあれば、その時点から
   * 数えて最初の描画フレームを起点に再生を始める。取り外し時は何もしない。
   */
  attachCanvas = (canvas: CanvasLike | null) => {
    this.canvas = canvas;
    if (canvas !== null && this.active && this.frameHandle === null && this.startTime === null) {
      this.scheduleStart();
    }
  };

  /** Appから毎コミット呼ぶ。直前との差分から開始・中断を決める。 */
  update(input: TransitionInput) {
    const prev = this.prev;
    this.prev = { view: input.view, returnToken: input.returnToken };
    if (!input.enabled) {
      this.cancel();
      return;
    }
    if (shouldStartTransition(prev, this.prev)) this.start();
  }

  /** 再生中・開始待ちの演出を同期的に取り消す（非表示・OFF・利用者リサイズ・連続切替）。 */
  cancel() {
    if (this.frameHandle !== null) {
      this.env.cancelFrame(this.frameHandle);
      this.frameHandle = null;
    }
    this.startTime = null;
    this.expected = null;
    this.lastSize = null;
    this.clearCanvas();
    if (this.active) {
      this.active = false;
      this.emit();
    }
  }

  /** アプリ主導の setSize を呼ぶ直前に、その目標の論理サイズを登録する。 */
  expectProgrammaticResize(width: number, height: number) {
    this.expected = {
      width,
      height,
      deadline: this.env.now() + PROGRAMMATIC_RESIZE_DEADLINE_MS,
    };
  }

  /** Resized イベント（論理サイズ）を受ける。利用者のリサイズだけ演出を消す。 */
  handleResize(size: LogicalSize) {
    if (!this.active) return;
    const kind = classifyResize(this.lastSize, size, this.expected, this.env.now());
    if (kind === "user") {
      this.cancel();
      return;
    }
    // 基準サイズはアプリ主導のリサイズを受け入れたときだけ更新する。「変化なし」のたびに
    // 更新すると、ゆっくりドラッグした際に1イベントあたりの差が許容誤差内に収まり続け、
    // 利用者のリサイズを検出できなくなる。
    if (kind === "programmatic") this.lastSize = size;
  }

  private start() {
    const colors = this.env.colors();
    if (colors === null) return;
    // 前の演出を止めて、新しい切替を最初から再生する。
    if (this.frameHandle !== null) {
      this.env.cancelFrame(this.frameHandle);
      this.frameHandle = null;
    }
    this.startTime = null;
    this.colors = colors;
    this.clearCanvas();
    const wasActive = this.active;
    this.active = true;
    const vp = this.env.viewport();
    this.lastSize = { width: vp.width, height: vp.height };
    if (!wasActive) this.emit();
    if (this.canvas !== null) this.scheduleStart();
  }

  private scheduleStart() {
    this.frameHandle = this.env.requestFrame((timestamp) => {
      this.frameHandle = null;
      this.startTime = timestamp;
      this.tick(timestamp);
    });
  }

  private tick(timestamp: number) {
    const start = this.startTime;
    if (start === null || !this.active) return;
    const elapsed = Math.max(0, timestamp - start);
    try {
      this.paint(elapsed);
    } catch (error) {
      console.error("[screen-transition] paint failed", error);
      this.cancel();
      return;
    }
    if (elapsed >= TOTAL_MS) {
      this.finish();
      return;
    }
    this.frameHandle = this.env.requestFrame((ts) => {
      this.frameHandle = null;
      this.tick(ts);
    });
  }

  private paint(elapsed: number) {
    const canvas = this.canvas;
    const colors = this.colors;
    if (canvas === null || colors === null) return;
    const vp = this.env.viewport();
    const pxW = Math.round(vp.width * vp.dpr);
    const pxH = Math.round(vp.height * vp.dpr);
    // バッファのサイズを変えると内容が消えるため、変化したときだけ更新する。
    // アプリ主導のリサイズ・DPI変化には、毎フレームこの確認で追従する。
    if (canvas.width !== pxW) canvas.width = pxW;
    if (canvas.height !== pxH) canvas.height = pxH;
    const key = `${vp.width}x${vp.height}`;
    if (key !== this.outlineKey) {
      this.outline = buildOutline(vp.width, vp.height);
      this.outlineKey = key;
    }
    const ctx = canvas.getContext("2d");
    if (ctx === null) return;
    ctx.setTransform(vp.dpr, 0, 0, vp.dpr, 0, 0);
    ctx.clearRect(0, 0, vp.width, vp.height);
    if (this.outline === null) return;
    paintFrame(ctx, this.outline, colors, phaseAt(elapsed));
  }

  private finish() {
    this.startTime = null;
    this.expected = null;
    this.lastSize = null;
    this.clearCanvas();
    this.active = false;
    this.emit();
  }

  private clearCanvas() {
    const canvas = this.canvas;
    if (canvas === null) return;
    const ctx = canvas.getContext("2d");
    if (ctx === null) return;
    const vp = this.env.viewport();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width || vp.width, canvas.height || vp.height);
  }

  private emit() {
    this.listeners.forEach((l) => l());
  }
}

// 実環境用の共有インスタンス。DOMには最初の利用時まで触れない。
export const screenTransition = new ScreenTransitionController({
  requestFrame: (cb) => window.requestAnimationFrame(cb),
  cancelFrame: (h) => window.cancelAnimationFrame(h),
  now: () => performance.now(),
  viewport: () => ({
    width: window.innerWidth,
    height: window.innerHeight,
    dpr: Math.min(window.devicePixelRatio || 1, 2),
  }),
  colors: () => {
    const style = getComputedStyle(document.documentElement);
    const primary = style.getPropertyValue("--ui-glow-primary").trim();
    const secondary = style.getPropertyValue("--ui-glow-secondary").trim();
    if (!primary || !secondary) {
      console.warn("[screen-transition] glow color tokens are not defined");
      return null;
    }
    return { primary, secondary };
  },
});
