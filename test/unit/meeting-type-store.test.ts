import { describe, it, expect } from "vitest";
import { MeetingTypeStore } from "../../src/store/meeting-type-store.js";

describe("MeetingTypeStore", () => {
  it("create присваивает UUID v4", () => {
    const store = new MeetingTypeStore({ slotStepMinutes: 30 });
    const mt = store.create({
      name: "Stand-up",
      description: "Daily stand-up",
      durationMinutes: 30,
    });
    expect(mt.ok).toBe(true);
    if (!mt.ok) return;
    expect(mt.value.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(mt.value.name).toBe("Stand-up");
    expect(mt.value.description).toBe("Daily stand-up");
    expect(mt.value.durationMinutes).toBe(30);
  });

  it("create возвращает разные UUID для разных записей", () => {
    const store = new MeetingTypeStore({ slotStepMinutes: 30 });
    const a = store.create({ name: "A", description: "", durationMinutes: 30 });
    const b = store.create({ name: "B", description: "", durationMinutes: 30 });
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.value.id).not.toBe(b.value.id);
  });

  it("list возвращает все созданные в порядке вставки", () => {
    const store = new MeetingTypeStore({ slotStepMinutes: 30 });
    const a = store.create({ name: "A", description: "", durationMinutes: 30 });
    const b = store.create({ name: "B", description: "", durationMinutes: 60 });
    const c = store.create({ name: "C", description: "", durationMinutes: 90 });
    expect([a, b, c].every((o) => o.ok)).toBe(true);
    if (!a.ok || !b.ok || !c.ok) return;
    expect(store.list()).toEqual([a.value, b.value, c.value]);
  });

  it("list возвращает пустой массив, если ничего не создано", () => {
    expect(new MeetingTypeStore({ slotStepMinutes: 30 }).list()).toEqual([]);
  });

  it("getById находит существующий тип", () => {
    const store = new MeetingTypeStore({ slotStepMinutes: 30 });
    const outcome = store.create({ name: "X", description: "", durationMinutes: 30 });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(store.getById(outcome.value.id)).toEqual(outcome.value);
  });

  it("getById возвращает undefined для отсутствующего id", () => {
    expect(
      new MeetingTypeStore({ slotStepMinutes: 30 }).getById("00000000-0000-0000-0000-000000000000"),
    ).toBeUndefined();
  });

  describe("create: инвариант кратности длительности шагу слотов", () => {
    it("принимает длительность, кратную slotStepMinutes (30)", () => {
      const store = new MeetingTypeStore({ slotStepMinutes: 30 });
      const out = store.create({ name: "A", description: "", durationMinutes: 30 });
      expect(out.ok).toBe(true);
    });

    it("принимает 2×slotStepMinutes", () => {
      const store = new MeetingTypeStore({ slotStepMinutes: 30 });
      const out = store.create({ name: "A", description: "", durationMinutes: 60 });
      expect(out.ok).toBe(true);
    });

    it("принимает 1440 (сутки, 48 шагов по 30)", () => {
      const store = new MeetingTypeStore({ slotStepMinutes: 30 });
      const out = store.create({ name: "A", description: "", durationMinutes: 1440 });
      expect(out.ok).toBe(true);
    });

    it("отвергает 15 минут при шаге 30 → INVALID_DURATION/422", () => {
      const store = new MeetingTypeStore({ slotStepMinutes: 30 });
      const out = store.create({ name: "A", description: "", durationMinutes: 15 });
      expect(out.ok).toBe(false);
      if (out.ok) return;
      expect(out.error.code).toBe("INVALID_DURATION");
      expect(out.error.statusCode).toBe(422);
      expect(typeof out.error.message).toBe("string");
      expect(out.error.message.length).toBeGreaterThan(0);
    });

    it("отвергает 45 минут при шаге 30 → INVALID_DURATION", () => {
      const store = new MeetingTypeStore({ slotStepMinutes: 30 });
      const out = store.create({ name: "A", description: "", durationMinutes: 45 });
      expect(out.ok).toBe(false);
      if (out.ok) return;
      expect(out.error.code).toBe("INVALID_DURATION");
    });

    it("отвергает 7 минут при шаге 15 → INVALID_DURATION (настраиваемый шаг)", () => {
      const store = new MeetingTypeStore({ slotStepMinutes: 15 });
      const out = store.create({ name: "A", description: "", durationMinutes: 7 });
      expect(out.ok).toBe(false);
      if (out.ok) return;
      expect(out.error.code).toBe("INVALID_DURATION");
    });

    it("принимает 15 минут при шаге 15 (граничный случай)", () => {
      const store = new MeetingTypeStore({ slotStepMinutes: 15 });
      const out = store.create({ name: "A", description: "", durationMinutes: 15 });
      expect(out.ok).toBe(true);
    });

    it("30 минут остаётся валидным при шаге 15 (общий делитель)", () => {
      const store = new MeetingTypeStore({ slotStepMinutes: 15 });
      const out = store.create({ name: "A", description: "", durationMinutes: 30 });
      expect(out.ok).toBe(true);
    });

    it("отказ не сохраняет тип в стор", () => {
      const store = new MeetingTypeStore({ slotStepMinutes: 30 });
      const out = store.create({ name: "A", description: "", durationMinutes: 15 });
      expect(out.ok).toBe(false);
      expect(store.list()).toEqual([]);
    });

    it("после отказа можно записать валидный тип", () => {
      const store = new MeetingTypeStore({ slotStepMinutes: 30 });
      const bad = store.create({ name: "A", description: "", durationMinutes: 15 });
      expect(bad.ok).toBe(false);
      const good = store.create({ name: "B", description: "", durationMinutes: 30 });
      expect(good.ok).toBe(true);
      if (!good.ok) return;
      expect(store.list()).toEqual([good.value]);
    });
  });
});
