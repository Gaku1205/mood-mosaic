import { type DayRef, daysInMonth, dateKey, dayStatus } from "./calendar";
import { type Rgb, hexToRgb, oklchToRgb, rgbToOklch } from "./color";
import type { Records } from "./storage";

/** これより狭い幅はスマホの割り方（31行 × 12列） */
export const MOBILE_MAX_WIDTH = 768;

/** canvas の解像度の上限 */
export const MAX_DPR = 2;

/** 画面の飾りの色（docs/design.md の「色」） */
export const PALETTE = {
  night: "#0F0E13",
  blank: "#1D1C24",
  ink: "#F2F0F7",
  /** `--seam` の色と透明度 */
  seam: "#F4F2FF",
  seamAlpha: 0.08,
} as const;

/** 枠の外に引き伸ばす色の明るさ */
export const OUTSIDE_BRIGHTNESS = 0.4;

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** マスの位置（0 始まり）。month 0〜11、day 0〜30 */
export interface CellIndex {
  month: number;
  day: number;
}

export function isMobileWidth(width: number): boolean {
  return width < MOBILE_MAX_WIDTH;
}

export function clampDpr(dpr: number | undefined): number {
  if (!dpr || !Number.isFinite(dpr)) return 1;
  return Math.min(MAX_DPR, Math.max(1, dpr));
}

/** 列と行の数。PC は 31列 × 12行、スマホは 12列 × 31行 */
export function gridShape(mobile: boolean): { cols: number; rows: number } {
  return mobile ? { cols: 12, rows: 31 } : { cols: 31, rows: 12 };
}

/** マスの長方形（枠と同じ座標系） */
export function cellRect(frame: Rect, mobile: boolean, cell: CellIndex): Rect {
  const { cols, rows } = gridShape(mobile);
  const col = mobile ? cell.month : cell.day;
  const row = mobile ? cell.day : cell.month;
  const x0 = frame.x + (frame.width * col) / cols;
  const x1 = frame.x + (frame.width * (col + 1)) / cols;
  const y0 = frame.y + (frame.height * row) / rows;
  const y1 = frame.y + (frame.height * (row + 1)) / rows;
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

/** 点の下のマス。枠の外や、その年に無い日なら null */
export function cellAtPoint(
  frame: Rect,
  mobile: boolean,
  year: number,
  px: number,
  py: number,
): CellIndex | null {
  const u = (px - frame.x) / frame.width;
  const v = (py - frame.y) / frame.height;
  if (!(u >= 0 && u < 1 && v >= 0 && v < 1)) return null;
  const { cols, rows } = gridShape(mobile);
  const col = Math.floor(u * cols);
  const row = Math.floor(v * rows);
  const cell = mobile ? { month: col, day: row } : { month: row, day: col };
  return cell.day < daysInMonth(year, cell.month + 1) ? cell : null;
}

export function toCellIndex(ref: DayRef): CellIndex {
  return { month: ref.month - 1, day: ref.day - 1 };
}

export function toDayRef(year: number, cell: CellIndex): DayRef {
  return { year, month: cell.month + 1, day: cell.day + 1 };
}

function hexOrBlack(hex: string): Rgb {
  return hexToRgb(hex) ?? [0, 0, 0];
}

/**
 * マスの色を 31×12 の RGBA（1マス＝1ピクセル、横が日・縦が月）に詰める。
 * 過去は記録の色か `--blank`、今日と先の日と無い日は `--night`（今日は描くときに上書きする）
 */
export function mosaicTexture(year: number, today: DayRef, records: Records): Uint8Array {
  const data = new Uint8Array(31 * 12 * 4);
  const night = hexOrBlack(PALETTE.night);
  const blank = hexOrBlack(PALETTE.blank);
  for (let m = 0; m < 12; m++) {
    const len = daysInMonth(year, m + 1);
    for (let d = 0; d < 31; d++) {
      let rgb = night;
      if (d < len) {
        const ref = { year, month: m + 1, day: d + 1 };
        if (dayStatus(ref, today) === "past") {
          rgb = hexToRgb(records[dateKey(ref)] ?? "") ?? blank;
        }
      }
      const i = (m * 31 + d) * 4;
      data[i] = Math.round(rgb[0] * 255);
      data[i + 1] = Math.round(rgb[1] * 255);
      data[i + 2] = Math.round(rgb[2] * 255);
      data[i + 3] = 255;
    }
  }
  return data;
}

/** 今日のマスの色相が1秒に回る角度（30秒で1周） */
export const TODAY_HUE_SPEED = 12;
/** 「動きを減らす」ときの今日のマスの色相 */
export const TODAY_STILL_HUE = 280;

/**
 * 今日のマスの、その時刻の色。
 * 未記録：L 0.72・C 0.12 で色相が回り、縁あり。記録後：残した色の L を ±0.03（6秒で1往復）、縁なし
 */
export function todayCellColor(
  seconds: number,
  recordHex: string | null,
  still: boolean,
): { rgb: Rgb; ring: boolean } {
  const recorded = recordHex ? hexToRgb(recordHex) : null;
  if (!recorded) {
    const h = still ? TODAY_STILL_HUE : (seconds * TODAY_HUE_SPEED) % 360;
    return { rgb: oklchToRgb({ l: 0.72, c: 0.12, h }), ring: true };
  }
  if (still) return { rgb: recorded, ring: false };
  const lch = rgbToOklch(recorded);
  const l = lch.l + 0.03 * Math.sin((seconds / 6) * Math.PI * 2);
  return { rgb: oklchToRgb({ ...lch, l }), ring: false };
}
