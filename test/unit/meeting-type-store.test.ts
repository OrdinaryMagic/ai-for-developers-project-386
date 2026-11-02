import { describe, it, expect } from "vitest";
import { MeetingTypeStore } from "../../src/store/meeting-type-store.js";

describe("MeetingTypeStore", () => {
  it("create присваивает UUID v4", () => {
    const store = new MeetingTypeStore(30);
    const mt = store.create({
      name: "Stand-up",
      description: "Daily stand-up",
      durationMinutes: 30,
    });
    expect(mt.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(mt.name).toBe("Stand-up");
    expect(mt.description).toBe("Daily stand-up");
    expect(mt.durationMinutes).toBe(30);
  });

  it("create возвращает разные UUID для разных записей", () => {
    const store = new MeetingTypeStore(30);
    const a = store.create({ name: "A", description: "", durationMinutes: 30 });
    const b = store.create({ name: "B", description: "", durationMinutes: 30 });
    expect(a.id).not.toBe(b.id);
  });

  it("list возвращает все созданные в порядке вставки", () => {
    const store = new MeetingTypeStore(30);
    const a = store.create({ name: "A", description: "", durationMinutes: 30 });
    const b = store.create({ name: "B", description: "", durationMinutes: 60 });
    const c = store.create({ name: "C", description: "", durationMinutes: 90 });
    expect(store.list()).toEqual([a, b, c]);
  });

  it("list возвращает пустой массив, если ничего не создано", () => {
    expect(new MeetingTypeStore(30).list()).toEqual([]);
  });

  it("getById находит существующий тип", () => {
    const store = new MeetingTypeStore(30);
    const mt = store.create({ name: "X", description: "", durationMinutes: 30 });
    expect(store.getById(mt.id)).toEqual(mt);
  });

  it("getById возвращает undefined для отсутствующего id", () => {
    const store = new MeetingTypeStore(30);
    expect(store.getById("00000000-0000-0000-0000-000000000000")).toBeUndefined();
  });

  it("slotStepMinutes хранится как константа экземпляра", () => {
    expect(new MeetingTypeStore(15).slotStepMinutes).toBe(15);
    expect(new MeetingTypeStore(60).slotStepMinutes).toBe(60);
  });
});
