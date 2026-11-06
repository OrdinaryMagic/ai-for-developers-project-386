import { afterEach, describe, expect, it, vi } from "vitest";

import {
  bookingsCreate,
  bookingsList,
  configGetConfig,
  meetingTypesAvailability,
  meetingTypesCreate,
  meetingTypesGetById,
  meetingTypesList,
  type Configuration,
} from "@/api/sdk";

const BOOKING = {
  id: "22222222-2222-4222-8222-222222222222",
  meetingTypeId: "11111111-1111-4111-8111-111111111111",
  meetingTypeName: "Консультация",
  guestName: "Иван Петров",
  guestEmail: "ivan@example.com",
  startsAt: "2026-11-04T09:00:00.000+03:00",
  endsAt: "2026-11-04T09:30:00.000+03:00",
};

const MEETING_TYPE = {
  id: BOOKING.meetingTypeId,
  name: BOOKING.meetingTypeName,
  description: "Знакомство",
  durationMinutes: 30,
};

const CONFIGURATION = {
  owner: { name: "Owner", timezone: "Europe/Moscow" },
  windowDays: 14,
  slotStepMinutes: 30,
  workingDays: [1, 2, 3, 4, 5],
  workingHours: { start: "09:00", end: "18:00" },
} satisfies Configuration;

const READ_OPERATIONS = [
  {
    name: "bookingsList",
    execute: () => bookingsList(),
    url: "/api/bookings",
    data: [BOOKING],
  },
  {
    name: "configGetConfig",
    execute: () => configGetConfig(),
    url: "/api/config",
    data: CONFIGURATION,
  },
  {
    name: "meetingTypesList",
    execute: () => meetingTypesList(),
    url: "/api/meeting-types",
    data: [MEETING_TYPE],
  },
  {
    name: "meetingTypesGetById",
    execute: () => meetingTypesGetById(MEETING_TYPE.id),
    url: `/api/meeting-types/${MEETING_TYPE.id}`,
    data: MEETING_TYPE,
  },
  {
    name: "meetingTypesAvailability",
    execute: () => meetingTypesAvailability(MEETING_TYPE.id),
    url: `/api/meeting-types/${MEETING_TYPE.id}/availability`,
    data: {
      meetingTypeId: MEETING_TYPE.id,
      windowStart: "2026-11-04",
      windowEnd: "2026-11-18",
      days: [],
    },
  },
];

describe("generated fetch SDK", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates a booking through the generated endpoint function", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(BOOKING), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const input = {
      meetingTypeId: BOOKING.meetingTypeId,
      startsAt: BOOKING.startsAt,
      guestName: BOOKING.guestName,
      guestEmail: BOOKING.guestEmail,
    };

    const result = await bookingsCreate(input);

    expect(result.status).toBe(200);
    expect(result.data).toEqual(BOOKING);
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/bookings",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      }),
    );
  });

  it("creates a meeting type through the generated endpoint function", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(MEETING_TYPE), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const input = {
      name: MEETING_TYPE.name,
      description: MEETING_TYPE.description,
      durationMinutes: MEETING_TYPE.durationMinutes,
    };

    const result = await meetingTypesCreate(input);

    expect(result.status).toBe(200);
    expect(result.data).toEqual(MEETING_TYPE);
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/meeting-types",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      }),
    );
  });

  it.each(READ_OPERATIONS)("generates $name with the /api base URL", async (operation) => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(operation.data), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const result = await operation.execute();

    expect(result.status).toBe(200);
    expect(result.data).toEqual(operation.data);
    expect(fetchSpy).toHaveBeenCalledWith(operation.url, { method: "GET" });
  });
});
