"use client";

import {
  type KeyboardEvent,
  type PointerEvent,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { type FieldPoint, fieldHex, nudgeFieldPoint, textColorOn } from "@/lib/color";
import {
  type Box,
  type SpringConfig,
  type SpringState,
  FIELD_FADE_MS,
  FIELD_OPEN_BLEND_MS,
  FIELD_SAVE_BLEND_MS,
  RING_PRESSED_SCALE,
  SPRING_OPEN,
  SPRING_RING,
  SPRING_SAVE,
  lerpBox,
  springAtRest,
  stepSpring,
} from "@/lib/motion";
import { createFieldRenderer } from "./fieldRenderer";

interface Props {
  /** 見出しの日付 `10.29` */
  dateLabel: string;
  initialPoint: FieldPoint;
  /** 今の色を残す。成功したら true */
  onSave: (hex: string) => boolean;
  /** 閉じ終わったとき。残して閉じたら saved は true */
  onClosed: (saved: boolean) => void;
  reducedMotion: boolean;
  /** 今日のマスの長方形（画面の座標）。無ければ透明度で開閉する */
  getOrigin: () => Box | null;
  /** 開いた瞬間の今日のマスの色 */
  originColor: string;
}

const HUE_STEP = 0.02;
const LIGHT_STEP = 0.04;
/** 1コマで進める時間の上限（タブが裏に回ったあとなどに飛ばないように） */
const MAX_FRAME_MS = 64;

/** 色の場の上に一面に重ねる色の、溶け込みの途中 */
interface Blend {
  color: string;
  from: number;
  to: number;
  ms: number;
  start: number;
}

/** 開閉のばね（進み 0 = 今日のマス、1 = 画面いっぱい） */
interface FieldMotion {
  state: SpringState;
  target: number;
  config: SpringConfig;
  origin: Box;
  blend: Blend;
  last: number;
  raf: number;
  onRest: (() => void) | null;
}

function blendOpacity(blend: Blend, now: number): number {
  const k = Math.min(1, Math.max(0, (now - blend.start) / blend.ms));
  return blend.from + (blend.to - blend.from) * k;
}

/** 画面いっぱいの色の場。なぞって色を選び「残す」 */
export function ColorField(props: Props) {
  const { dateLabel, initialPoint, onSave, reducedMotion } = props;
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const blendRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLSpanElement>(null);
  const propsRef = useRef(props);
  const closeTimer = useRef<number | undefined>(undefined);
  const motionRef = useRef<FieldMotion | null>(null);
  const ringMotion = useRef({ state: { x: 1, v: 0 }, target: 1, last: 0, raf: 0 });
  const [point, setPoint] = useState(initialPoint);
  const [pressed, setPressed] = useState(false);
  const [failed, setFailed] = useState(false);
  const [closing, setClosing] = useState(false);
  const hex = fieldHex(point);

  useEffect(() => {
    propsRef.current = props;
  });

  /** 開閉のばねを1コマ分描く */
  function paintMotion(m: FieldMotion, now: number, done: boolean) {
    const root = rootRef.current;
    const blend = blendRef.current;
    if (!root || !blend) return;
    if (done && m.target === 1) {
      root.style.clipPath = "";
    } else {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const b = lerpBox(m.origin, { x: 0, y: 0, width: vw, height: vh }, m.state.x);
      const top = Math.max(0, b.y);
      const left = Math.max(0, b.x);
      const right = Math.max(0, vw - b.x - b.width);
      const bottom = Math.max(0, vh - b.y - b.height);
      root.style.clipPath = `inset(${top}px ${right}px ${bottom}px ${left}px)`;
    }
    blend.style.background = m.blend.color;
    blend.style.opacity = String(blendOpacity(m.blend, now));
  }

  function runMotion() {
    const m = motionRef.current;
    if (!m || m.raf) return;
    m.last = performance.now();
    const frame = (now: number) => {
      const dt = Math.min(MAX_FRAME_MS, Math.max(0, now - m.last));
      m.last = now;
      m.state = stepSpring(m.state, m.target, m.config, dt);
      const blendDone = now - m.blend.start >= m.blend.ms;
      const done = springAtRest(m.state, m.target) && blendDone;
      if (done) m.state = { x: m.target, v: 0 };
      paintMotion(m, now, done);
      if (done) {
        m.raf = 0;
        m.onRest?.();
      } else {
        m.raf = requestAnimationFrame(frame);
      }
    };
    m.raf = requestAnimationFrame(frame);
  }

  useLayoutEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    root?.focus({ preventScroll: true });
    if (!root || !canvas) return;
    const renderer = createFieldRenderer(canvas);
    const draw = () =>
      renderer?.draw(
        canvas.clientWidth,
        canvas.clientHeight,
        Math.min(2, window.devicePixelRatio || 1),
      );
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    draw();

    // ばねで開くのは、動きを減らしていなくて WebGL で描けるときだけ
    const p = propsRef.current;
    const origin = p.reducedMotion || renderer?.kind !== "webgl" ? null : p.getOrigin();
    if (origin) {
      const now = performance.now();
      const m: FieldMotion = {
        state: { x: 0, v: 0 },
        target: 1,
        config: SPRING_OPEN,
        origin,
        blend: { color: p.originColor, from: 1, to: 0, ms: FIELD_OPEN_BLEND_MS, start: now },
        last: now,
        raf: 0,
        onRest: null,
      };
      motionRef.current = m;
      paintMotion(m, now, false);
      runMotion();
    } else {
      root.dataset.motion = "fade";
    }

    const ring = ringMotion.current;
    return () => {
      observer.disconnect();
      renderer?.destroy();
      window.clearTimeout(closeTimer.current);
      if (motionRef.current) cancelAnimationFrame(motionRef.current.raf);
      cancelAnimationFrame(ring.raf);
    };
    // 開いたときに1回だけ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 選ぶ輪の大きさ：押すと 1.25 倍へ、離すと 1 倍へ、ばねで動き直す
  useEffect(() => {
    const ring = ringRef.current;
    const a = ringMotion.current;
    if (!ring) return;
    const setScale = (s: number) => {
      ring.style.transform = `translate(-50%, -50%) scale(${s})`;
    };
    a.target = pressed && !reducedMotion ? RING_PRESSED_SCALE : 1;
    if (reducedMotion) {
      cancelAnimationFrame(a.raf);
      a.raf = 0;
      a.state = { x: a.target, v: 0 };
      setScale(a.target);
      return;
    }
    if (a.raf) return;
    a.last = performance.now();
    const frame = (now: number) => {
      const dt = Math.min(MAX_FRAME_MS, Math.max(0, now - a.last));
      a.last = now;
      a.state = stepSpring(a.state, a.target, SPRING_RING, dt);
      const done = springAtRest(a.state, a.target);
      if (done) a.state = { x: a.target, v: 0 };
      setScale(a.state.x);
      a.raf = done ? 0 : requestAnimationFrame(frame);
    };
    a.raf = requestAnimationFrame(frame);
  }, [pressed, reducedMotion]);

  function close(saved: boolean) {
    if (closing) return;
    setClosing(true);
    const m = motionRef.current;
    if (!m) {
      closeTimer.current = window.setTimeout(() => propsRef.current.onClosed(saved), FIELD_FADE_MS);
      return;
    }
    const now = performance.now();
    m.target = 0;
    m.config = saved ? SPRING_SAVE : SPRING_OPEN;
    m.origin = propsRef.current.getOrigin() ?? m.origin;
    if (saved) {
      m.blend = {
        color: hex,
        from: blendOpacity(m.blend, now),
        to: 1,
        ms: FIELD_SAVE_BLEND_MS,
        start: now,
      };
    }
    m.onRest = () => propsRef.current.onClosed(saved);
    runMotion();
  }

  function save() {
    if (closing) return;
    if (onSave(hex)) {
      setFailed(false);
      navigator.vibrate?.(8);
      close(true);
    } else {
      setFailed(true);
    }
  }

  function pointFrom(e: PointerEvent<HTMLElement>): FieldPoint {
    const box = e.currentTarget.getBoundingClientRect();
    const clamp = (v: number) => Math.min(1, Math.max(0, v));
    return {
      x: clamp((e.clientX - box.left) / box.width),
      y: clamp((e.clientY - box.top) / box.height),
    };
  }

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    if (closing) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setPressed(true);
    setPoint(pointFrom(e));
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (pressed && !closing) setPoint(pointFrom(e));
  }

  function onPointerUp() {
    setPressed(false);
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const step = e.shiftKey ? 5 : 1;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-HUE_STEP, 0],
      ArrowRight: [HUE_STEP, 0],
      ArrowUp: [0, -LIGHT_STEP],
      ArrowDown: [0, LIGHT_STEP],
    };
    const move = moves[e.key];
    if (move) {
      e.preventDefault();
      if (!closing) setPoint((p) => nudgeFieldPoint(p, move[0] * step, move[1] * step));
    } else if (e.key === "Escape") {
      e.preventDefault();
      close(false);
    } else if (e.key === "Enter" && !(e.target instanceof HTMLButtonElement)) {
      e.preventDefault();
      save();
    }
  }

  return (
    <div
      ref={rootRef}
      className={`field${closing ? " is-closing" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label="今日の色"
      tabIndex={0}
      onKeyDown={onKeyDown}
    >
      <div
        className="field-surface"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <canvas ref={canvasRef} className="field-canvas" aria-hidden="true" />
        <span
          ref={ringRef}
          className="field-ring"
          style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%`, background: hex }}
        />
      </div>

      <div className="field-head glass">
        <div className="glass-bg glass-bg--corner" />
        <span className="t-heading num">{dateLabel}</span>
        <span className="t-small dim">今日の色</span>
      </div>

      <div className="field-foot glass">
        <div className="glass-bg glass-bg--foot" />
        {failed && (
          <>
            <span className="t-small" role="alert">
              残せませんでした
            </span>
            <button type="button" className="text-button retry t-body" onClick={save}>
              もう一度
            </button>
          </>
        )}
        <button type="button" className="text-button cancel t-body" onClick={() => close(false)}>
          やめる
        </button>
        <button
          type="button"
          className="fill-button t-body"
          style={{ background: hex, color: textColorOn(hex) }}
          onClick={save}
        >
          残す
        </button>
      </div>

      <div ref={blendRef} className="field-blend" aria-hidden="true" />
    </div>
  );
}
