import { describe, expect, it } from "vitest";
import { hexToRgb, oklchToRgb, rgbToOklch } from "./color";
import {
  cellAtPoint,
  cellRect,
  clampDpr,
  gridShape,
  isMobileWidth,
  mosaicTexture,
  todayCellColor,
} from "./mosaic";

const frame = { x: 56, y: 72, width: 310, height: 120 };
const today = { year: 2026, month: 10, day: 29 };

describe("isMobileWidth / gridShape", () => {
  it("768px 未満はスマホ（31行 × 12列）、以上は PC（12行 × 31列）", () => {
    expect(isMobileWidth(767)).toBe(true);
    expect(isMobileWidth(768)).toBe(false);
    expect(gridShape(true)).toEqual({ cols: 12, rows: 31 });
    expect(gridShape(false)).toEqual({ cols: 31, rows: 12 });
  });
});

describe("clampDpr", () => {
  it("2 までに抑える", () => {
    expect(clampDpr(3)).toBe(2);
    expect(clampDpr(1.5)).toBe(1.5);
    expect(clampDpr(undefined)).toBe(1);
    expect(clampDpr(0)).toBe(1);
  });
});

describe("cellRect", () => {
  it("PC は横が日・縦が月", () => {
    expect(cellRect(frame, false, { month: 0, day: 0 })).toEqual({
      x: 56,
      y: 72,
      width: 10,
      height: 10,
    });
    expect(cellRect(frame, false, { month: 11, day: 30 })).toEqual({
      x: 356,
      y: 182,
      width: 10,
      height: 10,
    });
  });

  it("スマホは横が月・縦が日", () => {
    const f = { x: 0, y: 0, width: 120, height: 310 };
    expect(cellRect(f, true, { month: 2, day: 4 })).toEqual({ x: 20, y: 40, width: 10, height: 10 });
  });
});

describe("cellAtPoint", () => {
  it("点の下のマスを返す", () => {
    expect(cellAtPoint(frame, false, 2026, 56, 72)).toEqual({ month: 0, day: 0 });
    expect(cellAtPoint(frame, false, 2026, 56 + 285, 72 + 95)).toEqual({ month: 9, day: 28 });
  });

  it("枠の外と無い日は null", () => {
    expect(cellAtPoint(frame, false, 2026, 10, 10)).toBeNull();
    expect(cellAtPoint(frame, false, 2026, 366, 72)).toBeNull();
    // 2/29（2026年はうるう年でない）、2/30
    expect(cellAtPoint(frame, false, 2026, 56 + 285, 82)).toBeNull();
    expect(cellAtPoint(frame, false, 2026, 56 + 295, 82)).toBeNull();
    expect(cellAtPoint(frame, false, 2028, 56 + 285, 82)).toEqual({ month: 1, day: 28 });
  });
});

describe("mosaicTexture", () => {
  it("過去は記録の色か --blank、今日・先・無い日は --night", () => {
    const tex = mosaicTexture(2026, today, { "2026-01-01": "#FF8000" });
    const at = (m: number, d: number) => Array.from(tex.slice((m * 31 + d) * 4, (m * 31 + d) * 4 + 4));
    expect(at(0, 0)).toEqual([255, 128, 0, 255]);
    expect(at(0, 1)).toEqual([0x1d, 0x1c, 0x24, 255]);
    expect(at(9, 28)).toEqual([0x0f, 0x0e, 0x13, 255]);
    expect(at(10, 0)).toEqual([0x0f, 0x0e, 0x13, 255]);
    expect(at(1, 29)).toEqual([0x0f, 0x0e, 0x13, 255]);
  });
});

describe("todayCellColor", () => {
  it("未記録は L0.72・C0.12 で、30秒で色相が1周し、縁がある", () => {
    const a = todayCellColor(0, null, false);
    const b = todayCellColor(30, null, false);
    expect(a.ring).toBe(true);
    b.rgb.forEach((v, i) => expect(v).toBeCloseTo(a.rgb[i], 6));
    const lch = rgbToOklch(todayCellColor(5, null, false).rgb);
    expect(lch.l).toBeCloseTo(0.72, 3);
    expect(lch.c).toBeCloseTo(0.12, 3);
    expect(lch.h).toBeCloseTo(60, 1);
  });

  it("動きを減らすときは色相 280° で止まる", () => {
    const still = todayCellColor(12.3, null, true);
    expect(still.rgb).toEqual(oklchToRgb({ l: 0.72, c: 0.12, h: 280 }));
  });

  it("記録後は残した色の明るさが ±0.03 で揺れ、縁がない", () => {
    const hex = "#6A5ACD";
    const base = rgbToOklch(hexToRgb(hex) ?? [0, 0, 0]).l;
    const peak = todayCellColor(1.5, hex, false);
    expect(peak.ring).toBe(false);
    expect(rgbToOklch(peak.rgb).l).toBeCloseTo(base + 0.03, 3);
    expect(rgbToOklch(todayCellColor(4.5, hex, false).rgb).l).toBeCloseTo(base - 0.03, 3);
    expect(todayCellColor(4.5, hex, true).rgb).toEqual(hexToRgb(hex));
  });
});
