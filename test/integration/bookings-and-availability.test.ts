import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { DateTime } from "luxon";
import type { FastifyInstance } from "fastify";
import { buildApp, type Clock } from "../../src/app.js";
import type { OwnerConfig } from "../../src/config/owner.js";

const tz = "Europe/Moscow";
const sampleConfig: OwnerConfig = {
  owner: { name: "Owner", timezone: tz },
  windowDays: 14,
  slotStepMinutes: 30,
  workingDays: [1, 2, 3, 4, 5],
  workingHours: { start: "09:00", end: "18:00" },
};

const fixedClock: Clock = () => DateTime.fromISO("2025-11-03T14:00:00", { zone: tz });

let envBackup: NodeJS.ProcessEnv;
let serverToClose: FastifyInstance | null = null;

beforeEach(() => {
  envBackup = { ...process.env };
});

afterEach(async () => {
  process.env = { ...envBackup };
  if (serverToClose) {
    await serverToClose.close();
    serverToClose = null;
  }
});

async function makeApp(
  config: OwnerConfig = sampleConfig,
  clock: Clock = fixedClock,
): Promise<{ server: FastifyInstance; meetingTypeId: string }> {
  const server = await buildApp({ config, clock });
  serverToClose = server;
  const created = await server.inject({
    method: "POST",
    url: "/meeting-types",
    payload: { name: "Stand-up", description: "", durationMinutes: 30 },
  });
  return { server, meetingTypeId: created.json().id };
}

describe("POST /bookings", () => {
  it("создаёт запись на валидный слот", async () => {
    const { server, meetingTypeId } = await makeApp();
    const res = await server.inject({
      method: "POST",
      url: "/bookings",
      payload: {
        meetingTypeId,
        startsAt: "2025-11-03T15:00:00+03:00",
        guestName: "Иван",
        guestEmail: "ivan@example.test",
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({
      meetingTypeId,
      meetingTypeName: "Stand-up",
      guestName: "Иван",
      guestEmail: "ivan@example.test",
      startsAt: "2025-11-03T15:00:00+03:00",
      endsAt: "2025-11-03T15:30:00+03:00",
    });
    expect(body.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("возвращает 409 SLOT_TAKEN для уже занятого слота", async () => {
    const { server, meetingTypeId } = await makeApp();
    await server.inject({
      method: "POST",
      url: "/bookings",
      payload: {
        meetingTypeId,
        startsAt: "2025-11-03T15:00:00+03:00",
        guestName: "A",
        guestEmail: "a@x.test",
      },
    });
    const res = await server.inject({
      method: "POST",
      url: "/bookings",
      payload: {
        meetingTypeId,
        startsAt: "2025-11-03T15:00:00+03:00",
        guestName: "B",
        guestEmail: "b@x.test",
      },
    });
    expect(res.statusCode).toBe(409);
    const body = res.json();
    expect(body).toMatchObject({ code: "SLOT_TAKEN", statusCode: 409 });
  });

  it("возвращает MISMATCH_STEP для не-выровненного времени (422)", async () => {
    const { server, meetingTypeId } = await makeApp();
    const res = await server.inject({
      method: "POST",
      url: "/bookings",
      payload: {
        meetingTypeId,
        startsAt: "2025-11-03T15:15:00+03:00",
        guestName: "A",
        guestEmail: "a@x.test",
      },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe("MISMATCH_STEP");
  });

  it("возвращает OUTSIDE_WORKING_HOURS для слота до 09:00 (422)", async () => {
    const { server, meetingTypeId } = await makeApp();
    const res = await server.inject({
      method: "POST",
      url: "/bookings",
      payload: {
        meetingTypeId,
        startsAt: "2025-11-04T08:30:00+03:00",
        guestName: "A",
        guestEmail: "a@x.test",
      },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe("OUTSIDE_WORKING_HOURS");
  });

  it("возвращает OUTSIDE_WORKING_HOURS для прямой записи в нерабочий день (422)", async () => {
    const { server, meetingTypeId } = await makeApp();
    const res = await server.inject({
      method: "POST",
      url: "/bookings",
      payload: {
        meetingTypeId,
        startsAt: "2025-11-08T10:00:00+03:00",
        guestName: "Weekend",
        guestEmail: "weekend@x.test",
      },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json()).toMatchObject({ statusCode: 422, code: "OUTSIDE_WORKING_HOURS" });
  });

  it("разрешает субботу и воскресенье при пользовательском workingDays", async () => {
    const { server, meetingTypeId } = await makeApp({ ...sampleConfig, workingDays: [6, 7] });

    for (const startsAt of ["2025-11-08T10:00:00+03:00", "2025-11-09T10:00:00+03:00"]) {
      const res = await server.inject({
        method: "POST",
        url: "/bookings",
        payload: {
          meetingTypeId,
          startsAt,
          guestName: "Weekend",
          guestEmail: "weekend@x.test",
        },
      });
      expect(res.statusCode).toBe(200);
    }

    const weekday = await server.inject({
      method: "POST",
      url: "/bookings",
      payload: {
        meetingTypeId,
        startsAt: "2025-11-04T10:00:00+03:00",
        guestName: "Weekday",
        guestEmail: "weekday@x.test",
      },
    });
    expect(weekday.statusCode).toBe(422);
    expect(weekday.json().code).toBe("OUTSIDE_WORKING_HOURS");
  });

  it("определяет рабочий день в TZ владельца, а не в UTC", async () => {
    const timezone = "Pacific/Auckland";
    const config: OwnerConfig = {
      ...sampleConfig,
      owner: { name: "Owner", timezone },
    };
    const clock: Clock = () => DateTime.fromISO("2025-11-03T08:00:00", { zone: timezone });
    const { server, meetingTypeId } = await makeApp(config, clock);

    // UTC ещё воскресенье, но в Auckland уже понедельник 09:00 — рабочий слот.
    const monday = await server.inject({
      method: "POST",
      url: "/bookings",
      payload: {
        meetingTypeId,
        startsAt: "2025-11-02T20:00:00Z",
        guestName: "Monday",
        guestEmail: "monday@x.test",
      },
    });
    expect(monday.statusCode).toBe(200);
    expect(monday.json().startsAt).toBe("2025-11-03T09:00:00+13:00");

    // UTC ещё пятница, но в Auckland уже суббота 09:00 — нерабочий день.
    const saturday = await server.inject({
      method: "POST",
      url: "/bookings",
      payload: {
        meetingTypeId,
        startsAt: "2025-11-07T20:00:00Z",
        guestName: "Saturday",
        guestEmail: "saturday@x.test",
      },
    });
    expect(saturday.statusCode).toBe(422);
    expect(saturday.json().code).toBe("OUTSIDE_WORKING_HOURS");
  });

  it("возвращает OUTSIDE_WINDOW для слота до полуночи сегодня (422)", async () => {
    const { server, meetingTypeId } = await makeApp();
    const res = await server.inject({
      method: "POST",
      url: "/bookings",
      payload: {
        meetingTypeId,
        startsAt: "2025-11-02T10:00:00+03:00",
        guestName: "A",
        guestEmail: "a@x.test",
      },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe("OUTSIDE_WINDOW");
  });

  it("возвращает 404 MEETING_TYPE_NOT_FOUND для несуществующего id", async () => {
    const { server } = await makeApp();
    const res = await server.inject({
      method: "POST",
      url: "/bookings",
      payload: {
        meetingTypeId: "00000000-0000-0000-0000-000000000000",
        startsAt: "2025-11-03T15:00:00+03:00",
        guestName: "A",
        guestEmail: "a@x.test",
      },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe("MEETING_TYPE_NOT_FOUND");
  });

  it("быстрый двойной POST (Promise.all): один успех, один SLOT_TAKEN", async () => {
    const { server, meetingTypeId } = await makeApp();
    const [a, b] = await Promise.all([
      server.inject({
        method: "POST",
        url: "/bookings",
        payload: {
          meetingTypeId,
          startsAt: "2025-11-03T16:00:00+03:00",
          guestName: "A",
          guestEmail: "a@x.test",
        },
      }),
      server.inject({
        method: "POST",
        url: "/bookings",
        payload: {
          meetingTypeId,
          startsAt: "2025-11-03T16:00:00+03:00",
          guestName: "B",
          guestEmail: "b@x.test",
        },
      }),
    ]);
    const codes = [a.statusCode, b.statusCode].toSorted();
    expect(codes).toEqual([200, 409]);
  });

  it("отвергает слот, который уже начался (422 OUTSIDE_WINDOW)", async () => {
    // now = 2025-11-03 14:00 (fixedClock). Слот 09:00 того же дня — в прошлом:
    // записаться на него нельзя, иначе запись была бы не видна в списке
    // владельца (там только предстоящие).
    const { server, meetingTypeId } = await makeApp();
    const res = await server.inject({
      method: "POST",
      url: "/bookings",
      payload: {
        meetingTypeId,
        startsAt: "2025-11-03T09:00:00+03:00",
        guestName: "Past",
        guestEmail: "p@x.test",
      },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe("OUTSIDE_WINDOW");
  });

  it("отвергает не-email формат через Fastify-schema (400)", async () => {
    const { server, meetingTypeId } = await makeApp();
    const res = await server.inject({
      method: "POST",
      url: "/bookings",
      payload: {
        meetingTypeId,
        startsAt: "2025-11-04T09:00:00+03:00",
        guestName: "X",
        guestEmail: "не-email",
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it("отвергает битый ISO date-time через Fastify-schema (400)", async () => {
    const { server, meetingTypeId } = await makeApp();
    const res = await server.inject({
      method: "POST",
      url: "/bookings",
      payload: {
        meetingTypeId,
        startsAt: "hello",
        guestName: "X",
        guestEmail: "x@x.test",
      },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe("GET /bookings", () => {
  it("возвращает пустой массив, если нет записей", async () => {
    const { server } = await makeApp();
    const res = await server.inject({ method: "GET", url: "/bookings" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
  });

  it("возвращает список будущих записей, ASC по startsAt", async () => {
    const { server, meetingTypeId } = await makeApp();
    await server.inject({
      method: "POST",
      url: "/bookings",
      payload: {
        meetingTypeId,
        startsAt: "2025-11-03T16:00:00+03:00",
        guestName: "F1",
        guestEmail: "f1@x.test",
      },
    });
    await server.inject({
      method: "POST",
      url: "/bookings",
      payload: {
        meetingTypeId,
        startsAt: "2025-11-05T09:00:00+03:00",
        guestName: "F2",
        guestEmail: "f2@x.test",
      },
    });
    const res = await server.inject({ method: "GET", url: "/bookings" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveLength(2);
    expect(body[0].startsAt).toBe("2025-11-03T16:00:00+03:00");
    expect(body[1].startsAt).toBe("2025-11-05T09:00:00+03:00");
  });

  it("не показывает записи со стартом до now (owner list — предстоящие)", async () => {
    const { server, meetingTypeId } = await makeApp();
    // 09:00 сегодня при now=14:00 — это прошлое: запись не создаётся (422).
    const past = await server.inject({
      method: "POST",
      url: "/bookings",
      payload: {
        meetingTypeId,
        startsAt: "2025-11-03T09:00:00+03:00",
        guestName: "Past",
        guestEmail: "p@x.test",
      },
    });
    expect(past.statusCode).toBe(422);
    await server.inject({
      method: "POST",
      url: "/bookings",
      payload: {
        meetingTypeId,
        startsAt: "2025-11-03T16:00:00+03:00",
        guestName: "Future",
        guestEmail: "f@x.test",
      },
    });
    const res = await server.inject({ method: "GET", url: "/bookings" });
    const body = res.json();
    expect(body).toHaveLength(1);
    expect(body[0].guestName).toBe("Future");
  });
});

describe("GET /meeting-types/:id/availability", () => {
  it("возвращает 14-дневную сетку слотов без уже начавшихся", async () => {
    const { server, meetingTypeId } = await makeApp();
    const res = await server.inject({
      method: "GET",
      url: `/meeting-types/${meetingTypeId}/availability`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.meetingTypeId).toBe(meetingTypeId);
    expect(body.days).toHaveLength(14);
    expect(body.days[0].date).toBe("2025-11-03");
    // now = 14:00: сегодня отдаются только слоты 14:30..17:30.
    expect(body.days[0].slots[0]).toBe("2025-11-03T14:30:00+03:00");
    expect(body.days[0].slots.at(-1)).toBe("2025-11-03T17:30:00+03:00");
    expect(body.days[0].slots).toHaveLength(7);
    // Будущие дни — полный рабочий день.
    expect(body.days[1].slots).toHaveLength(18);
  });

  it("сохраняет 14 календарных дней, а нерабочие дни отдаёт с пустыми slots", async () => {
    const { server, meetingTypeId } = await makeApp();
    const res = await server.inject({
      method: "GET",
      url: `/meeting-types/${meetingTypeId}/availability`,
    });

    expect(res.statusCode).toBe(200);
    const days = res.json().days;
    expect(days.map((day: { date: string }) => day.date)).toEqual([
      "2025-11-03",
      "2025-11-04",
      "2025-11-05",
      "2025-11-06",
      "2025-11-07",
      "2025-11-08",
      "2025-11-09",
      "2025-11-10",
      "2025-11-11",
      "2025-11-12",
      "2025-11-13",
      "2025-11-14",
      "2025-11-15",
      "2025-11-16",
    ]);
    expect(days.find((day: { date: string }) => day.date === "2025-11-08").slots).toEqual([]);
    expect(days.find((day: { date: string }) => day.date === "2025-11-09").slots).toEqual([]);
    expect(days.find((day: { date: string }) => day.date === "2025-11-10").slots).not.toEqual([]);
  });

  it("с пользовательскими выходными отдаёт слоты в субботу и воскресенье, но не в будни", async () => {
    const { server, meetingTypeId } = await makeApp({ ...sampleConfig, workingDays: [6, 7] });
    const res = await server.inject({
      method: "GET",
      url: `/meeting-types/${meetingTypeId}/availability`,
    });

    expect(res.statusCode).toBe(200);
    const days = res.json().days;
    expect(days).toHaveLength(14);
    expect(days.find((day: { date: string }) => day.date === "2025-11-04").slots).toEqual([]);
    expect(days.find((day: { date: string }) => day.date === "2025-11-08").slots).toContain(
      "2025-11-08T09:00:00+03:00",
    );
    expect(days.find((day: { date: string }) => day.date === "2025-11-09").slots).toContain(
      "2025-11-09T09:00:00+03:00",
    );
  });

  it("исключает занятые слоты (cross-type тоже)", async () => {
    const { server, meetingTypeId } = await makeApp();
    const other = await server.inject({
      method: "POST",
      url: "/meeting-types",
      payload: { name: "Other", description: "", durationMinutes: 30 },
    });
    await server.inject({
      method: "POST",
      url: "/bookings",
      payload: {
        meetingTypeId,
        startsAt: "2025-11-03T15:00:00+03:00",
        guestName: "X",
        guestEmail: "x@x.test",
      },
    });
    const res = await server.inject({
      method: "GET",
      url: `/meeting-types/${other.json().id}/availability`,
    });
    const slotsDay0 = res.json().days[0].slots;
    expect(slotsDay0).not.toContain("2025-11-03T15:00:00+03:00");
    expect(slotsDay0).toContain("2025-11-03T14:30:00+03:00");
    expect(slotsDay0).toContain("2025-11-03T15:30:00+03:00");
  });

  it("404 MEETING_TYPE_NOT_FOUND для несуществующего типа", async () => {
    const { server } = await makeApp();
    const res = await server.inject({
      method: "GET",
      url: "/meeting-types/00000000-0000-0000-0000-000000000000/availability",
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe("MEETING_TYPE_NOT_FOUND");
  });
});

describe("Конфликт слотов разной длительности", () => {
  it("возвращает 409 SLOT_TAKEN при частичном наложении (60 мин 15:00 vs 30 мин 15:30)", async () => {
    const { server } = await makeApp();
    const long = await server.inject({
      method: "POST",
      url: "/meeting-types",
      payload: { name: "Long", description: "", durationMinutes: 60 },
    });
    expect(long.statusCode).toBe(200);
    const short = await server.inject({
      method: "POST",
      url: "/meeting-types",
      payload: { name: "Short", description: "", durationMinutes: 30 },
    });
    expect(short.statusCode).toBe(200);

    const longBook = await server.inject({
      method: "POST",
      url: "/bookings",
      payload: {
        meetingTypeId: long.json().id,
        startsAt: "2025-11-03T15:00:00+03:00",
        guestName: "LongGuest",
        guestEmail: "long@x.test",
      },
    });
    expect(longBook.statusCode).toBe(200);

    const partialOverlap = await server.inject({
      method: "POST",
      url: "/bookings",
      payload: {
        meetingTypeId: short.json().id,
        startsAt: "2025-11-03T15:30:00+03:00",
        guestName: "ShortGuest",
        guestEmail: "short@x.test",
      },
    });
    expect(partialOverlap.statusCode).toBe(409);
    expect(partialOverlap.json().code).toBe("SLOT_TAKEN");
  });

  it("встык (60 мин 15:00, 30 мин 16:00) разрешено — нет пересечения", async () => {
    const { server } = await makeApp();
    const long = await server.inject({
      method: "POST",
      url: "/meeting-types",
      payload: { name: "Long", description: "", durationMinutes: 60 },
    });
    const short = await server.inject({
      method: "POST",
      url: "/meeting-types",
      payload: { name: "Short", description: "", durationMinutes: 30 },
    });

    await server.inject({
      method: "POST",
      url: "/bookings",
      payload: {
        meetingTypeId: long.json().id,
        startsAt: "2025-11-03T15:00:00+03:00",
        guestName: "L",
        guestEmail: "l@x.test",
      },
    });

    const adjacentBook = await server.inject({
      method: "POST",
      url: "/bookings",
      payload: {
        meetingTypeId: short.json().id,
        startsAt: "2025-11-03T16:00:00+03:00",
        guestName: "Adj",
        guestEmail: "adj@x.test",
      },
    });
    expect(adjacentBook.statusCode).toBe(200);
  });
});
