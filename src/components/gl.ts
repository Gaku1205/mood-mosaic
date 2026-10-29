/** WebGL の小さな下ごしらえ（画面いっぱいの三角形に1つのフラグメントシェーダーを走らせる） */

const VERTEX = `
attribute vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

/** OKLCH・Oklab ↔ sRGB（はみ出た値は 0〜1 にクランプ）。src/lib/color.ts と同じ式 */
export const GLSL_OKLCH = `
float toGamma(float v) {
  return v <= 0.0031308 ? 12.92 * v : 1.055 * pow(v, 1.0 / 2.4) - 0.055;
}
float toLinear(float v) {
  return v <= 0.04045 ? v / 12.92 : pow((v + 0.055) / 1.055, 2.4);
}
vec3 rgbToOklab(vec3 c) {
  vec3 lin = vec3(toLinear(c.r), toLinear(c.g), toLinear(c.b));
  float l_ = pow(0.4122214708 * lin.r + 0.5363015264 * lin.g + 0.0514459929 * lin.b, 1.0 / 3.0);
  float m_ = pow(0.2119034982 * lin.r + 0.6806995451 * lin.g + 0.1073969566 * lin.b, 1.0 / 3.0);
  float s_ = pow(0.0883024619 * lin.r + 0.2817188376 * lin.g + 0.6299787005 * lin.b, 1.0 / 3.0);
  return vec3(
    0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
    1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
    0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_);
}
vec3 oklabToRgb(float L, float a, float b) {
  float l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  float m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  float s_ = L - 0.0894841775 * a - 1.2914855480 * b;
  float l = l_ * l_ * l_;
  float m = m_ * m_ * m_;
  float s = s_ * s_ * s_;
  vec3 lin = vec3(
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076119740 * s);
  lin = clamp(lin, 0.0, 1.0);
  return vec3(toGamma(lin.r), toGamma(lin.g), toGamma(lin.b));
}
vec3 oklchToRgb(float L, float C, float h) {
  return oklabToRgb(L, C * cos(h), C * sin(h));
}
`;

/** `cubic-bezier(.2,.8,.2,1)`。src/lib/motion.ts の ease と同じ曲線（ニュートン法で解く） */
export const GLSL_EASE = `
float easeOut(float x) {
  x = clamp(x, 0.0, 1.0);
  float s = x;
  for (int i = 0; i < 6; i++) {
    float fx = ((s - 0.6) * s + 0.6) * s - x;
    float dx = (3.0 * s - 1.2) * s + 0.6;
    s = clamp(s - fx / dx, 0.0, 1.0);
  }
  return ((0.4 * s - 1.8) * s + 2.4) * s;
}
`;

export interface GlProgram {
  gl: WebGLRenderingContext;
  program: WebGLProgram;
  uniform(name: string): WebGLUniformLocation | null;
  drawFullscreen(): void;
  destroy(): void;
}

function compile(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

/** WebGL が使えない・シェーダーが通らないときは null（2D で描く） */
export function createGlProgram(canvas: HTMLCanvasElement, fragment: string): GlProgram | null {
  let gl: WebGLRenderingContext | null = null;
  try {
    gl = canvas.getContext("webgl", { antialias: false, premultipliedAlpha: false });
  } catch {
    return null;
  }
  if (!gl) return null;
  const vs = compile(gl, gl.VERTEX_SHADER, VERTEX);
  const fs = compile(gl, gl.FRAGMENT_SHADER, fragment);
  const program = gl.createProgram();
  if (!vs || !fs || !program) return null;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
  gl.useProgram(program);

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(program, "a_pos");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  const cache = new Map<string, WebGLUniformLocation | null>();
  const ctx = gl;
  return {
    gl: ctx,
    program,
    uniform(name) {
      if (!cache.has(name)) cache.set(name, ctx.getUniformLocation(program, name));
      return cache.get(name) ?? null;
    },
    drawFullscreen() {
      ctx.viewport(0, 0, ctx.drawingBufferWidth, ctx.drawingBufferHeight);
      ctx.drawArrays(ctx.TRIANGLES, 0, 3);
    },
    destroy() {
      ctx.deleteBuffer(buffer);
      ctx.deleteProgram(program);
      ctx.deleteShader(vs);
      ctx.deleteShader(fs);
    },
  };
}

/** canvas の画素数を CSS の大きさ × dpr に合わせる */
export function sizeCanvas(canvas: HTMLCanvasElement, width: number, height: number, dpr: number) {
  const w = Math.max(1, Math.round(width * dpr));
  const h = Math.max(1, Math.round(height * dpr));
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
}
