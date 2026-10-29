import { daysInMonth } from "@/lib/calendar";
import { type Rgb, hexToRgb } from "@/lib/color";
import {
  type CellIndex,
  type Rect,
  OUTSIDE_BRIGHTNESS,
  PALETTE,
  cellRect,
  gridShape,
} from "@/lib/mosaic";
import { createGlProgram, sizeCanvas } from "./gl";

/** 1回分の描く内容（座標は CSS px） */
export interface MosaicScene {
  width: number;
  height: number;
  dpr: number;
  frame: Rect;
  mobile: boolean;
  year: number;
  /** 31×12 の RGBA（src/lib/mosaic.ts の mosaicTexture） */
  texture: Uint8Array;
  today: CellIndex | null;
  todayColor: Rgb;
  todayRing: boolean;
  focus: CellIndex | null;
  selected: CellIndex | null;
  /** 読み込み中の `--blank` から色へ（0〜1） */
  load: number;
}

export interface MosaicRenderer {
  kind: "webgl" | "2d";
  draw(scene: MosaicScene): void;
  destroy(): void;
}

function rgbOf(hex: string): Rgb {
  return hexToRgb(hex) ?? [0, 0, 0];
}

const NIGHT = rgbOf(PALETTE.night);
const BLANK = rgbOf(PALETTE.blank);
const INK = rgbOf(PALETTE.ink);
const SEAM = rgbOf(PALETTE.seam);

const FRAGMENT = `
precision highp float;
uniform vec2 u_res;
uniform vec4 u_frame;
uniform float u_dpr;
uniform float u_mobile;
uniform float u_leap;
uniform sampler2D u_tex;
uniform vec2 u_today;
uniform vec3 u_todayColor;
uniform float u_todayRing;
uniform vec2 u_focus;
uniform vec2 u_selected;
uniform float u_load;
uniform vec3 u_night;
uniform vec3 u_blank;
uniform vec3 u_ink;
uniform vec3 u_seam;
uniform float u_seamAlpha;
uniform float u_outside;

float monthLen(float m) {
  if (abs(m - 1.0) < 0.5) return 28.0 + u_leap;
  if (abs(m - 3.0) < 0.5 || abs(m - 5.0) < 0.5 || abs(m - 8.0) < 0.5 || abs(m - 10.0) < 0.5) return 30.0;
  return 31.0;
}

bool same(vec2 a, vec2 b) {
  return abs(a.x - b.x) < 0.5 && abs(a.y - b.y) < 0.5;
}

vec3 cellColor(vec2 dm) {
  vec3 c = texture2D(u_tex, vec2((dm.x + 0.5) / 31.0, (dm.y + 0.5) / 12.0)).rgb;
  if (same(dm, u_today)) c = u_todayColor;
  return mix(u_blank, c, u_load);
}

void main() {
  vec2 p = vec2(gl_FragCoord.x, u_res.y - gl_FragCoord.y);
  vec2 local = (p - u_frame.xy) / u_frame.zw;
  vec2 shape = u_mobile > 0.5 ? vec2(12.0, 31.0) : vec2(31.0, 12.0);
  vec2 cell = floor(clamp(local, 0.0, 0.99999) * shape);
  // dm = (日, 月)、どちらも 0 始まり
  vec2 dm = u_mobile > 0.5 ? cell.yx : cell;
  float len = monthLen(dm.y);
  bool inside = local.x >= 0.0 && local.x < 1.0 && local.y >= 0.0 && local.y < 1.0;

  if (!inside) {
    dm.x = min(dm.x, len - 1.0);
    gl_FragColor = vec4(cellColor(dm) * u_outside, 1.0);
    return;
  }
  if (dm.x >= len) {
    gl_FragColor = vec4(u_night, 1.0);
    return;
  }

  vec3 c = cellColor(dm);
  vec2 size = u_frame.zw / shape;
  vec2 within = (p - u_frame.xy) - cell * size;
  float edge = min(min(within.x, within.y), min(size.x - within.x, size.y - within.y));
  if ((within.x < 1.0 && cell.x > 0.0) || (within.y < 1.0 && cell.y > 0.0)) {
    c = mix(c, u_seam, u_seamAlpha);
  }
  if (same(dm, u_today) && u_todayRing > 0.5 && edge < 1.5 * u_dpr) c = u_ink;
  if (same(dm, u_selected) && edge < 1.5 * u_dpr) c = u_ink;
  if (same(dm, u_focus) && edge < 2.0 * u_dpr) c = u_ink;
  gl_FragColor = vec4(c, 1.0);
}
`;

function cellVec(cell: CellIndex | null): [number, number] {
  return cell ? [cell.day, cell.month] : [-10, -10];
}

function createWebGl(canvas: HTMLCanvasElement): MosaicRenderer | null {
  const prog = createGlProgram(canvas, FRAGMENT);
  if (!prog) return null;
  const { gl } = prog;
  const tex = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  let uploaded: Uint8Array | null = null;

  gl.uniform1i(prog.uniform("u_tex"), 0);
  gl.uniform3fv(prog.uniform("u_night"), NIGHT);
  gl.uniform3fv(prog.uniform("u_blank"), BLANK);
  gl.uniform3fv(prog.uniform("u_ink"), INK);
  gl.uniform3fv(prog.uniform("u_seam"), SEAM);
  gl.uniform1f(prog.uniform("u_seamAlpha"), PALETTE.seamAlpha);
  gl.uniform1f(prog.uniform("u_outside"), OUTSIDE_BRIGHTNESS);

  return {
    kind: "webgl",
    draw(s) {
      sizeCanvas(canvas, s.width, s.height, s.dpr);
      if (uploaded !== s.texture) {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 31, 12, 0, gl.RGBA, gl.UNSIGNED_BYTE, s.texture);
        uploaded = s.texture;
      }
      const d = s.dpr;
      gl.uniform2f(prog.uniform("u_res"), canvas.width, canvas.height);
      gl.uniform4f(
        prog.uniform("u_frame"),
        s.frame.x * d,
        s.frame.y * d,
        s.frame.width * d,
        s.frame.height * d,
      );
      gl.uniform1f(prog.uniform("u_dpr"), d);
      gl.uniform1f(prog.uniform("u_mobile"), s.mobile ? 1 : 0);
      gl.uniform1f(prog.uniform("u_leap"), daysInMonth(s.year, 2) - 28);
      gl.uniform2fv(prog.uniform("u_today"), cellVec(s.today));
      gl.uniform3fv(prog.uniform("u_todayColor"), s.todayColor);
      gl.uniform1f(prog.uniform("u_todayRing"), s.todayRing ? 1 : 0);
      gl.uniform2fv(prog.uniform("u_focus"), cellVec(s.focus));
      gl.uniform2fv(prog.uniform("u_selected"), cellVec(s.selected));
      gl.uniform1f(prog.uniform("u_load"), s.load);
      prog.drawFullscreen();
    },
    destroy() {
      gl.deleteTexture(tex);
      prog.destroy();
    },
  };
}

function css(rgb: Rgb, scale = 1): string {
  const [r, g, b] = rgb.map((v) => Math.round(v * scale * 255));
  return `rgb(${r}, ${g}, ${b})`;
}

function sameCell(a: CellIndex | null, b: CellIndex | null): boolean {
  return !!a && !!b && a.month === b.month && a.day === b.day;
}

/** WebGL が使えないときの 2D canvas（マスは fillRect） */
function create2d(canvas: HTMLCanvasElement): MosaicRenderer | null {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  function colorAt(s: MosaicScene, cell: CellIndex): Rgb {
    let c: Rgb;
    if (sameCell(cell, s.today)) c = s.todayColor;
    else {
      const i = (cell.month * 31 + cell.day) * 4;
      c = [s.texture[i] / 255, s.texture[i + 1] / 255, s.texture[i + 2] / 255];
    }
    return [0, 1, 2].map((k) => BLANK[k] + (c[k] - BLANK[k]) * s.load) as Rgb;
  }

  const strokeInside = (r: Rect, width: number) => {
    ctx.strokeStyle = css(INK);
    ctx.lineWidth = width;
    ctx.strokeRect(r.x + width / 2, r.y + width / 2, r.width - width, r.height - width);
  };

  return {
    kind: "2d",
    draw(s) {
      sizeCanvas(canvas, s.width, s.height, s.dpr);
      ctx.setTransform(s.dpr, 0, 0, s.dpr, 0, 0);
      ctx.fillStyle = css(NIGHT);
      ctx.fillRect(0, 0, s.width, s.height);
      const { frame: f, mobile } = s;
      const right = f.x + f.width;
      const bottom = f.y + f.height;

      // 枠の外：いちばん近いマスの色を引き伸ばして暗くする
      for (let m = 0; m < 12; m++) {
        const last = daysInMonth(s.year, m + 1) - 1;
        for (let d = 0; d < 31; d++) {
          const r = cellRect(f, mobile, { month: m, day: d });
          const { cols, rows } = gridShape(mobile);
          const col = mobile ? m : d;
          const row = mobile ? d : m;
          const x0 = col === 0 ? 0 : r.x;
          const x1 = col === cols - 1 ? s.width : r.x + r.width;
          const y0 = row === 0 ? 0 : r.y;
          const y1 = row === rows - 1 ? s.height : r.y + r.height;
          const pick = { month: m, day: Math.min(d, last) };
          ctx.fillStyle = css(colorAt(s, pick), OUTSIDE_BRIGHTNESS);
          if (row === 0) ctx.fillRect(x0, y0, x1 - x0, f.y - y0);
          if (row === rows - 1) ctx.fillRect(x0, bottom, x1 - x0, y1 - bottom);
          if (col === 0) ctx.fillRect(x0, y0, f.x - x0, y1 - y0);
          if (col === cols - 1) ctx.fillRect(right, y0, x1 - right, y1 - y0);
        }
      }

      const seam = 1 / s.dpr;
      for (let m = 0; m < 12; m++) {
        const len = daysInMonth(s.year, m + 1);
        for (let d = 0; d < len; d++) {
          const cell = { month: m, day: d };
          const r = cellRect(f, mobile, cell);
          ctx.fillStyle = css(colorAt(s, cell));
          ctx.fillRect(r.x, r.y, r.width, r.height);
          ctx.fillStyle = `rgba(244, 242, 255, ${PALETTE.seamAlpha})`;
          if (r.x > f.x + 0.01) ctx.fillRect(r.x, r.y, seam, r.height);
          if (r.y > f.y + 0.01) ctx.fillRect(r.x, r.y, r.width, seam);
          if (sameCell(cell, s.today) && s.todayRing) strokeInside(r, 1.5);
          if (sameCell(cell, s.selected)) strokeInside(r, 1.5);
          if (sameCell(cell, s.focus)) strokeInside(r, 2);
        }
      }
    },
    destroy() {},
  };
}

export function createMosaicRenderer(canvas: HTMLCanvasElement): MosaicRenderer | null {
  return createWebGl(canvas) ?? create2d(canvas);
}
