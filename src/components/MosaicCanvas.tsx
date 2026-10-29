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
import type { Records } from "@/lib/storage";
import { type MosaicRenderer, createMosaicRenderer } from "./mosaicRenderer";

interface Props {
  /** 枠（マスを並べる範囲）の要素 */
  frameRef: RefObject<HTMLElement | null>;
  today: DayRef;
  /** 読み込み中は null（`--blank` のマスだけを描く） */
  records: Records | null;
  mobile: boolean;
  reducedMotion: boolean;
  focus: CellIndex | null;
  selected: CellIndex | null;
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

    const start = performance.now();
    let loadStart: number | null = null;
    let texture: Uint8Array | null = null;
    let textureFor: { records: Records | null; today: string } | null = null;
    let raf = 0;

    /** 1枚描く。続けて描く必要があれば true */
    const draw = (): boolean => {
      const p = propsRef.current;
      const frameEl = p.frameRef.current;
      if (!frameEl || !renderer) return false;
      const now = performance.now();
      const todayKey = dateKey(p.today);
      if (!texture || textureFor?.records !== p.records || textureFor.today !== todayKey) {
        texture = mosaicTexture(p.today.year, p.today, p.records ?? {});
        textureFor = { records: p.records, today: todayKey };
      }
      if (p.records && loadStart === null) loadStart = now;
      const load = loadStart === null ? 0 : Math.min(1, (now - loadStart) / LOAD_FADE_MS);
      // 2D canvas のときは「動きを減らす」と同じにする
      const still = p.reducedMotion || renderer.kind === "2d";
      const todayColor = todayCellColor(
        (now - start) / 1000,
        p.records?.[todayKey] ?? null,
        still,
      );
      const box = frameEl.getBoundingClientRect();
      renderer.draw({
        width: canvas.clientWidth,
        height: canvas.clientHeight,
        dpr: clampDpr(window.devicePixelRatio),
        frame: { x: box.left, y: box.top, width: box.width, height: box.height },
        mobile: p.mobile,
        year: p.today.year,
        texture,
        today: toCellIndex(p.today),
        todayColor: todayColor.rgb,
        todayRing: todayColor.ring,
        focus: p.focus,
        selected: p.selected,
        load,
      });
      return !still || (loadStart !== null && load < 1);
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
