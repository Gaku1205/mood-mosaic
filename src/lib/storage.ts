import { parseDateKey } from "./calendar";
import { isHexColor } from "./color";

/** 記録：`{ "YYYY-MM-DD": "#RRGGBB" }` */
export type Records = Record<string, string>;

export const STORAGE_KEY = "mood-mosaic:v1";

/** 使う所だけの Storage（テストで差し替えられるように） */
export type RecordStorage = Pick<Storage, "getItem" | "setItem">;

/** 保存された文字列を読む。壊れていれば空、形の合わない項目は捨てる */
export function parseRecords(raw: string | null): Records {
  if (!raw) return {};
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return {};
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) return {};
  const records: Records = {};
  for (const [key, value] of Object.entries(data)) {
    if (parseDateKey(key) && isHexColor(value)) records[key] = value.toUpperCase();
  }
  return records;
}

/** localStorage から読む。読めなければ空 */
export function loadRecords(storage: RecordStorage | null): Records {
  if (!storage) return {};
  try {
    return parseRecords(storage.getItem(STORAGE_KEY));
  } catch {
    return {};
  }
}

/** 1日分を書き込む。書けたら新しい記録、失敗したら null */
export function saveRecord(
  storage: RecordStorage | null,
  key: string,
  hex: string,
): Records | null {
  if (!storage || !parseDateKey(key) || !isHexColor(hex)) return null;
  try {
    const next = { ...loadRecords(storage), [key]: hex.toUpperCase() };
    storage.setItem(STORAGE_KEY, JSON.stringify(next));
    return next;
  } catch {
    return null;
  }
}

/** ブラウザの localStorage（使えなければ null） */
export function browserStorage(): RecordStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/**
 * React の useSyncExternalStore で使う記録の置き場。
 * 保存された文字列が同じあいだは同じオブジェクトを返す
 */
export function createRecordStore(getStorage: () => RecordStorage | null) {
  const listeners = new Set<() => void>();
  let cachedRaw: string | null | undefined;
  let cached: Records = {};

  function readRaw(): string | null {
    try {
      return getStorage()?.getItem(STORAGE_KEY) ?? null;
    } catch {
      return null;
    }
  }

  function emit() {
    for (const listener of listeners) listener();
  }

  return {
    getSnapshot(): Records {
      const raw = readRaw();
      if (raw !== cachedRaw) {
        cachedRaw = raw;
        cached = parseRecords(raw);
      }
      return cached;
    },
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      const onStorage = (e: StorageEvent) => {
        if (e.key === null || e.key === STORAGE_KEY) listener();
      };
      if (typeof window !== "undefined") window.addEventListener("storage", onStorage);
      return () => {
        listeners.delete(listener);
        if (typeof window !== "undefined") window.removeEventListener("storage", onStorage);
      };
    },
    /** 1日分を残す。成功したら true */
    save(key: string, hex: string): boolean {
      const ok = saveRecord(getStorage(), key, hex) !== null;
      if (ok) emit();
      return ok;
    },
  };
}

export type RecordStore = ReturnType<typeof createRecordStore>;
