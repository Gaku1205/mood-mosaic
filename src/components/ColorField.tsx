"use client";

import {
  type KeyboardEvent,
  type PointerEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { type FieldPoint, fieldHex, nudgeFieldPoint, textColorOn } from "@/lib/color";
import { createFieldRenderer } from "./fieldRenderer";

interface Props {
  /** 見出しの日付 `10.29` */
  dateLabel: string;
  initialPoint: FieldPoint;
  /** 今の色を残す。成功したら true */
  onSave: (hex: string) => boolean;
  /** 閉じ終わったとき */
  onClosed: () => void;
}

/** 開閉の透明度の切り替え（ms） */
const FADE_MS = 120;
const HUE_STEP = 0.02;
const LIGHT_STEP = 0.04;

/** 画面いっぱいの色の場。なぞって色を選び「残す」 */
export function ColorField({ dateLabel, initialPoint, onSave, onClosed }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const closeTimer = useRef<number | undefined>(undefined);
  const [point, setPoint] = useState(initialPoint);
  const [pressed, setPressed] = useState(false);
  const [failed, setFailed] = useState(false);
  const [closing, setClosing] = useState(false);
  const hex = fieldHex(point);

  useEffect(() => {
    rootRef.current?.focus();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const renderer = createFieldRenderer(canvas);
    if (!renderer) return;
    const draw = () =>
      renderer.draw(canvas.clientWidth, canvas.clientHeight, Math.min(2, window.devicePixelRatio || 1));
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    draw();
    return () => {
      observer.disconnect();
      renderer.destroy();
      window.clearTimeout(closeTimer.current);
    };
  }, []);

  function close() {
    if (closing) return;
    setClosing(true);
    closeTimer.current = window.setTimeout(onClosed, FADE_MS);
  }

  function save() {
    if (closing) return;
    if (onSave(hex)) {
      setFailed(false);
      navigator.vibrate?.(8);
      close();
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
    e.currentTarget.setPointerCapture(e.pointerId);
    setPressed(true);
    setPoint(pointFrom(e));
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (pressed) setPoint(pointFrom(e));
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
      setPoint((p) => nudgeFieldPoint(p, move[0] * step, move[1] * step));
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
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
          className={`field-ring${pressed ? " is-pressed" : ""}`}
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
        <button type="button" className="text-button cancel t-body" onClick={close}>
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
    </div>
  );
}
