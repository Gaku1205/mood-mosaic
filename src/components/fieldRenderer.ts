import { fieldOklch, oklchToRgb } from "@/lib/color";
import { GLSL_OKLCH, createGlProgram, sizeCanvas } from "./gl";

/** 色の場：横（x 0→1）が色相 0°→360°、縦（y 0→1）で L = 0.92 − 0.62y、C = 0.16 × (1 − y²) */
export interface FieldRenderer {
  kind: "webgl" | "2d";
  draw(width: number, height: number, dpr: number): void;
  destroy(): void;
}

const FRAGMENT = `
precision highp float;
uniform vec2 u_res;
${GLSL_OKLCH}
void main() {
  vec2 uv = vec2(gl_FragCoord.x / u_res.x, 1.0 - gl_FragCoord.y / u_res.y);
  float y = clamp(uv.y, 0.0, 1.0);
  float h = clamp(uv.x, 0.0, 1.0) * 6.283185307179586;
  gl_FragColor = vec4(oklchToRgb(0.92 - 0.62 * y, 0.16 * (1.0 - y * y), h), 1.0);
}
`;

function createWebGl(canvas: HTMLCanvasElement): FieldRenderer | null {
  const prog = createGlProgram(canvas, FRAGMENT);
  if (!prog) return null;
  return {
    kind: "webgl",
    draw(width, height, dpr) {
      sizeCanvas(canvas, width, height, dpr);
      prog.gl.uniform2f(prog.uniform("u_res"), canvas.width, canvas.height);
      prog.drawFullscreen();
    },
    destroy() {
      prog.destroy();
    },
  };
}

/** WebGL が使えないとき：1/4 の解像度の ImageData を引き伸ばす */
function create2d(canvas: HTMLCanvasElement): FieldRenderer | null {
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const small = document.createElement("canvas");
  const smallCtx = small.getContext("2d");
  if (!smallCtx) return null;
  return {
    kind: "2d",
    draw(width, height, dpr) {
      sizeCanvas(canvas, width, height, dpr);
      const w = Math.max(1, Math.round(canvas.width / 4));
      const h = Math.max(1, Math.round(canvas.height / 4));
      small.width = w;
      small.height = h;
      const image = smallCtx.createImageData(w, h);
      for (let j = 0; j < h; j++) {
        for (let i = 0; i < w; i++) {
          const rgb = oklchToRgb(fieldOklch({ x: (i + 0.5) / w, y: (j + 0.5) / h }));
          const k = (j * w + i) * 4;
          image.data[k] = Math.round(rgb[0] * 255);
          image.data[k + 1] = Math.round(rgb[1] * 255);
          image.data[k + 2] = Math.round(rgb[2] * 255);
          image.data[k + 3] = 255;
        }
      }
      smallCtx.putImageData(image, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(small, 0, 0, canvas.width, canvas.height);
    },
    destroy() {},
  };
}

export function createFieldRenderer(canvas: HTMLCanvasElement): FieldRenderer | null {
  return createWebGl(canvas) ?? create2d(canvas);
}
