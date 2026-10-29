/** 年・月・日。month は 1〜12、day は 1〜31 */
export interface DayRef {
  year: number;
  month: number;
  day: number;
}

/** マス1つ（その年に有る日だけ） */
export interface Cell extends DayRef {
  key: string;
}

export type DayStatus = "past" | "today" | "future";

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** `YYYY-MM-DD` の形の日付キー */
export function dateKey(ref: DayRef): string {
  return `${ref.year}-${pad2(ref.month)}-${pad2(ref.day)}`;
}

/** `YYYY-MM-DD` を読む。形が違う・その年に無い日なら null */
export function parseDateKey(key: string): DayRef | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return null;
  const ref = { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
  if (ref.month < 1 || ref.month > 12) return null;
  if (ref.day < 1 || ref.day > daysInMonth(ref.year, ref.month)) return null;
  return ref;
}

/** 端末の現地時間での今日 */
export function localToday(now: Date): DayRef {
  return { year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() };
}

/** その年のマスの一覧（1月1日から順に。無い日は含めない） */
export function buildCells(year: number): Cell[] {
  const cells: Cell[] = [];
  for (let month = 1; month <= 12; month++) {
    const len = daysInMonth(year, month);
    for (let day = 1; day <= len; day++) {
      const ref = { year, month, day };
      cells.push({ ...ref, key: dateKey(ref) });
    }
  }
  return cells;
}

function compare(a: DayRef, b: DayRef): number {
  return a.year - b.year || a.month - b.month || a.day - b.day;
}

export function dayStatus(ref: DayRef, today: DayRef): DayStatus {
  const c = compare(ref, today);
  if (c < 0) return "past";
  if (c === 0) return "today";
  return "future";
}

/** 1月1日から数えて何日目か（1月1日 = 1） */
export function dayOfYear(ref: DayRef): number {
  let n = ref.day;
  for (let month = 1; month < ref.month; month++) n += daysInMonth(ref.year, month);
  return n;
}

/** 今年の記録のうち、今日までの日の数 */
export function countRecorded(records: Record<string, string>, today: DayRef): number {
  let n = 0;
  for (const key of Object.keys(records)) {
    const ref = parseDateKey(key);
    if (ref && ref.year === today.year && dayStatus(ref, today) !== "future") n++;
  }
  return n;
}

/** その年に記録が1つでもあるか */
export function hasRecordsInYear(records: Record<string, string>, year: number): boolean {
  return Object.keys(records).some((key) => parseDateKey(key)?.year === year);
}

/**
 * 表示している年の記録の数。今年は「今日までの記録 / 1月1日から今日までの日数」、
 * 過去の年は「その年の記録 / その年の日数」
 */
export function yearCount(
  records: Record<string, string>,
  year: number,
  today: DayRef,
): { recorded: number; total: number } {
  if (year === today.year) {
    return { recorded: countRecorded(records, today), total: dayOfYear(today) };
  }
  const recorded = Object.keys(records).filter((key) => parseDateKey(key)?.year === year).length;
  return { recorded, total: dayOfYear({ year, month: 12, day: 31 }) };
}

/** 前の日（年をまたがない。1月1日なら null） */
export function previousDay(ref: DayRef): DayRef | null {
  if (ref.day > 1) return { ...ref, day: ref.day - 1 };
  if (ref.month === 1) return null;
  return { ...ref, month: ref.month - 1, day: daysInMonth(ref.year, ref.month - 1) };
}

/** 次の日（年をまたがない。12月31日なら null） */
export function nextDay(ref: DayRef): DayRef | null {
  if (ref.day < daysInMonth(ref.year, ref.month)) return { ...ref, day: ref.day + 1 };
  if (ref.month === 12) return null;
  return { ...ref, month: ref.month + 1, day: 1 };
}

export type MoveKey = "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown";

/**
 * 矢印キーでのマスの移動。←→ は日、↑↓ は月（その月に無い日なら月末へ）。
 * 今年の1月1日から今日までの範囲を出ない
 */
export function moveDay(ref: DayRef, key: MoveKey, today: DayRef): DayRef {
  let next: DayRef | null;
  if (key === "ArrowLeft") next = previousDay(ref);
  else if (key === "ArrowRight") next = nextDay(ref);
  else {
    const month = ref.month + (key === "ArrowUp" ? -1 : 1);
    next =
      month < 1 || month > 12
        ? null
        : { ...ref, month, day: Math.min(ref.day, daysInMonth(ref.year, month)) };
  }
  if (!next) return ref;
  return dayStatus(next, today) === "future" ? today : next;
}

/** 画面に出す日付 `10.29`（月.日、0埋めしない） */
export function formatMonthDay(ref: DayRef): string {
  return `${ref.month}.${ref.day}`;
}
