import { describe, it, expect, beforeEach } from "vitest";
import { DateTime } from "luxon";
import type { OwnerConfig } from "../../src/config/owner.js";
import { MeetingTypeStore } from "../../src/store/meeting-type-store.js";
import { BookingStore } from "../../src/store/booking-store.js";
import type { MeetingType } from "../../src/types.js";

const tz = "Europe/Moscow";
const cfg: OwnerConfig = {
  owner: { name: "Owner", timezone: tz },
  windowDays: 14,
  slotStepMinutes: 30,
  workingDays: [1, 2, 3, 4, 5],
  workingHours: { start: "09:00", end: "18:00" },
};

const now = DateTime.fromISO("2025-11-03T14:00:00", { zone: tz });

const iso = (year: number, month: number, day: number, h: number, m: number): string =>
  DateTime.fromObject({ year, month, day, hour: h, minute: m }, { zone: tz }).toISO({
    suppressMilliseconds: true,
  })!;

let mtStore: MeetingTypeStore;
let store: BookingStore;

/**
 * В тестах ниже мы всегда создаём тип с валидной (кратной) длительностью
 * — поэтому `create` обязан вернуть успех; разворачиваем tagged union здесь,
 * чтобы дальше код читался как пользовательский (через `MeetingType`).
 */
const createOk = (name: string, durationMinutes: number): MeetingType => {
  const out = mtStore.create({ name, description: "", durationMinutes });
  if (!out.ok) throw new Error(`test setup: create(${name}) failed: ${out.error.code}`);
  return out.value;
};

beforeEach(() => {
  mtStore = new MeetingTypeStore({ slotStepMinutes: 30 });
  createOk("Stand-up", 30);
  store = new BookingStore(mtStore, cfg);
});

const mtByName = (name: string) => mtStore.list().find((m) => m.name === name)!;

describe("BookingStore.book happy path", () => {
  it("создаёт запись с UUID v4 и снимком имени типа", async () => {
    const mt = mtByName("Stand-up");
    const out = await store.book(
      {
        meetingTypeId: mt.id,
        startsAt: iso(2025, 11, 3, 15, 0),
        guestName: "A",
        guestEmail: "a@x.test",
      },
      { now },
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.booking.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(out.booking.meetingTypeId).toBe(mt.id);
    expect(out.booking.meetingTypeName).toBe("Stand-up");
    expect(out.booking.guestName).toBe("A");
    expect(out.booking.guestEmail).toBe("a@x.test");
    expect(out.booking.startsAt).toBe(iso(2025, 11, 3, 15, 0));
    expect(out.booking.endsAt).toBe(iso(2025, 11, 3, 15, 30));
  });

  it("back-to-back: 15:30 после 15:00 разрешён", async () => {
    const mt = mtByName("Stand-up");
    const first = await store.book(
      {
        meetingTypeId: mt.id,
        startsAt: iso(2025, 11, 3, 15, 0),
        guestName: "A",
        guestEmail: "a@x.test",
      },
      { now },
    );
    expect(first.ok).toBe(true);
    const second = await store.book(
      {
        meetingTypeId: mt.id,
        startsAt: iso(2025, 11, 3, 15, 30),
        guestName: "B",
        guestEmail: "b@x.test",
      },
      { now },
    );
    expect(second.ok).toBe(true);
  });
});

describe("BookingStore.book error paths", () => {
  it("возвращает MEETING_TYPE_NOT_FOUND", async () => {
    const out = await store.book(
      {
        meetingTypeId: "00000000-0000-0000-0000-000000000000",
        startsAt: iso(2025, 11, 3, 9, 0),
        guestName: "A",
        guestEmail: "a@x.test",
      },
      { now },
    );
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.error.code).toBe("MEETING_TYPE_NOT_FOUND");
    expect(out.error.statusCode).toBe(404);
  });

  it("возвращает OUTSIDE_WINDOW для старта до 00:00 сегодня", async () => {
    const mt = mtByName("Stand-up");
    const out = await store.book(
      {
        meetingTypeId: mt.id,
        startsAt: iso(2025, 11, 2, 23, 0),
        guestName: "A",
        guestEmail: "a@x.test",
      },
      { now },
    );
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.error.code).toBe("OUTSIDE_WINDOW");
  });

  it("возвращает OUTSIDE_WINDOW для старта в последний день >= конца окна", async () => {
    const mt = mtByName("Stand-up");
    const out = await store.book(
      {
        meetingTypeId: mt.id,
        startsAt: iso(2025, 11, 17, 0, 0),
        guestName: "A",
        guestEmail: "a@x.test",
      },
      { now },
    );
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.error.code).toBe("OUTSIDE_WINDOW");
  });

  it("возвращает OUTSIDE_WINDOW для слота, который уже начался", async () => {
    // now = 2025-11-03 14:00, слот 09:00 того же дня — в прошлом.
    const mt = mtByName("Stand-up");
    const out = await store.book(
      {
        meetingTypeId: mt.id,
        startsAt: iso(2025, 11, 3, 9, 0),
        guestName: "A",
        guestEmail: "a@x.test",
      },
      { now },
    );
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.error.code).toBe("OUTSIDE_WINDOW");
    expect(out.error.message).toMatch(/уже начался/i);
  });

  it("возвращает OUTSIDE_WORKING_HOURS для старта до 09:00", async () => {
    const mt = mtByName("Stand-up");
    const out = await store.book(
      {
        meetingTypeId: mt.id,
        startsAt: iso(2025, 11, 4, 8, 30),
        guestName: "A",
        guestEmail: "a@x.test",
      },
      { now },
    );
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.error.code).toBe("OUTSIDE_WORKING_HOURS");
  });

  it("возвращает OUTSIDE_WORKING_HOURS если длительность вылезает за конец", async () => {
    createOk("Long", 60);
    const long = mtByName("Long");
    const out = await store.book(
      {
        meetingTypeId: long.id,
        startsAt: iso(2025, 11, 3, 17, 30),
        guestName: "A",
        guestEmail: "a@x.test",
      },
      { now },
    );
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.error.code).toBe("OUTSIDE_WORKING_HOURS");
  });

  it("возвращает MISMATCH_STEP для не-выровненного времени", async () => {
    const mt = mtByName("Stand-up");
    const out = await store.book(
      {
        meetingTypeId: mt.id,
        startsAt: iso(2025, 11, 3, 15, 15),
        guestName: "A",
        guestEmail: "a@x.test",
      },
      { now },
    );
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.error.code).toBe("MISMATCH_STEP");
  });

  it("возвращает SLOT_TAKEN при частичном пересечении (14:30-15:30 против 15:00-15:30)", async () => {
    const mt = mtByName("Stand-up");
    await store.book(
      {
        meetingTypeId: mt.id,
        startsAt: iso(2025, 11, 3, 15, 0),
        guestName: "A",
        guestEmail: "a@x.test",
      },
      { now },
    );
    const mtLong = createOk("Long60", 60);
    const out = await store.book(
      {
        meetingTypeId: mtLong.id,
        startsAt: iso(2025, 11, 3, 14, 30),
        guestName: "B",
        guestEmail: "b@x.test",
      },
      { now },
    );
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.error.code).toBe("SLOT_TAKEN");
  });

  it("возвращает SLOT_TAKEN при пересечении у разных meeting type (cross-type)", async () => {
    const mtA = mtByName("Stand-up");
    await store.book(
      {
        meetingTypeId: mtA.id,
        startsAt: iso(2025, 11, 3, 16, 0),
        guestName: "A",
        guestEmail: "a@x.test",
      },
      { now },
    );
    const mtB = createOk("Other", 30);
    const out = await store.book(
      {
        meetingTypeId: mtB.id,
        startsAt: iso(2025, 11, 3, 16, 0),
        guestName: "B",
        guestEmail: "b@x.test",
      },
      { now },
    );
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.error.code).toBe("SLOT_TAKEN");
  });
});

describe("BookingStore concurrency", () => {
  it("два одновременных book() на один слот: один успех, второй SLOT_TAKEN", async () => {
    const mt = mtByName("Stand-up");
    const [a, b] = await Promise.all([
      store.book(
        {
          meetingTypeId: mt.id,
          startsAt: iso(2025, 11, 3, 16, 0),
          guestName: "A",
          guestEmail: "a@x.test",
        },
        { now },
      ),
      store.book(
        {
          meetingTypeId: mt.id,
          startsAt: iso(2025, 11, 3, 16, 0),
          guestName: "B",
          guestEmail: "b@x.test",
        },
        { now },
      ),
    ]);
    const outcomes = [a, b].map((o) => (o.ok ? "ok" : o.error.code));
    outcomes.sort();
    expect(outcomes).toEqual(["SLOT_TAKEN", "ok"]);
  });

  it("10 одновременных book() на один слот: ровно один успех", async () => {
    const mt = mtByName("Stand-up");
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        store.book(
          {
            meetingTypeId: mt.id,
            startsAt: iso(2025, 11, 3, 17, 0),
            guestName: `Guest${i}`,
            guestEmail: `g${i}@x.test`,
          },
          { now },
        ),
      ),
    );
    const okCount = results.filter((r) => r.ok).length;
    expect(okCount).toBe(1);
    const errorCodes = results
      .filter((r) => !r.ok)
      .map((r) => (r as { ok: false; error: { code: string } }).error.code);
    expect(errorCodes.every((c) => c === "SLOT_TAKEN")).toBe(true);
  });
});

describe("BookingStore.list", () => {
  it("возвращает только будущие записи, ASC по startsAt", async () => {
    const mt = mtByName("Stand-up");
    // Все три старта позже now = 2025-11-03 14:00 в Москве.
    await store.book(
      {
        meetingTypeId: mt.id,
        startsAt: iso(2025, 11, 3, 16, 0),
        guestName: "F1",
        guestEmail: "f1@x.test",
      },
      { now },
    );
    await store.book(
      {
        meetingTypeId: mt.id,
        startsAt: iso(2025, 11, 3, 15, 0),
        guestName: "F2",
        guestEmail: "f2@x.test",
      },
      { now },
    );
    await store.book(
      {
        meetingTypeId: mt.id,
        startsAt: iso(2025, 11, 5, 9, 0),
        guestName: "F3",
        guestEmail: "f3@x.test",
      },
      { now },
    );
    const list = await store.list(now);
    expect(list).toHaveLength(3);
    expect(list[0].startsAt).toBe(iso(2025, 11, 3, 15, 0));
    expect(list[1].startsAt).toBe(iso(2025, 11, 3, 16, 0));
    expect(list[2].startsAt).toBe(iso(2025, 11, 5, 9, 0));
  });

  it("не создаёт запись на слот, который уже начался (в списке её не будет)", async () => {
    // now = 2025-11-03 14:00. Слот 10:00 того же дня — в прошлом: запись на
    // него не создаётся, поэтому и в списке (только будущие) её не будет.
    const mt = mtByName("Stand-up");
    const past = await store.book(
      {
        meetingTypeId: mt.id,
        startsAt: iso(2025, 11, 3, 10, 0),
        guestName: "P",
        guestEmail: "p@x.test",
      },
      { now },
    );
    expect(past.ok).toBe(false);
    if (!past.ok) expect(past.error.code).toBe("OUTSIDE_WINDOW");

    await store.book(
      {
        meetingTypeId: mt.id,
        startsAt: iso(2025, 11, 3, 15, 0),
        guestName: "F",
        guestEmail: "f@x.test",
      },
      { now },
    );
    const list = await store.list(now);
    expect(list).toHaveLength(1);
    expect(list[0].guestName).toBe("F");
  });
});

describe("BookingStore.availability", () => {
  it("для нового типа возвращает слоты в окне, отбрасывая уже начавшиеся", async () => {
    const mt = mtByName("Stand-up");
    const out = await store.availability(mt.id, now);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.value.meetingTypeId).toBe(mt.id);
    expect(out.value.days).toHaveLength(14);
    // Первый день — 2025-11-03
    expect(out.value.days[0].date).toBe("2025-11-03");
    // now = 14:00: слоты 09:00..13:30 уже начались — их в сетке нет,
    // остаются 14:30..17:30 с шагом 30 (последний заканчивается в 18:00).
    expect(out.value.days[0].slots[0]).toBe(iso(2025, 11, 3, 14, 30));
    expect(out.value.days[0].slots).toHaveLength(7);
    expect(out.value.days[0].slots.at(-1)).toBe(iso(2025, 11, 3, 17, 30));
    // Будущие дни не тронуты: полный рабочий день, 18 слотов.
    expect(out.value.days[1].date).toBe("2025-11-04");
    expect(out.value.days[1].slots).toHaveLength(18);
    expect(out.value.days[1].slots[0]).toBe(iso(2025, 11, 4, 9, 0));
  });

  it("не отдаёт слоты, которые уже начались", async () => {
    const mt = mtByName("Stand-up");
    const out = await store.availability(mt.id, now);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const slotsDay0 = out.value.days[0].slots;
    expect(slotsDay0).not.toContain(iso(2025, 11, 3, 9, 0));
    expect(slotsDay0).not.toContain(iso(2025, 11, 3, 13, 30));
    expect(slotsDay0).not.toContain(iso(2025, 11, 3, 14, 0));
  });

  it("исключает слоты, занятые другим meeting-type", async () => {
    const mt = mtByName("Stand-up");
    await store.book(
      {
        meetingTypeId: mt.id,
        startsAt: iso(2025, 11, 3, 15, 0),
        guestName: "X",
        guestEmail: "x@x.test",
      },
      { now },
    );
    const mtB = createOk("B", 30);
    const out = await store.availability(mtB.id, now);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const slotsDay0 = out.value.days[0].slots;
    expect(slotsDay0).not.toContain(iso(2025, 11, 3, 15, 0));
    expect(slotsDay0).toContain(iso(2025, 11, 3, 14, 30));
    expect(slotsDay0).toContain(iso(2025, 11, 3, 15, 30));
  });

  it("MEETING_TYPE_NOT_FOUND для несуществующего типа", async () => {
    const out = await store.availability("00000000-0000-0000-0000-000000000000", now);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.error.code).toBe("MEETING_TYPE_NOT_FOUND");
  });
});
