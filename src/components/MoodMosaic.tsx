"use client";

import {
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  type DayRef,
  type MoveKey,
  countRecorded,
  dateKey,
  dayOfYear,
  dayStatus,
  formatMonthDay,
  moveDay,
  parseDateKey,
  previousDay,
} from "@/lib/calendar";
import { DEFAULT_FIELD_POINT, type FieldPoint, hexToFieldPoint, textColorOn } from "@/lib/color";
import { cellAtPoint, toCellIndex, toDayRef } from "@/lib/mosaic";
import type { Records } from "@/lib/storage";
import { ColorField } from "./ColorField";
import { MosaicCanvas } from "./MosaicCanvas";
import { recordStore, useIsMobile, useReducedMotion, useRecords, useTodayKey } from "./stores";

/** 過去のマスの札を出しておく長さ（ms） */
const CARD_MS = 2400;
const MOVE_KEYS: readonly string[] = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"];

/** 枠の中の横の位置（0〜1）→ CSS の left */
function colX(k: number): string {
  return `calc(var(--fl) + (100% - var(--fl) - var(--fr)) * ${k})`;
}

/** 枠の中の縦の位置（0〜1）→ CSS の top */
function rowY(k: number): string {
  return `calc(var(--ft) + (100% - var(--ft) - var(--fb)) * ${k})`;
}

/** 色の場を開いたときの輪の位置：今日の色 → 前の日の色 → 真ん中より少し上 */
function initialFieldPoint(records: Records, today: DayRef): FieldPoint {
  const prev = previousDay(today);
  const hex = records[dateKey(today)] ?? (prev ? records[dateKey(prev)] : undefined);
  return (hex && hexToFieldPoint(hex)) || DEFAULT_FIELD_POINT;
}

/** ページ全体。今日が決まる（ブラウザで読み込む）までは背景の名前だけを出す */
export function MoodMosaic() {
  const todayKey = useTodayKey();
  const today = todayKey ? parseDateKey(todayKey) : null;
  return (
    <main className="app">
      <h1 className="name">
        <span>mood</span> <span>mosaic</span>
      </h1>
      {today && <MosaicPage today={today} />}
    </main>
  );
}

function MosaicPage({ today }: { today: DayRef }) {
  const records = useRecords();
  const reducedMotion = useReducedMotion();
  const mobile = useIsMobile();
  const gridRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const cardTimer = useRef<number | undefined>(undefined);
  const returnFocus = useRef<HTMLElement | null>(null);
  const [focus, setFocus] = useState<DayRef | null>(null);
  const [focusVisible, setFocusVisible] = useState(false);
  const [selected, setSelected] = useState<DayRef | null>(null);
  const [fieldOpen, setFieldOpen] = useState(false);

  const todayKey = dateKey(today);
  const todayHex = records?.[todayKey] ?? null;
  const current =
    focus && focus.year === today.year && dayStatus(focus, today) !== "future" ? focus : today;
  const recorded = countRecorded(records ?? {}, today);
  const total = dayOfYear(today);
  const paintLabel = todayHex ? "塗り直す" : "今日を塗る";

  useEffect(() => () => window.clearTimeout(cardTimer.current), []);

  // 右上の数の幅を CSS に渡す（今日の札が重ならないように）
  useEffect(() => {
    const right = rightRef.current;
    const layer = layerRef.current;
    if (!right || !layer) return;
    const observer = new ResizeObserver(() => {
      layer.style.setProperty("--right-w", `${right.offsetWidth}px`);
    });
    observer.observe(right);
    return () => observer.disconnect();
  }, [mobile]);

  function showCard(ref: DayRef) {
    setSelected(ref);
    window.clearTimeout(cardTimer.current);
    cardTimer.current = window.setTimeout(() => setSelected(null), CARD_MS);
  }

  function openField() {
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    window.clearTimeout(cardTimer.current);
    setSelected(null);
    setFieldOpen(true);
  }

  function closeField() {
    setFieldOpen(false);
    const el = returnFocus.current;
    window.setTimeout(() => el?.focus(), 0);
  }

  function activate(ref: DayRef) {
    const status = dayStatus(ref, today);
    if (status === "past") showCard(ref);
    else if (status === "today") openField();
  }

  function dayAt(e: MouseEvent<HTMLElement>): DayRef | null {
    const box = e.currentTarget.getBoundingClientRect();
    const frame = { x: box.left, y: box.top, width: box.width, height: box.height };
    const cell = cellAtPoint(frame, mobile, today.year, e.clientX, e.clientY);
    return cell ? toDayRef(today.year, cell) : null;
  }

  function onGridPointerDown(e: PointerEvent<HTMLDivElement>) {
    setFocusVisible(false);
    const ref = dayAt(e);
    if (!ref || dayStatus(ref, today) === "future") return;
    setFocus(ref);
    if (dayStatus(ref, today) === "past") showCard(ref);
  }

  function onGridClick(e: MouseEvent<HTMLDivElement>) {
    const ref = dayAt(e);
    if (ref && dayStatus(ref, today) === "today") openField();
  }

  function onGridKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (MOVE_KEYS.includes(e.key)) {
      e.preventDefault();
      setFocus(moveDay(current, e.key as MoveKey, today));
      setFocusVisible(true);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setFocusVisible(true);
      activate(current);
    }
  }

  function saveToday(hex: string): boolean {
    return recordStore.save(todayKey, hex);
  }

  const selectedHex = selected ? records?.[dateKey(selected)] : undefined;
  const pastCardBody = (
    <>
      <span className="t-heading num">{selected && formatMonthDay(selected)}</span>
      {selectedHex ? (
        <span className="swatch" style={{ background: selectedHex }} />
      ) : (
        <span className="t-small dim">なし</span>
      )}
    </>
  );
  const focusHex = records?.[dateKey(current)];
  const announce =
    formatMonthDay(current) +
    (dayStatus(current, today) === "past" && !focusHex ? " なし" : "");
  const countBlock = (
    <span className="count">
      <span className="t-count num">{recorded}</span>
      <span className="t-small dim">
        <span className="num">/ {total}</span>日
      </span>
    </span>
  );

  return (
    <>
      <div className="layer" ref={layerRef} inert={fieldOpen}>
        <MosaicCanvas
          frameRef={gridRef}
          today={today}
          records={records}
          mobile={mobile}
          reducedMotion={reducedMotion}
          focus={focusVisible ? toCellIndex(current) : null}
          selected={selected ? toCellIndex(selected) : null}
        />

        <div
          ref={gridRef}
          className="grid"
          role="grid"
          aria-label={`${today.year}年の気分`}
          tabIndex={0}
          onPointerDown={onGridPointerDown}
          onClick={onGridClick}
          onKeyDown={onGridKeyDown}
          onFocus={(e) => setFocusVisible(e.currentTarget.matches(":focus-visible"))}
          onBlur={() => setFocusVisible(false)}
        />
        <p className="sr-only" aria-live="polite">
          {focusVisible ? announce : ""}
        </p>

        {mobile ? (
          <>
            <div className="band band-top">
              <div className="glass-bg glass-bg--down" />
              <div className="m-card">
                {selected ? (
                  pastCardBody
                ) : (
                  <>
                    <span className="t-heading num">{formatMonthDay(today)}</span>
                    <span className="t-small">今日</span>
                  </>
                )}
              </div>
              <div className="m-right" ref={rightRef}>
                {countBlock}
              </div>
            </div>
            {Array.from({ length: 12 }, (_, m) => (
              <span
                key={m}
                className={`m-month t-small num${m + 1 === today.month ? "" : " dim"}`}
                style={{ left: colX((m + 0.5) / 12) }}
              >
                {m + 1}
              </span>
            ))}
            <span className="m-today-mark" style={{ top: rowY((today.day - 1) / 31) }} />
            <div className="band band-bottom">
              <div className="glass-bg glass-bg--up" />
              <span className="t-heading num">{today.year}</span>
              <button
                type="button"
                className="fill-button paint-button t-body"
                style={
                  todayHex
                    ? { background: todayHex, color: textColorOn(todayHex) }
                    : undefined
                }
                onClick={openField}
              >
                {paintLabel}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="band band-top">
              <div className="glass-bg glass-bg--down" />
            </div>
            <div className="band band-left">
              <div className="glass-bg glass-bg--right" />
            </div>
            {Array.from({ length: 31 }, (_, d) =>
              d + 1 === today.day ? null : (
                <span
                  key={d}
                  className="day-number t-small num dim"
                  style={{ left: colX((d + 0.5) / 31) }}
                >
                  {d + 1}
                </span>
              ),
            )}
            {Array.from({ length: 12 }, (_, m) => (
              <span
                key={m}
                className={`month-label t-small${m + 1 === today.month ? "" : " dim"}`}
                style={{ top: rowY((m + 0.5) / 12) }}
              >
                <span className="num">{m + 1}</span>月
              </span>
            ))}
            {selected ? (
              <div className="card" style={{ left: cardLeft(selected.day) }}>
                {pastCardBody}
              </div>
            ) : (
              <>
                <button
                  type="button"
                  className="card card-button"
                  style={{ left: cardLeft(today.day) }}
                  onClick={openField}
                >
                  <span className="t-heading num">{formatMonthDay(today)}</span>
                  <span className="t-small">{paintLabel}</span>
                </button>
                <span
                  className="card-line"
                  style={{
                    left: colX((today.day - 0.5) / 31),
                    height: `calc(${rowY((today.month - 1) / 12)} - var(--card-bottom))`,
                  }}
                />
              </>
            )}
            <div className="pc-right" ref={rightRef}>
              {countBlock}
              <span className="t-heading num">{today.year}</span>
            </div>
          </>
        )}
      </div>

      {fieldOpen && (
        <ColorField
          dateLabel={formatMonthDay(today)}
          initialPoint={initialFieldPoint(records ?? {}, today)}
          onSave={saveToday}
          onClosed={closeField}
        />
      )}
    </>
  );
}

/** PC の札の left。日の列の左端に揃え、右上の数に重なるときは左へ寄せる */
function cardLeft(day: number): string {
  return `min(${colX((day - 1) / 31)}, calc(100% - var(--fr) - var(--right-w, 0px) - 16px - var(--card-w)))`;
}
