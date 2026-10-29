import { describe, expect, it } from "vitest";
import {
  buildCells,
  countRecorded,
  dateKey,
  dayOfYear,
  dayStatus,
  daysInMonth,
  formatMonthDay,
  hasRecordsInYear,
  localToday,
  moveDay,
  parseDateKey,
  yearCount,
} from "./calendar";

const today = { year: 2026, month: 10, day: 29 };

describe("buildCells", () => {
  it("うるう年でない年は365マスで、無い日を含まない", () => {
    const cells = buildCells(2026);
    expect(cells).toHaveLength(365);
    const keys = new Set(cells.map((c) => c.key));
    expect(keys.has("2026-02-28")).toBe(true);
    expect(keys.has("2026-02-29")).toBe(false);
    expect(keys.has("2026-02-30")).toBe(false);
    expect(keys.has("2026-04-31")).toBe(false);
    expect(keys.has("2026-12-31")).toBe(true);
  });

  it("うるう年は2/29を含む366マス", () => {
    const cells = buildCells(2028);
    expect(cells).toHaveLength(366);
    expect(cells.some((c) => c.key === "2028-02-29")).toBe(true);
  });

  it("1月1日から順に並ぶ", () => {
    const cells = buildCells(2026);
    expect(cells[0]).toEqual({ year: 2026, month: 1, day: 1, key: "2026-01-01" });
    expect(cells[31].key).toBe("2026-02-01");
  });
});

describe("daysInMonth", () => {
  it("100年ごとと400年ごとのうるう年を扱う", () => {
    expect(daysInMonth(1900, 2)).toBe(28);
    expect(daysInMonth(2000, 2)).toBe(29);
    expect(daysInMonth(2026, 4)).toBe(30);
    expect(daysInMonth(2026, 7)).toBe(31);
  });
});

describe("dateKey / parseDateKey", () => {
  it("0埋めのキーを作って読める", () => {
    expect(dateKey({ year: 2026, month: 3, day: 4 })).toBe("2026-03-04");
    expect(parseDateKey("2026-03-04")).toEqual({ year: 2026, month: 3, day: 4 });
  });

  it("形が違う・無い日は null", () => {
    expect(parseDateKey("2026-3-4")).toBeNull();
    expect(parseDateKey("2026-02-30")).toBeNull();
    expect(parseDateKey("2026-13-01")).toBeNull();
    expect(parseDateKey("hello")).toBeNull();
  });
});

describe("localToday", () => {
  it("端末の現地時間の年・月・日を返す", () => {
    expect(localToday(new Date(2026, 9, 29, 23, 59))).toEqual(today);
  });
});

describe("dayStatus", () => {
  it("過去・今日・先を分ける", () => {
    expect(dayStatus({ year: 2026, month: 10, day: 28 }, today)).toBe("past");
    expect(dayStatus({ year: 2026, month: 3, day: 31 }, today)).toBe("past");
    expect(dayStatus(today, today)).toBe("today");
    expect(dayStatus({ year: 2026, month: 10, day: 30 }, today)).toBe("future");
    expect(dayStatus({ year: 2026, month: 11, day: 1 }, today)).toBe("future");
  });
});

describe("dayOfYear", () => {
  it("10月29日は302日目", () => {
    expect(dayOfYear(today)).toBe(302);
    expect(dayOfYear({ year: 2026, month: 1, day: 1 })).toBe(1);
    expect(dayOfYear({ year: 2028, month: 12, day: 31 })).toBe(366);
  });
});

describe("countRecorded", () => {
  it("今年の今日までの記録だけを数える", () => {
    const records = {
      "2026-01-01": "#112233",
      "2026-10-29": "#112233",
      "2026-10-30": "#112233",
      "2025-05-05": "#112233",
      "bad-key": "#112233",
    };
    expect(countRecorded(records, today)).toBe(2);
  });

  it("214日分の記録なら 214", () => {
    const records: Record<string, string> = {};
    for (let i = 1; i <= 214; i++) {
      const d = new Date(2026, 0, i);
      records[dateKey(localToday(d))] = "#445566";
    }
    expect(countRecorded(records, today)).toBe(214);
  });
});

describe("moveDay", () => {
  it("←→ は日、月をまたぐ", () => {
    expect(moveDay({ year: 2026, month: 3, day: 1 }, "ArrowLeft", today)).toEqual({
      year: 2026,
      month: 2,
      day: 28,
    });
    expect(moveDay({ year: 2026, month: 1, day: 31 }, "ArrowRight", today)).toEqual({
      year: 2026,
      month: 2,
      day: 1,
    });
  });

  it("↑↓ は月、無い日なら月末へ", () => {
    expect(moveDay({ year: 2026, month: 3, day: 31 }, "ArrowUp", today)).toEqual({
      year: 2026,
      month: 2,
      day: 28,
    });
    expect(moveDay({ year: 2026, month: 1, day: 5 }, "ArrowDown", today)).toEqual({
      year: 2026,
      month: 2,
      day: 5,
    });
  });

  it("1月1日より前と今日より先へは出ない", () => {
    const jan1 = { year: 2026, month: 1, day: 1 };
    expect(moveDay(jan1, "ArrowLeft", today)).toEqual(jan1);
    expect(moveDay(jan1, "ArrowUp", today)).toEqual(jan1);
    expect(moveDay(today, "ArrowRight", today)).toEqual(today);
    expect(moveDay({ year: 2026, month: 9, day: 30 }, "ArrowDown", today)).toEqual(today);
  });

  it("過去の年は12月31日まで動け、年はまたがない", () => {
    const dec31 = { year: 2025, month: 12, day: 31 };
    expect(moveDay({ year: 2025, month: 12, day: 30 }, "ArrowRight", today)).toEqual(dec31);
    expect(moveDay(dec31, "ArrowRight", today)).toEqual(dec31);
    expect(moveDay(dec31, "ArrowDown", today)).toEqual(dec31);
  });
});

describe("hasRecordsInYear", () => {
  it("その年の記録があるときだけ true", () => {
    const records = { "2025-03-14": "#112233", "2026-01-01": "#445566" };
    expect(hasRecordsInYear(records, 2025)).toBe(true);
    expect(hasRecordsInYear(records, 2024)).toBe(false);
    expect(hasRecordsInYear({}, 2025)).toBe(false);
  });
});

describe("yearCount", () => {
  const records = {
    "2025-03-14": "#112233",
    "2025-12-31": "#112233",
    "2026-01-01": "#445566",
    "2026-10-29": "#445566",
    "2026-11-01": "#445566",
  };

  it("今年は今日までの記録 / 1月1日から今日までの日数", () => {
    expect(yearCount(records, 2026, today)).toEqual({ recorded: 2, total: 302 });
  });

  it("過去の年はその年の記録 / その年の日数", () => {
    expect(yearCount(records, 2025, today)).toEqual({ recorded: 2, total: 365 });
    expect(yearCount(records, 2024, today)).toEqual({ recorded: 0, total: 366 });
  });
});

describe("formatMonthDay", () => {
  it("月.日 の形で0埋めしない", () => {
    expect(formatMonthDay(today)).toBe("10.29");
    expect(formatMonthDay({ year: 2026, month: 3, day: 4 })).toBe("3.4");
  });
});
