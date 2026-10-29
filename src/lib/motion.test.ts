import { describe, expect, it } from "vitest";
import {
  APPEAR_TOTAL_MS,
  RIPPLE_TOTAL_MS,
  SPRING_OPEN,
  SPRING_RING,
  SPRING_SAVE,
  appearDelay,
  appearOpacity,
  cubicBezier,
  ease,
  lerpBox,
  rippleDistance,
  rippleLift,
  springAtRest,
  springSettleMs,
  stepSpring,
} from "./motion";

describe("cubicBezier / ease", () => {
  it("両端は 0 と 1、途中は増える一方", () => {
    expect(ease(0)).toBe(0);
    expect(ease(1)).toBe(1);
    let prev = 0;
    for (let i = 1; i <= 100; i++) {
      const v = ease(i / 100);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });

  it("cubic-bezier(.2,.8,.2,1) は最初に速く進む", () => {
    expect(ease(0.25)).toBeCloseTo(0.767, 2);
    expect(ease(0.5)).toBeCloseTo(0.946, 2);
  });

  it("linear と同じ点なら直線になる", () => {
    const linear = cubicBezier(0, 0, 1, 1);
    expect(linear(0.3)).toBeCloseTo(0.3, 5);
    expect(linear(0.8)).toBeCloseTo(0.8, 5);
  });
});

describe("マスの出現", () => {
  it("遅れ＝（行＋列）× 12ms", () => {
    expect(appearDelay(0, 0)).toBe(0);
    expect(appearDelay(9, 28)).toBe(37 * 12);
    expect(appearDelay(11, 30)).toBe(492);
  });

  it("各 240ms で透明から不透明へ", () => {
    expect(appearOpacity(0, 0, 0)).toBe(0);
    expect(appearOpacity(120, 0, 0)).toBeCloseTo(ease(0.5), 6);
    expect(appearOpacity(240, 0, 0)).toBe(1);
    // 2月3日（行1・列2）は 36ms 遅れて始まる
    expect(appearOpacity(36, 1, 2)).toBe(0);
    expect(appearOpacity(36 + 240, 1, 2)).toBe(1);
  });

  it("全部のマスが出終わる時刻", () => {
    expect(APPEAR_TOTAL_MS).toBe(492 + 240);
    expect(appearOpacity(APPEAR_TOTAL_MS, 11, 30)).toBe(1);
  });
});

describe("波紋", () => {
  const today = { month: 9, day: 28 };

  it("距離は今日からのマス数（まっすぐ）", () => {
    expect(rippleDistance({ month: 9, day: 27 }, today)).toBe(1);
    expect(rippleDistance({ month: 7, day: 28 }, today)).toBe(2);
    expect(rippleDistance({ month: 6, day: 24 }, today)).toBe(5);
  });

  it("遅れ＝距離 × 24ms、80ms で +0.10 まで上がり、360ms で戻る", () => {
    const d = 3;
    expect(rippleLift(72, d)).toBe(0);
    expect(rippleLift(72 + 40, d)).toBeCloseTo(0.1 * ease(0.5), 6);
    expect(rippleLift(72 + 80, d)).toBeCloseTo(0.1, 6);
    expect(rippleLift(72 + 80 + 180, d)).toBeCloseTo(0.1 * (1 - ease(0.5)), 6);
    expect(rippleLift(72 + 80 + 360, d)).toBe(0);
  });

  it("今日のマスと 14マスより先は揺らさない", () => {
    expect(rippleLift(80, 0)).toBe(0);
    expect(rippleLift(14 * 24 + 80, 14)).toBeCloseTo(0.1, 6);
    expect(rippleLift(15 * 24 + 80, 14.5)).toBe(0);
  });

  it("全部が戻り終わる時刻", () => {
    expect(RIPPLE_TOTAL_MS).toBe(14 * 24 + 80 + 360);
    for (let d = 1; d <= 14; d++) expect(rippleLift(RIPPLE_TOTAL_MS, d)).toBe(0);
  });
});

describe("ばね", () => {
  it("目標へ引かれて止まる", () => {
    let s = { x: 0, v: 0 };
    for (let t = 0; t < 2000; t += 16) s = stepSpring(s, 1, SPRING_OPEN, 16);
    expect(springAtRest(s, 1)).toBe(true);
  });

  it("刻み方が違っても同じ所へ進む", () => {
    const once = stepSpring({ x: 0, v: 0 }, 1, SPRING_SAVE, 100);
    let s = { x: 0, v: 0 };
    for (let t = 0; t < 100; t += 4) s = stepSpring(s, 1, SPRING_SAVE, 4);
    expect(s.x).toBeCloseTo(once.x, 2);
  });

  it("開く（380・32）は約 420ms で止まり、少しだけ行き過ぎる", () => {
    const ms = springSettleMs(SPRING_OPEN);
    expect(ms).toBeGreaterThan(350);
    expect(ms).toBeLessThan(500);
    let s = { x: 0, v: 0 };
    let max = 0;
    for (let t = 0; t < 1000; t++) {
      s = stepSpring(s, 1, SPRING_OPEN, 1);
      max = Math.max(max, s.x);
    }
    expect(max).toBeGreaterThan(1);
    expect(max).toBeLessThan(1.02);
  });

  it("残す（420・30）は開くより速く止まる", () => {
    expect(springSettleMs(SPRING_SAVE)).toBeLessThan(springSettleMs(SPRING_OPEN));
  });

  it("選ぶ輪（500・28）は 1 → 1.25 倍へ動く", () => {
    let s = { x: 1, v: 0 };
    for (let t = 0; t < 1000; t += 16) s = stepSpring(s, 1.25, SPRING_RING, 16);
    expect(s.x).toBeCloseTo(1.25, 3);
  });

  it("時間が 0 なら動かない", () => {
    expect(stepSpring({ x: 0.3, v: 2 }, 1, SPRING_OPEN, 0)).toEqual({ x: 0.3, v: 2 });
  });
});

describe("lerpBox", () => {
  const from = { x: 100, y: 200, width: 30, height: 50 };
  const to = { x: 0, y: 0, width: 1000, height: 800 };

  it("0 で from、1 で to", () => {
    expect(lerpBox(from, to, 0)).toEqual(from);
    expect(lerpBox(from, to, 1)).toEqual(to);
    expect(lerpBox(from, to, 0.5)).toEqual({ x: 50, y: 100, width: 515, height: 425 });
  });

  it("行き過ぎても幅と高さは負にしない", () => {
    const box = lerpBox(to, from, 1.2);
    expect(box.width).toBeGreaterThanOrEqual(0);
    expect(lerpBox(to, { ...from, width: 0, height: 0 }, 1.5).width).toBe(0);
  });
});
