import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  meetingTypesAvailability,
  meetingTypesGetById,
  meetingTypesList,
  type meetingTypesAvailabilityResponse,
  type meetingTypesGetByIdResponse,
  type meetingTypesListResponse,
} from "@/api/sdk";
import { getAvailability, getMeetingType, listMeetingTypes } from "@/features/guest/api";

vi.mock("@/api/sdk", async (importOriginal) => ({
  ...(await importOriginal()),
  meetingTypesAvailability: vi.fn(),
  meetingTypesGetById: vi.fn(),
  meetingTypesList: vi.fn(),
}));

const MEETING_TYPE = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Консультация",
  description: "Знакомство",
  durationMinutes: 30,
};

const AVAILABILITY = {
  meetingTypeId: MEETING_TYPE.id,
  windowStart: "2026-11-04",
  windowEnd: "2026-11-18",
  days: [{ date: "2026-11-04", slots: ["2026-11-04T09:00:00.000+03:00"] }],
};

function listResult(status: number, data: unknown): meetingTypesListResponse {
  return { status, data, headers: new Headers() } as meetingTypesListResponse;
}

function availabilityResult(status: number, data: unknown): meetingTypesAvailabilityResponse {
  return { status, data, headers: new Headers() } as meetingTypesAvailabilityResponse;
}

function meetingTypeResult(status: number, data: unknown): meetingTypesGetByIdResponse {
  return { status, data, headers: new Headers() } as meetingTypesGetByIdResponse;
}

describe("guest read adapters", () => {
  beforeEach(() => {
    vi.mocked(meetingTypesList).mockReset();
    vi.mocked(meetingTypesGetById).mockReset();
    vi.mocked(meetingTypesAvailability).mockReset();
  });

  it("returns the generated meeting type list", async () => {
    vi.mocked(meetingTypesList).mockResolvedValue(listResult(200, [MEETING_TYPE]));

    await expect(listMeetingTypes()).resolves.toEqual([MEETING_TYPE]);
  });

  it("returns one generated meeting type for the booking summary", async () => {
    vi.mocked(meetingTypesGetById).mockResolvedValue(meetingTypeResult(200, MEETING_TYPE));

    await expect(getMeetingType(MEETING_TYPE.id)).resolves.toEqual(MEETING_TYPE);
    expect(meetingTypesGetById).toHaveBeenCalledWith(MEETING_TYPE.id);
  });

  it("returns availability only for a valid 200 response", async () => {
    vi.mocked(meetingTypesAvailability).mockResolvedValue(availabilityResult(200, AVAILABILITY));

    await expect(getAvailability(MEETING_TYPE.id)).resolves.toEqual(AVAILABILITY);
    expect(meetingTypesAvailability).toHaveBeenCalledWith(MEETING_TYPE.id);
  });

  it("rejects a 404 DomainError instead of returning it as Availability", async () => {
    vi.mocked(meetingTypesAvailability).mockResolvedValue(
      availabilityResult(404, {
        statusCode: 404,
        code: "MEETING_TYPE_NOT_FOUND",
        message: "missing",
      }),
    );

    await expect(getAvailability(MEETING_TYPE.id)).rejects.toThrow("404");
  });

  it.each([
    ["an empty list payload", listResult(200, {})],
    [
      "a DomainError mislabelled as a list",
      listResult(200, { statusCode: 409, code: "SLOT_TAKEN" }),
    ],
  ])("rejects %s", async (_label, result) => {
    vi.mocked(meetingTypesList).mockResolvedValue(result);

    await expect(listMeetingTypes()).rejects.toThrow();
  });

  it("rejects an empty availability payload", async () => {
    vi.mocked(meetingTypesAvailability).mockResolvedValue(availabilityResult(200, {}));

    await expect(getAvailability(MEETING_TYPE.id)).rejects.toThrow("невалидное");
  });
});
