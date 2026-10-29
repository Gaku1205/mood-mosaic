import { describe, expect, it, vi } from "vitest";
import {
  STORAGE_KEY,
  type RecordStorage,
  createRecordStore,
  loadRecords,
  parseRecords,
  saveRecord,
} from "./storage";

function memoryStorage(initial: Record<string, string> = {}): RecordStorage & {
  data: Record<string, string>;
} {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = v;
    },
  };
}

describe("parseRecords", () => {
  it("正しい値を読む", () => {
    expect(parseRecords('{"2026-10-29":"#a1b2c3"}')).toEqual({ "2026-10-29": "#A1B2C3" });
  });

  it("空・壊れた値は空として扱う", () => {
    expect(parseRecords(null)).toEqual({});
    expect(parseRecords("")).toEqual({});
    expect(parseRecords("{oops")).toEqual({});
    expect(parseRecords("[1,2]")).toEqual({});
    expect(parseRecords("null")).toEqual({});
    expect(parseRecords('"text"')).toEqual({});
  });

  it("形の合わない項目は捨てる", () => {
    const raw = JSON.stringify({
      "2026-10-29": "#112233",
      "2026-02-30": "#112233",
      "2026-10-28": "red",
      "2026-10-27": 5,
      x: "#112233",
    });
    expect(parseRecords(raw)).toEqual({ "2026-10-29": "#112233" });
  });
});

describe("loadRecords", () => {
  it("localStorage が無い・読めないときは空", () => {
    expect(loadRecords(null)).toEqual({});
    const broken: RecordStorage = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {},
    };
    expect(loadRecords(broken)).toEqual({});
  });
});

describe("saveRecord", () => {
  it("キー mood-mosaic:v1 に追記して保存する", () => {
    const storage = memoryStorage({ [STORAGE_KEY]: '{"2026-10-28":"#111111"}' });
    const next = saveRecord(storage, "2026-10-29", "#abcdef");
    expect(next).toEqual({ "2026-10-28": "#111111", "2026-10-29": "#ABCDEF" });
    expect(JSON.parse(storage.data[STORAGE_KEY])).toEqual(next);
  });

  it("同じ日は上書きする（塗り直し）", () => {
    const storage = memoryStorage();
    saveRecord(storage, "2026-10-29", "#111111");
    expect(saveRecord(storage, "2026-10-29", "#222222")).toEqual({ "2026-10-29": "#222222" });
  });

  it("壊れた値があっても上書きして保存できる", () => {
    const storage = memoryStorage({ [STORAGE_KEY]: "{oops" });
    expect(saveRecord(storage, "2026-10-29", "#111111")).toEqual({ "2026-10-29": "#111111" });
  });

  it("書き込みに失敗したら null", () => {
    const full: RecordStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    };
    expect(saveRecord(full, "2026-10-29", "#111111")).toBeNull();
    expect(saveRecord(null, "2026-10-29", "#111111")).toBeNull();
  });

  it("形の違うキーや色は保存しない", () => {
    const storage = memoryStorage();
    expect(saveRecord(storage, "2026-02-30", "#111111")).toBeNull();
    expect(saveRecord(storage, "2026-10-29", "blue")).toBeNull();
    expect(storage.data[STORAGE_KEY]).toBeUndefined();
  });
});

describe("createRecordStore", () => {
  it("同じ値のあいだは同じオブジェクトを返し、保存すると知らせる", () => {
    const storage = memoryStorage();
    const store = createRecordStore(() => storage);
    const first = store.getSnapshot();
    expect(store.getSnapshot()).toBe(first);

    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    expect(store.save("2026-10-29", "#123456")).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot()).toEqual({ "2026-10-29": "#123456" });
    unsubscribe();
  });

  it("保存に失敗したら false で、知らせない", () => {
    const store = createRecordStore(() => null);
    const listener = vi.fn();
    store.subscribe(listener);
    expect(store.save("2026-10-29", "#123456")).toBe(false);
    expect(listener).not.toHaveBeenCalled();
    expect(store.getSnapshot()).toEqual({});
  });
});
