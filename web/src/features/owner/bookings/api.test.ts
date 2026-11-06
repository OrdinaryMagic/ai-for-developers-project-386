import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  bookingsList,
  configGetConfig,
  type bookingsListResponse,
  type configGetConfigResponse,
} from "@/api/sdk";
import { getConfiguration, listBookings } from "@/features/owner/bookings/api";

vi.mock("@/api/sdk", async (importOriginal) => ({
  ...(await importOriginal()),
  bookingsList: vi.fn(),
  configGetConfig: vi.fn(),
}));

const BOOKING = {
  id: "22222222-2222-4222-8222-222222222222",
  meetingTypeId: "11111111-1111-4111-8111-111111111111",
  meetingTypeName: "Консультация",
  guestName: "Иван Петров",
  guestEmail: "ivan@example.com",
  startsAt: "2026-11-04T09:00:00.000+03:00",
  endsAt: "2026-11-04T09:30:00.000+03:00",
};

const CONFIGURATION = {
  owner: { name: "Owner", timezone: "Europe/Moscow" },
  windowDays: 14,
  slotStepMinutes: 30,
  workingDays: [1, 2, 3, 4, 5],
  workingHours: { start: "09:00", end: "18:00" },
};

function listResult(status: number, data: unknown): bookingsListResponse {
  return { status, data, headers: new Headers() } as bookingsListResponse;
}

function configResult(status: number, data: unknown): configGetConfigResponse {
  return { status, data, headers: new Headers() } as configGetConfigResponse;
}

describe("owner read adapters", () => {
  beforeEach(() => {
    vi.mocked(bookingsList).mockReset();
    vi.mocked(configGetConfig).mockReset();
  });

  it("returns the generated upcoming booking list", async () => {
    vi.mocked(bookingsList).mockResolvedValue(listResult(200, [BOOKING]));

    await expect(listBookings()).resolves.toEqual([BOOKING]);
  });

  it("returns the generated owner configuration", async () => {
    vi.mocked(configGetConfig).mockResolvedValue(configResult(200, CONFIGURATION));

    await expect(getConfiguration()).resolves.toEqual(CONFIGURATION);
  });

  it.each([
    ["an empty booking list payload", listResult(200, {})],
    ["a failed booking list response", listResult(500, [])],
  ])("rejects %s", async (_label, result) => {
    vi.mocked(bookingsList).mockResolvedValue(result);

    await expect(listBookings()).rejects.toThrow();
  });

  it.each([
    ["an empty configuration payload", configResult(200, {})],
    [
      "configuration without workingDays",
      configResult(200, {
        owner: { name: "Owner", timezone: "Europe/Moscow" },
        windowDays: 14,
        slotStepMinutes: 30,
        workingHours: { start: "09:00", end: "18:00" },
      }),
    ],
    [
      "a DomainError instead of configuration",
      configResult(200, { statusCode: 404, code: "MEETING_TYPE_NOT_FOUND", message: "missing" }),
    ],
  ])("rejects %s", async (_label, result) => {
    vi.mocked(configGetConfig).mockResolvedValue(result);

    await expect(getConfiguration()).rejects.toThrow();
  });
});
