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

async function makeApp(): Promise<{ server: FastifyInstance; meetingTypeId: string }> {
  const server = await buildApp({ config: sampleConfig, clock: fixedClock });
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
        startsAt: "2025-11-03T08:30:00+03:00",
        guestName: "A",
        guestEmail: "a@x.test",
      },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe("OUTSIDE_WORKING_HOURS");
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
});

describe("GET /meeting-types/:id/availability", () => {
  it("возвращает 14-дневную сетку слотов", async () => {
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
    expect(body.days[0].slots[0]).toBe("2025-11-03T09:00:00+03:00");
    expect(body.days[0].slots.at(-1)).toBe("2025-11-03T17:30:00+03:00");
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
        startsAt: "2025-11-03T12:00:00+03:00",
        guestName: "X",
        guestEmail: "x@x.test",
      },
    });
    const res = await server.inject({
      method: "GET",
      url: `/meeting-types/${other.json().id}/availability`,
    });
    const slotsDay0 = res.json().days[0].slots;
    expect(slotsDay0).not.toContain("2025-11-03T12:00:00+03:00");
    expect(slotsDay0).toContain("2025-11-03T11:30:00+03:00");
    expect(slotsDay0).toContain("2025-11-03T12:30:00+03:00");
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
