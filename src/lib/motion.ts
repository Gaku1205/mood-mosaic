/** 動きのタイミング（docs/design.md の「動き」）。時間はすべて ms */

/** `cubic-bezier(x1, y1, x2, y2)` の曲線。t（0〜1）→ 進み具合 */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const x = (s: number) => ((ax * s + bx) * s + cx) * s;
  const y = (s: number) => ((ay * s + by) * s + cy) * s;
  const dx = (s: number) => (3 * ax * s + 2 * bx) * s + cx;
  return (t: number) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    // ニュートン法、だめなら二分法で x(s) = t となる s を探す
    let s = t;
    for (let i = 0; i < 8; i++) {
      const err = x(s) - t;
      if (Math.abs(err) < 1e-6) return y(s);
      const d = dx(s);
      if (Math.abs(d) < 1e-6) break;
      s -= err / d;
    }
    let lo = 0;
    let hi = 1;
    s = t;
    for (let i = 0; i < 40; i++) {
      if (x(s) < t) lo = s;
      else hi = s;
      s = (lo + hi) / 2;
    }
    return y(s);
  };
}

/** `cubic-bezier(.2,.8,.2,1)` */
export const ease = cubicBezier(0.2, 0.8, 0.2, 1);

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

// ---- マスの出現 ----

/** 出現の遅れの1歩（行＋列ごと） */
export const APPEAR_STEP_MS = 12;
/** 1マスが透明から不透明になる長さ */
export const APPEAR_MS = 240;
/** 最後のマス（行＋列 = 11＋30）が出終わるまで */
export const APPEAR_TOTAL_MS = (11 + 30) * APPEAR_STEP_MS + APPEAR_MS;

/** 出現の遅れ。行＋列は PC でもスマホでも「月の番号＋日の番号」（どちらも 0 始まり） */
export function appearDelay(month: number, day: number): number {
  return (month + day) * APPEAR_STEP_MS;
}

/** 開いてから elapsed ms のときの、マスの不透明度（0〜1） */
export function appearOpacity(elapsed: number, month: number, day: number): number {
  return ease(clamp01((elapsed - appearDelay(month, day)) / APPEAR_MS));
}

// ---- 波紋 ----

/** 波紋の遅れの1歩（今日から1マス離れるごと） */
export const RIPPLE_STEP_MS = 24;
/** 明るさが上がる長さ */
export const RIPPLE_UP_MS = 80;
/** 明るさが戻る長さ */
export const RIPPLE_DOWN_MS = 360;
/** 上げる明るさ（OKLCH の L） */
export const RIPPLE_LIFT = 0.1;
/** これより遠いマスは揺らさない（マス数） */
export const RIPPLE_REACH = 14;
/** いちばん遠いマスが戻り終わるまで */
export const RIPPLE_TOTAL_MS = RIPPLE_REACH * RIPPLE_STEP_MS + RIPPLE_UP_MS + RIPPLE_DOWN_MS;

/** 今日のマスからの距離（マス数）。(日, 月) のマス目でのまっすぐな距離 */
export function rippleDistance(
  cell: { month: number; day: number },
  today: { month: number; day: number },
): number {
  return Math.hypot(cell.day - today.day, cell.month - today.month);
}

/** 波紋が始まって elapsed ms のときの、距離 distance のマスの明るさの上げ幅 */
export function rippleLift(elapsed: number, distance: number): number {
  if (distance <= 0 || distance > RIPPLE_REACH) return 0;
  const t = elapsed - distance * RIPPLE_STEP_MS;
  if (t <= 0) return 0;
  if (t < RIPPLE_UP_MS) return RIPPLE_LIFT * ease(t / RIPPLE_UP_MS);
  const back = (t - RIPPLE_UP_MS) / RIPPLE_DOWN_MS;
  if (back >= 1) return 0;
  return RIPPLE_LIFT * (1 - ease(back));
}

// ---- ばね ----

export interface SpringConfig {
  stiffness: number;
  damping: number;
  /** 省略すると 1 */
  mass?: number;
}

/** 色の場が開く・やめて閉じる */
export const SPRING_OPEN: SpringConfig = { stiffness: 380, damping: 32 };
/** 残して閉じる */
export const SPRING_SAVE: SpringConfig = { stiffness: 420, damping: 30 };
/** 選ぶ輪の大きさ */
export const SPRING_RING: SpringConfig = { stiffness: 500, damping: 28 };

/** 開くとき、移ろう色から色の場へ溶ける長さ */
export const FIELD_OPEN_BLEND_MS = 160;
/** 残すとき、色の場から選んだ1色へ溶ける長さ */
export const FIELD_SAVE_BLEND_MS = 120;
/** 「動きを減らす」ときの開閉（透明度の切り替え） */
export const FIELD_FADE_MS = 120;

/** 選ぶ輪の押している間の大きさ */
export const RING_PRESSED_SCALE = 1.25;

/** 札の点線が伸びる長さ */
export const CARD_LINE_MS = 180;
/** 札を出しておく長さ */
export const CARD_MS = 2400;
/** 札と点線が消える長さ */
export const CARD_FADE_MS = 160;

export interface SpringState {
  /** 位置 */
  x: number;
  /** 速さ（1秒あたり） */
  v: number;
}

/** 計算の1歩の上限（秒）。これより長い時間は刻んで進める */
const SPRING_SUBSTEP = 1 / 240;

/** ばねを dtMs だけ進める（target へ引かれる） */
export function stepSpring(
  state: SpringState,
  target: number,
  config: SpringConfig,
  dtMs: number,
): SpringState {
  const mass = config.mass ?? 1;
  let { x, v } = state;
  let left = Math.max(0, dtMs) / 1000;
  while (left > 0) {
    const dt = Math.min(SPRING_SUBSTEP, left);
    const a = (-config.stiffness * (x - target) - config.damping * v) / mass;
    v += a * dt;
    x += v * dt;
    left -= dt;
  }
  return { x, v };
}

/** 止まったとみなす近さ */
export const SPRING_EPSILON = 0.001;

/** target に十分近く、ほぼ止まっているか */
export function springAtRest(state: SpringState, target: number, epsilon = SPRING_EPSILON): boolean {
  return Math.abs(state.x - target) < epsilon && Math.abs(state.v) < epsilon * 10;
}

/** 0 から 1 へ動かしたとき、止まるまでの時間（ms） */
export function springSettleMs(config: SpringConfig, epsilon = SPRING_EPSILON): number {
  let state: SpringState = { x: 0, v: 0 };
  const step = 1;
  for (let t = 0; t < 10_000; t += step) {
    if (springAtRest(state, 1, epsilon)) return t;
    state = stepSpring(state, 1, config, step);
  }
  return Infinity;
}

// ---- 長方形の補間 ----

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** from から to へ p（0〜1、ばねで 1 を少し越えることもある）だけ進めた長方形 */
export function lerpBox(from: Box, to: Box, p: number): Box {
  const mix = (a: number, b: number) => a + (b - a) * p;
  return {
    x: mix(from.x, to.x),
    y: mix(from.y, to.y),
    width: Math.max(0, mix(from.width, to.width)),
    height: Math.max(0, mix(from.height, to.height)),
  };
}
