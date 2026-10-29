/** sRGB の色。各成分 0〜1 */
export type Rgb = [number, number, number];

export interface Oklch {
  l: number;
  c: number;
  /** 色相（度） */
  h: number;
}

/** 色の場の上の点。x・y は 0〜1（左上が 0,0） */
export interface FieldPoint {
  x: number;
  y: number;
}

/** 記録の無いときに色の場を開く位置 */
export const DEFAULT_FIELD_POINT: FieldPoint = { x: 0.5, y: 0.4 };

/** 文字色を `--night` にする明るさの下限（OKLCH の L） */
export const LIGHT_TEXT_THRESHOLD = 0.62;

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

function toGamma(v: number): number {
  return v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
}

function toLinear(v: number): number {
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

/** OKLCH → sRGB。範囲をはみ出た成分は 0〜1 にクランプする */
export function oklchToRgb({ l, c, h }: Oklch): Rgb {
  const rad = (h * Math.PI) / 180;
  const a = c * Math.cos(rad);
  const b = c * Math.sin(rad);
  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.291485548 * b;
  const L = l_ ** 3;
  const M = m_ ** 3;
  const S = s_ ** 3;
  const r = 4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S;
  const g = -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S;
  const bl = -0.0041960863 * L - 0.7034186147 * M + 1.707614074 * S;
  return [toGamma(clamp01(r)), toGamma(clamp01(g)), toGamma(clamp01(bl))];
}

/** sRGB → OKLCH */
export function rgbToOklch([r8, g8, b8]: Rgb): Oklch {
  const r = toLinear(r8);
  const g = toLinear(g8);
  const b = toLinear(b8);
  const l_ = Math.cbrt(0.4122214708 * r + 0.5363015264 * g + 0.0514459929 * b);
  const m_ = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s_ = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const l = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_;
  const A = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
  const B = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;
  const h = (Math.atan2(B, A) * 180) / Math.PI;
  return { l, c: Math.hypot(A, B), h: h < 0 ? h + 360 : h };
}

export function rgbToHex(rgb: Rgb): string {
  return (
    "#" +
    rgb
      .map((v) =>
        Math.round(clamp01(v) * 255)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
      .toUpperCase()
  );
}

const HEX_RE = /^#[0-9A-Fa-f]{6}$/;

export function isHexColor(value: unknown): value is string {
  return typeof value === "string" && HEX_RE.test(value);
}

/** `#RRGGBB` → sRGB。形が違えば null */
export function hexToRgb(hex: string): Rgb | null {
  if (!isHexColor(hex)) return null;
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function oklchToHex(color: Oklch): string {
  return rgbToHex(oklchToRgb(color));
}

/** 色の場の座標 → OKLCH。x は色相 0〜360°、y で L = 0.92 − 0.62y、C = 0.16 × (1 − y²)。範囲外はクランプ */
export function fieldOklch({ x, y }: FieldPoint): Oklch {
  const cx = clamp01(x);
  const cy = clamp01(y);
  return { l: 0.92 - 0.62 * cy, c: 0.16 * (1 - cy * cy), h: cx * 360 };
}

/** 色の場の座標 → `#RRGGBB` */
export function fieldHex(point: FieldPoint): string {
  return oklchToHex(fieldOklch(point));
}

/** `#RRGGBB` → 色の場でいちばん近い点（色相と明るさから戻す）。形が違えば null */
export function hexToFieldPoint(hex: string): FieldPoint | null {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const { l, h } = rgbToOklch(rgb);
  return { x: clamp01(h / 360), y: clamp01((0.92 - l) / 0.62) };
}

/** 気分の色の上に載せる文字の色。L が 0.62 以上なら `--night`、未満なら `--ink` */
export function textColorOn(hex: string): "var(--night)" | "var(--ink)" {
  const rgb = hexToRgb(hex);
  if (!rgb) return "var(--ink)";
  return rgbToOklch(rgb).l >= LIGHT_TEXT_THRESHOLD ? "var(--night)" : "var(--ink)";
}

/** 色の場の点をキーボードで動かす。x（色相）は一周させ、y は 0〜1 に収める */
export function nudgeFieldPoint(point: FieldPoint, dx: number, dy: number): FieldPoint {
  const x = (((point.x + dx) % 1) + 1) % 1;
  return { x, y: clamp01(point.y + dy) };
}
