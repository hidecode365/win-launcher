// 画面切替の枠内演出（issue 0032）の、DOM・Canvasに依存しない純粋な判定・時間・幾何ロジック。
// 対象遷移・時間・形状の正本は要件05「画面切替アニメーション」。ここでは値を再定義せず、
// 選定済みの数値だけを演出の実装定数として持つ（利用者向け設定にはしない）。

// 演出の対象となるL1画面。検索画面との往復だけが対象（OCR・設定は含めない）。
const TARGET_VIEWS: ReadonlySet<string> = new Set([
  "favoriteEdit",
  "memoEdit",
  "clipboardEdit",
  "recentEdit",
]);

export interface TransitionSnapshot {
  // App.tsx が毎レンダーで導出する「表示上の実効ビュー」（commit済みの view ではない）。
  view: string;
  // 利用者操作による「4画面→検索」の復帰のたびに増える識別子。確定クローズ由来の
  // 復帰（resetToSearchView）では増えない。
  returnToken: number;
}

/**
 * 直前と今回のスナップショットから、演出を開始すべきかを判定する。
 * - 往路（検索→4画面）は実効ビューの差分だけで判定する。
 * - 復路（4画面→検索）は、差分に加えて識別子が前回より新しいこと（＝利用者操作による
 *   復帰）を条件にする。非表示中の内部的な検索復帰では識別子が変わらないため除外される。
 */
export function shouldStartTransition(
  prev: TransitionSnapshot | null,
  next: TransitionSnapshot
): boolean {
  if (prev === null || prev.view === next.view) return false;
  if (prev.view === "search" && TARGET_VIEWS.has(next.view)) return true;
  if (TARGET_VIEWS.has(prev.view) && next.view === "search") {
    return next.returnToken !== prev.returnToken;
  }
  return false;
}

// --- 時間・位相（要件05・issue 0032の選定値） ---
export const DRAW_MS = 495;
export const HOLD_MS = 51;
export const FADE_MS = 275;
export const TOTAL_MS = DRAW_MS + HOLD_MS + FADE_MS;
// 光の強さ「少し強め」（試作の倍率）。
export const GLOW_STRENGTH = 1.45;

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
export const smooth = (x: number) => {
  const c = clamp01(x);
  return c * c * (3 - 2 * c);
};

/** 経過時間（ms）を、演出全体の位相（0〜1）へ変換する。 */
export function phaseAt(elapsedMs: number): number {
  if (elapsedMs < DRAW_MS) return 0.56 * clamp01(elapsedMs / DRAW_MS);
  if (elapsedMs < DRAW_MS + HOLD_MS) {
    return 0.56 + (0.03 * (elapsedMs - DRAW_MS)) / HOLD_MS;
  }
  return 0.59 + 0.41 * clamp01((elapsedMs - DRAW_MS - HOLD_MS) / FADE_MS);
}

// --- 枠の内側の経路 ---
// ウィンドウ枠（外形の角丸16px）の少し内側。
export const INSET = 8;
export const CORNER_RADIUS = 9;

export interface Outline {
  xs: number[];
  ys: number[];
  // 始点からの累積弧長。cum[cum.length - 1] が全周長。
  cum: number[];
  length: number;
}

/**
 * 左上の角の45度の位置を始点とし、時計回りに一周する閉じた角丸矩形の経路を、
 * 弧長テーブル付きの折れ線として作る。サイズ変更・DPI変更のたびに1回だけ作り直す。
 * 経路が成立しない小さなウィンドウでは null。
 */
export function buildOutline(width: number, height: number): Outline | null {
  const a = INSET;
  const r = CORNER_RADIUS;
  const b = width - a;
  const c = height - a;
  if (b - a < 2 * r + 1 || c - a < 2 * r + 1) return null;

  const xs: number[] = [];
  const ys: number[] = [];
  const push = (x: number, y: number) => {
    xs.push(x);
    ys.push(y);
  };
  const line = (x0: number, y0: number, x1: number, y1: number) => {
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 2));
    for (let i = 1; i <= n; i++) {
      push(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n);
    }
  };
  const arc = (cx: number, cy: number, deg0: number, deg1: number) => {
    const n = Math.max(2, Math.ceil(((Math.abs(deg1 - deg0) * Math.PI) / 180 * r) / 1.5));
    for (let i = 1; i <= n; i++) {
      const t = ((deg0 + ((deg1 - deg0) * i) / n) * Math.PI) / 180;
      push(cx + r * Math.cos(t), cy + r * Math.sin(t));
    }
  };

  const half = r * Math.SQRT1_2;
  push(a + r - half, a + r - half);
  arc(a + r, a + r, 225, 270);
  line(a + r, a, b - r, a);
  arc(b - r, a + r, 270, 360);
  line(b, a + r, b, c - r);
  arc(b - r, c - r, 0, 90);
  line(b - r, c, a + r, c);
  arc(a + r, c - r, 90, 180);
  line(a, c - r, a, a + r);
  arc(a + r, a + r, 180, 225);

  const cum: number[] = [0];
  for (let i = 1; i < xs.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1]));
  }
  return { xs, ys, cum, length: cum[cum.length - 1] };
}

/** 弧長 s（負値・全周超過は周回して扱う）の位置を返す。 */
export function pointAt(outline: Outline, s: number): { x: number; y: number } {
  const len = outline.length;
  const pos = ((s % len) + len) % len;
  const { cum, xs, ys } = outline;
  let lo = 0;
  let hi = cum.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= pos) lo = mid;
    else hi = mid;
  }
  const seg = cum[hi] - cum[lo];
  const f = seg > 0 ? (pos - cum[lo]) / seg : 0;
  return { x: xs[lo] + (xs[hi] - xs[lo]) * f, y: ys[lo] + (ys[hi] - ys[lo]) * f };
}

// --- リサイズの発生元の照合 ---
// 論理サイズの許容誤差（物理→論理換算の丸め・DPI換算の誤差を吸収する）。
export const RESIZE_TOLERANCE_PX = 2;
// アプリ主導の setSize を呼んでから、その Resized を待つ期限。
export const PROGRAMMATIC_RESIZE_DEADLINE_MS = 1500;

export interface LogicalSize {
  width: number;
  height: number;
}

export interface ExpectedResize extends LogicalSize {
  deadline: number;
}

const near = (a: LogicalSize, b: LogicalSize) =>
  Math.abs(a.width - b.width) <= RESIZE_TOLERANCE_PX &&
  Math.abs(a.height - b.height) <= RESIZE_TOLERANCE_PX;

/**
 * Resized イベントを分類する。
 * - "unchanged"：直前の論理サイズと同じ（DPI変化だけで物理サイズが変わった場合を含む）。中断しない
 * - "programmatic"：アプリ主導の setSize の目標サイズと期限内で一致。中断せず追従する
 * - "user"：それ以外（利用者による枠のドラッグ）。中断する
 */
export function classifyResize(
  last: LogicalSize | null,
  next: LogicalSize,
  expected: ExpectedResize | null,
  now: number
): "unchanged" | "programmatic" | "user" {
  if (last !== null && near(last, next)) return "unchanged";
  if (expected !== null && now <= expected.deadline && near(expected, next)) {
    return "programmatic";
  }
  return "user";
}
