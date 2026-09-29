// 画面切替の枠内演出（issue 0032）の判定・時間・リサイズ照合・制御の自動テスト。
// 実行: npm run test:unit （Node 標準のテストランナー。新規依存なし）
import test from "node:test";
import assert from "node:assert/strict";
import {
  shouldStartTransition,
  phaseAt,
  TOTAL_MS,
  buildOutline,
  pointAt,
  classifyResize,
} from "../src/lib/screenTransition.ts";
import { paintFrame } from "../src/lib/screenTransitionPainter.ts";
import { ScreenTransitionController } from "../src/lib/screenTransitionController.ts";

const snap = (view, returnToken = 0) => ({ view, returnToken });

test("往路：検索→対象4画面だけ開始する", () => {
  for (const v of ["favoriteEdit", "memoEdit", "clipboardEdit", "recentEdit"]) {
    assert.equal(shouldStartTransition(snap("search"), snap(v)), true, v);
  }
  assert.equal(shouldStartTransition(snap("search"), snap("ocrEdit")), false);
  assert.equal(shouldStartTransition(snap("search"), snap("settings")), false);
  assert.equal(shouldStartTransition(null, snap("memoEdit")), false, "初回は再生しない");
  assert.equal(shouldStartTransition(snap("search"), snap("search")), false, "同一画面");
});

test("復路：利用者復帰の識別子が新しいときだけ開始する", () => {
  for (const v of ["favoriteEdit", "memoEdit", "clipboardEdit", "recentEdit"]) {
    assert.equal(shouldStartTransition(snap(v, 3), snap("search", 4)), true, v);
    // 確定クローズ由来の内部復帰：識別子が変わらない
    assert.equal(shouldStartTransition(snap(v, 3), snap("search", 3)), false, v);
  }
});

test("設定・OCRとの往復と4画面間は対象外", () => {
  assert.equal(shouldStartTransition(snap("memoEdit"), snap("settings")), false);
  assert.equal(shouldStartTransition(snap("settings"), snap("memoEdit", 5)), false);
  assert.equal(shouldStartTransition(snap("settings"), snap("search", 5)), false);
  assert.equal(shouldStartTransition(snap("ocrEdit"), snap("search", 5)), false);
  assert.equal(shouldStartTransition(snap("favoriteEdit"), snap("memoEdit")), false);
});

test("位相：495/51/275ms・合計821ms", () => {
  assert.equal(TOTAL_MS, 821);
  assert.equal(phaseAt(0), 0);
  assert.ok(Math.abs(phaseAt(495) - 0.56) < 1e-9);
  assert.ok(Math.abs(phaseAt(546) - 0.59) < 1e-9);
  assert.ok(Math.abs(phaseAt(821) - 1) < 1e-9);
  assert.equal(phaseAt(5000), 1);
});

test("経路：閉じた周長・始点・小さなウィンドウでは作らない", () => {
  const o = buildOutline(640, 420);
  const expected = 2 * (640 - 16 - 18) + 2 * (420 - 16 - 18) + 2 * Math.PI * 9;
  assert.ok(Math.abs(o.length - expected) < 1.5, `${o.length} vs ${expected}`);
  const p0 = pointAt(o, 0);
  const pEnd = pointAt(o, o.length);
  assert.ok(Math.hypot(p0.x - pEnd.x, p0.y - pEnd.y) < 1e-6);
  // 始点は左上の角の45度（枠の内側）
  assert.ok(p0.x < 20 && p0.y < 20 && p0.x > 8 && p0.y > 8);
  // 半周の位置は右下付近
  const mid = pointAt(o, o.length / 2);
  assert.ok(mid.x > 600 && mid.y > 380, JSON.stringify(mid));
  assert.equal(buildOutline(30, 30), null);
});

test("リサイズ照合：DPI変化・アプリ主導・利用者を区別する", () => {
  const last = { width: 640, height: 420 };
  const exp = { width: 900, height: 700, deadline: 1500 };
  assert.equal(classifyResize(last, { width: 640, height: 420 }, null, 0), "unchanged");
  assert.equal(classifyResize(last, { width: 641, height: 419 }, null, 0), "unchanged");
  assert.equal(classifyResize(last, { width: 900, height: 700 }, exp, 100), "programmatic");
  assert.equal(classifyResize(last, { width: 901, height: 699 }, exp, 100), "programmatic");
  assert.equal(classifyResize(last, { width: 900, height: 700 }, exp, 2000), "user", "期限切れ");
  assert.equal(classifyResize(last, { width: 700, height: 420 }, exp, 100), "user");
  assert.equal(classifyResize(last, { width: 700, height: 420 }, null, 0), "user");
});

test("描画：記録用コンテキストで全位相が例外なく描ける", () => {
  const calls = { stroke: 0 };
  const ctx = new Proxy(
    { stroke: () => calls.stroke++ },
    { get: (t, k) => (k in t ? t[k] : () => {}), set: () => true }
  );
  const o = buildOutline(640, 420);
  const colors = { primary: "#111", secondary: "#222" };
  for (let ms = 0; ms <= TOTAL_MS; ms += 8) paintFrame(ctx, o, colors, phaseAt(ms));
  assert.ok(calls.stroke > 0);
  // 粒化フェーズは方向ごとに1本へまとめて描く（1フレームの stroke は2回）
  calls.stroke = 0;
  paintFrame(ctx, o, colors, phaseAt(495 + 51 + 100));
  assert.equal(calls.stroke, 2);
});

// --- 制御 ---
function makeHarness({ colors = { primary: "a", secondary: "b" } } = {}) {
  let now = 0;
  let nextHandle = 1;
  const frames = new Map();
  const cancelled = [];
  const viewport = { width: 640, height: 420, dpr: 1 };
  const ctx = new Proxy({}, { get: () => () => {}, set: () => true });
  const canvas = { width: 0, height: 0, getContext: () => ctx };
  const c = new ScreenTransitionController({
    requestFrame: (cb) => {
      const h = nextHandle++;
      frames.set(h, cb);
      return h;
    },
    cancelFrame: (h) => {
      cancelled.push(h);
      frames.delete(h);
    },
    now: () => now,
    viewport: () => ({ ...viewport }),
    colors: () => colors,
  });
  const flush = (ts) => {
    const pending = [...frames.entries()];
    frames.clear();
    for (const [, cb] of pending) cb(ts);
  };
  return { c, canvas, frames, cancelled, viewport, flush, setNow: (n) => (now = n) };
}
const on = (view, returnToken = 0, enabled = true) => ({ view, returnToken, enabled });

test("制御：往路で開始し、Canvas取り付け後の最初のフレームを起点に821msで終わる", () => {
  const h = makeHarness();
  h.c.update(on("search"));
  h.c.update(on("memoEdit"));
  assert.equal(h.c.isActive(), true);
  assert.equal(h.frames.size, 0, "Canvas取り付け前は開始待ち");
  h.c.attachCanvas(h.canvas);
  assert.equal(h.frames.size, 1);
  h.flush(1000);
  h.flush(1400);
  assert.equal(h.c.isActive(), true);
  h.flush(1000 + 820);
  assert.equal(h.c.isActive(), true);
  h.flush(1000 + 821);
  assert.equal(h.c.isActive(), false);
  assert.equal(h.frames.size, 0, "終了後は予約が残らない");
});

test("制御：初回・同一画面・設定往復・内部復帰では開始しない", () => {
  const h = makeHarness();
  h.c.update(on("search"));
  h.c.update(on("search"));
  h.c.update(on("settings"));
  h.c.update(on("search"));
  assert.equal(h.c.isActive(), false);
  h.c.update(on("clipboardEdit"));
  assert.equal(h.c.isActive(), true);
  h.c.cancel();
  // 確定クローズ由来の復帰：識別子が変わらない
  h.c.update(on("search", 0));
  assert.equal(h.c.isActive(), false);
  // 利用者復帰
  h.c.update(on("recentEdit", 0));
  h.c.cancel();
  h.c.update(on("search", 1));
  assert.equal(h.c.isActive(), true);
});

test("制御：識別子だけ増えて画面が変わらなかった呼び出しは次の内部復帰へ持ち越されない", () => {
  const h = makeHarness();
  h.c.update(on("search", 0));
  h.c.update(on("memoEdit", 0));
  h.c.cancel();
  // 復帰操作で識別子だけ増え、実効ビューは変わらない
  h.c.update(on("memoEdit", 1));
  // 後の確定クローズ由来の内部復帰（識別子は増えていない）
  h.c.update(on("search", 1));
  assert.equal(h.c.isActive(), false);
});

test("制御：連続切替は前の予約を取り消して最初から再生する", () => {
  const h = makeHarness();
  h.c.attachCanvas(h.canvas);
  h.c.update(on("search"));
  h.c.update(on("memoEdit"));
  h.flush(0);
  h.flush(300);
  const before = [...h.frames.keys()];
  h.c.update(on("search", 1));
  assert.equal(h.cancelled.includes(before[0]), true);
  assert.equal(h.frames.size, 1);
  h.flush(500); // 新しい起点
  h.flush(500 + 820);
  assert.equal(h.c.isActive(), true);
  h.flush(500 + 821);
  assert.equal(h.c.isActive(), false);
});

test("制御：OFFへの変更は再生中も開始待ちも同期的に消し、OFF中は開始しない", () => {
  const h = makeHarness();
  h.c.update(on("search"));
  h.c.update(on("favoriteEdit"));
  // 開始待ちの状態（Canvas未取り付け）でOFF
  h.c.update(on("favoriteEdit", 0, false));
  assert.equal(h.c.isActive(), false);
  h.c.attachCanvas(h.canvas);
  assert.equal(h.frames.size, 0, "取り消した開始待ちは再開しない");
  // OFF中の切替は開始しない
  h.c.update(on("search", 1, false));
  assert.equal(h.c.isActive(), false);
  // ONに戻した後の次の対象遷移から反映
  h.c.update(on("memoEdit", 1, true));
  assert.equal(h.c.isActive(), true);
});

test("制御：非表示（cancel）は再生中・開始待ちを取り消し、再表示で続きは出ない", () => {
  const h = makeHarness();
  h.c.attachCanvas(h.canvas);
  h.c.update(on("search"));
  h.c.update(on("recentEdit"));
  h.flush(0);
  h.flush(200);
  h.c.cancel();
  assert.equal(h.c.isActive(), false);
  assert.equal(h.frames.size, 0);
  h.flush(2000);
  assert.equal(h.c.isActive(), false);
  // 開始待ちの段階で非表示
  h.c.update(on("search", 1));
  h.c.cancel();
  assert.equal(h.frames.size, 0);
});

test("制御：リサイズ——利用者は中断、アプリ主導とDPI変化は追従", () => {
  const h = makeHarness();
  h.c.attachCanvas(h.canvas);
  h.c.update(on("search"));
  h.c.update(on("memoEdit"));
  h.flush(0);
  // DPI変化だけ（論理サイズは同じ）
  h.c.handleResize({ width: 640, height: 420 });
  assert.equal(h.c.isActive(), true);
  // アプリ主導（メモ画面のサイズ）
  h.c.expectProgrammaticResize(900, 700);
  h.viewport.width = 900;
  h.viewport.height = 700;
  h.c.handleResize({ width: 900, height: 700 });
  assert.equal(h.c.isActive(), true);
  h.flush(100);
  assert.equal(h.c.isActive(), true, "サイズ変更後も描き続ける");
  // 利用者の枠ドラッグ
  h.c.handleResize({ width: 1000, height: 700 });
  assert.equal(h.c.isActive(), false);
});

test("制御：ゆっくりした利用者ドラッグも累積差で検出する", () => {
  const h = makeHarness();
  h.c.attachCanvas(h.canvas);
  h.c.update(on("search"));
  h.c.update(on("memoEdit"));
  h.flush(0);
  h.c.handleResize({ width: 641, height: 420 });
  h.c.handleResize({ width: 642, height: 420 });
  assert.equal(h.c.isActive(), true);
  h.c.handleResize({ width: 643, height: 420 });
  assert.equal(h.c.isActive(), false);
});

test("制御：期限切れの目標サイズは利用者リサイズとして扱う", () => {
  const h = makeHarness();
  h.c.attachCanvas(h.canvas);
  h.c.update(on("search"));
  h.c.expectProgrammaticResize(900, 700);
  h.setNow(5000);
  h.c.update(on("memoEdit"));
  h.flush(0);
  h.c.handleResize({ width: 900, height: 700 });
  assert.equal(h.c.isActive(), false);
});

test("制御：演出色が取得できなければ再生しない", () => {
  const h = makeHarness({ colors: null });
  h.c.update(on("search"));
  h.c.update(on("memoEdit"));
  assert.equal(h.c.isActive(), false);
});
