import { describe, expect, it } from "vitest";
import {
  fieldHex,
  fieldOklch,
  hexToFieldPoint,
  hexToRgb,
  isHexColor,
  nudgeFieldPoint,
  oklchToHex,
  rgbToHex,
  rgbToOklch,
  textColorOn,
} from "./color";

describe("oklchToHex", () => {
  it("白・黒・灰色を変換できる", () => {
    expect(oklchToHex({ l: 1, c: 0, h: 0 })).toBe("#FFFFFF");
    expect(oklchToHex({ l: 0, c: 0, h: 0 })).toBe("#000000");
    expect(oklchToHex({ l: 0.5, c: 0, h: 0 })).toBe("#636363");
  });

  it("よく知られた色に近い値になる", () => {
    // oklch(0.628 0.2577 29.23) は sRGB の赤
    expect(oklchToHex({ l: 0.62796, c: 0.25768, h: 29.2339 })).toBe("#FF0000");
  });

  it("sRGB をはみ出す色は 0〜1 にクランプする", () => {
    expect(oklchToHex({ l: 0.9, c: 0.4, h: 140 })).toMatch(/^#[0-9A-F]{6}$/);
  });
});

describe("rgbToOklch", () => {
  it("oklchToHex の逆になる", () => {
    const lch = rgbToOklch(hexToRgb("#FF0000") ?? [0, 0, 0]);
    expect(lch.l).toBeCloseTo(0.628, 3);
    expect(lch.c).toBeCloseTo(0.2577, 3);
    expect(lch.h).toBeCloseTo(29.23, 1);
  });
});

describe("hexToRgb / rgbToHex / isHexColor", () => {
  it("#RRGGBB を読み書きする", () => {
    expect(hexToRgb("#336699")).toEqual([0.2, 0.4, 0.6]);
    expect(rgbToHex([0.2, 0.4, 0.6])).toBe("#336699");
  });

  it("形が違えば読まない", () => {
    expect(hexToRgb("#369")).toBeNull();
    expect(hexToRgb("red")).toBeNull();
    expect(isHexColor("#12345G")).toBe(false);
    expect(isHexColor(123)).toBe(false);
  });
});

describe("fieldOklch", () => {
  it("x が色相、y で明るさと鮮やかさが決まる", () => {
    expect(fieldOklch({ x: 0, y: 0 })).toEqual({ l: 0.92, c: 0.16, h: 0 });
    const mid = fieldOklch({ x: 0.5, y: 0.5 });
    expect(mid.l).toBeCloseTo(0.61, 10);
    expect(mid.c).toBeCloseTo(0.12, 10);
    expect(mid.h).toBe(180);
    const bottom = fieldOklch({ x: 1, y: 1 });
    expect(bottom.l).toBeCloseTo(0.3, 10);
    expect(bottom.c).toBe(0);
    expect(bottom.h).toBe(360);
  });

  it("範囲外はクランプする", () => {
    expect(fieldOklch({ x: -1, y: -1 })).toEqual(fieldOklch({ x: 0, y: 0 }));
    expect(fieldOklch({ x: 2, y: 3 })).toEqual(fieldOklch({ x: 1, y: 1 }));
  });

  it("下の端は色の抜けた灰色", () => {
    const hex = fieldHex({ x: 0.3, y: 1 });
    expect(hex.slice(1, 3)).toBe(hex.slice(3, 5));
    expect(hex.slice(3, 5)).toBe(hex.slice(5, 7));
  });
});

describe("hexToFieldPoint", () => {
  it("色の場の色からほぼ同じ点に戻る", () => {
    // sRGB に収まらない所はクランプで少しずれるので、0.05 以内で確かめる
    const p = hexToFieldPoint(fieldHex({ x: 0.6, y: 0.5 }));
    expect(p?.x).toBeCloseTo(0.6, 1);
    expect(p?.y).toBeCloseTo(0.5, 1);
  });

  it("形が違えば null", () => {
    expect(hexToFieldPoint("nope")).toBeNull();
  });
});

describe("textColorOn", () => {
  it("L が 0.62 以上なら --night、未満なら --ink", () => {
    expect(textColorOn(oklchToHex({ l: 0.9, c: 0.05, h: 90 }))).toBe("var(--night)");
    expect(textColorOn(oklchToHex({ l: 0.4, c: 0.05, h: 90 }))).toBe("var(--ink)");
    expect(textColorOn("#FFFFFF")).toBe("var(--night)");
    expect(textColorOn("#000000")).toBe("var(--ink)");
  });

  it("境目の 0.62 の前後で切り替わる", () => {
    // L 0.62 の灰色は sRGB で #868686 付近
    expect(textColorOn("#878787")).toBe("var(--night)");
    expect(textColorOn("#858585")).toBe("var(--ink)");
  });
});

describe("nudgeFieldPoint", () => {
  it("色相は一周し、明るさは端で止まる", () => {
    const p = nudgeFieldPoint({ x: 0.99, y: 0.98 }, 0.02, 0.04);
    expect(p.x).toBeCloseTo(0.01, 10);
    expect(p.y).toBe(1);
    const q = nudgeFieldPoint({ x: 0.01, y: 0.02 }, -0.02, -0.04);
    expect(q.x).toBeCloseTo(0.99, 10);
    expect(q.y).toBe(0);
  });
});
