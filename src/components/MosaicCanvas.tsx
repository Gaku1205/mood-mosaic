"use client";

import { type RefObject, useEffect, useRef } from "react";
import { type DayRef, dateKey } from "@/lib/calendar";
import {
  type CellIndex,
  clampDpr,
  mosaicTexture,
  toCellIndex,
  todayCellColor,
} from "@/lib/mosaic";
import { APPEAR_TOTAL_MS, RIPPLE_TOTAL_MS } from "@/lib/motion";
import type { Records } from "@/lib/storage";
import { type MosaicRenderer, createMosaicRenderer } from "./mosaicRenderer";

interface Props {
  /** 枠（マスを並べる範囲）の要素 */
  frameRef: RefObject<HTMLElement | null>;
  today: DayRef;
  /** 表示している年（今年か前の年） */
  year: number;
  /** 読み込み中は null（`--blank` のマスだけを描く） */
  records: Records | null;
  mobile: boolean;
  reducedMotion: boolean;
  focus: CellIndex | null;
  selected: CellIndex | null;
  /** 波紋が始まった時刻（performance.now()）。無ければ null */
  rippleAt: number | null;
}

/** 読み込んだ色へ変える長さ（ms） */
const LOAD_FADE_MS = 200;

/** 画面全体を覆うモザイクの canvas。今日のマスだけが動き続ける */
export function MosaicCanvas(props: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const propsRef = useRef(props);
  const requestRef = useRef<() => void>(() => {});

  useEffect(() => {
    propsRef.current = props;
    requestRef.current();
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const renderer: MosaicRenderer | null = createMosaicRenderer(canvas);
    if (!renderer) return;

    let appearStart: number | null = null;
    let loadStart: number | null = null;
    let texture: Uint8Array | null = null;
    let textureFor: { records: Records | null; today: string; year: number } | null = null;
    let raf = 0;

    /** 1枚描く。続けて描く必要があれば true */
    const draw = (): boolean => {
      const p = propsRef.current;
      const frameEl = p.frameRef.current;
      if (!frameEl || !renderer) return false;
      const now = performance.now();
      const todayKey = dateKey(p.today);
      if (
        !texture ||
        textureFor?.records !== p.records ||
        textureFor.today !== todayKey ||
        textureFor.year !== p.year
      ) {
        texture = mosaicTexture(p.year, p.today, p.records ?? {});
        textureFor = { records: p.records, today: todayKey, year: p.year };
      }
      if (p.records && loadStart === null) loadStart = now;
      if (appearStart === null) appearStart = now;
      const load = loadStart === null ? 0 : Math.min(1, (now - loadStart) / LOAD_FADE_MS);
      // 2D canvas のときは「動きを減らす」と同じにする
      const still = p.reducedMotion || renderer.kind === "2d";
      const showToday = p.year === p.today.year;
      // 時計は performance.now()（色の場の溶け込みも同じ時計で今日の色を求める）
      const todayColor = todayCellColor(now / 1000, p.records?.[todayKey] ?? null, still);
      const appear = still ? null : now - appearStart;
      const ripple = still || p.rippleAt === null || !showToday ? null : now - p.rippleAt;
      const appearing = appear !== null && appear < APPEAR_TOTAL_MS;
      const rippling = ripple !== null && ripple < RIPPLE_TOTAL_MS;
      const box = frameEl.getBoundingClientRect();
      renderer.draw({
        width: canvas.clientWidth,
        height: canvas.clientHeight,
        dpr: clampDpr(window.devicePixelRatio),
        frame: { x: box.left, y: box.top, width: box.width, height: box.height },
        mobile: p.mobile,
        year: p.year,
        texture,
        today: showToday ? toCellIndex(p.today) : null,
        todayColor: todayColor.rgb,
        todayRing: todayColor.ring,
        focus: p.focus,
        selected: p.selected,
        load,
        appear: appearing ? appear : null,
        ripple: rippling ? ripple : null,
      });
      return (
        (!still && showToday) || (loadStart !== null && load < 1) || appearing || rippling
      );
    };

    const tick = () => {
      raf = 0;
      if (draw()) raf = requestAnimationFrame(tick);
    };
    const request = () => {
      if (!raf) raf = requestAnimationFrame(tick);
    };
    requestRef.current = request;

    const observer = new ResizeObserver(request);
    observer.observe(canvas);
    if (propsRef.current.frameRef.current) observer.observe(propsRef.current.frameRef.current);
    window.addEventListener("resize", request);
    request();

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      window.removeEventListener("resize", request);
      requestRef.current = () => {};
      renderer.destroy();
    };
  }, []);

  return <canvas ref={canvasRef} className="mosaic-canvas" aria-hidden="true" />;
}
