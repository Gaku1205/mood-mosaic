"use client";

import { useSyncExternalStore } from "react";
import { dateKey, localToday } from "@/lib/calendar";
import { MOBILE_MAX_WIDTH } from "@/lib/mosaic";
import { type Records, browserStorage, createRecordStore } from "@/lib/storage";

/** ブラウザに保存された記録（localStorage の `mood-mosaic:v1`） */
export const recordStore = createRecordStore(browserStorage);

const serverRecords = (): Records | null => null;

/** 記録。サーバーで描くとき（読み込み前）は null */
export function useRecords(): Records | null {
  return useSyncExternalStore<Records | null>(
    recordStore.subscribe,
    recordStore.getSnapshot,
    serverRecords,
  );
}

function subscribeClock(onChange: () => void): () => void {
  const id = window.setInterval(onChange, 10_000);
  document.addEventListener("visibilitychange", onChange);
  window.addEventListener("focus", onChange);
  return () => {
    window.clearInterval(id);
    document.removeEventListener("visibilitychange", onChange);
    window.removeEventListener("focus", onChange);
  };
}

const readTodayKey = () => dateKey(localToday(new Date()));
const serverTodayKey = () => "";

/** 端末の現地時間での今日（`YYYY-MM-DD`）。日付が変わると変わる。サーバーでは空 */
export function useTodayKey(): string {
  return useSyncExternalStore(subscribeClock, readTodayKey, serverTodayKey);
}

function mediaQueryStore(query: string) {
  return {
    subscribe(onChange: () => void) {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    read: () => window.matchMedia(query).matches,
    server: () => false,
  };
}

const reducedMotion = mediaQueryStore("(prefers-reduced-motion: reduce)");
const mobile = mediaQueryStore(`(max-width: ${MOBILE_MAX_WIDTH - 0.02}px)`);

export function useReducedMotion(): boolean {
  return useSyncExternalStore(reducedMotion.subscribe, reducedMotion.read, reducedMotion.server);
}

/** 幅 768px 未満（スマホの割り方） */
export function useIsMobile(): boolean {
  return useSyncExternalStore(mobile.subscribe, mobile.read, mobile.server);
}
