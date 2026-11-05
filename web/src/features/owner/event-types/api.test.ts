import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  meetingTypesCreate,
  meetingTypesList,
  type DomainError,
  type MeetingType,
  type meetingTypesCreateResponse,
  type meetingTypesListResponse,
} from "@/api/sdk";
import { createMeetingType, listMeetingTypes } from "@/features/owner/event-types/api";

vi.mock("@/api/sdk", async (importOriginal) => ({
  ...(await importOriginal()),
  meetingTypesCreate: vi.fn(),
  meetingTypesList: vi.fn(),
}));

const MEETING_TYPE: MeetingType = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Консультация",
  description: "Знакомство",
  durationMinutes: 30,
};

const INPUT = {
  name: MEETING_TYPE.name,
  description: MEETING_TYPE.description,
  durationMinutes: MEETING_TYPE.durationMinutes,
};

const DOMAIN_ERROR: DomainError = {
  statusCode: 422,
  code: "INVALID_DURATION",
  message: "Длительность не кратна шагу",
};

function createResult(status: number, data: unknown): meetingTypesCreateResponse {
  return { status, data, headers: new Headers() } as meetingTypesCreateResponse;
}

function listResult(status: number, data: unknown): meetingTypesListResponse {
  return { status, data, headers: new Headers() } as meetingTypesListResponse;
}

describe("meeting type outcome adapters", () => {
  beforeEach(() => {
    vi.mocked(meetingTypesCreate).mockReset();
    vi.mocked(meetingTypesList).mockReset();
  });

  it("maps a 200 list to success", async () => {
    vi.mocked(meetingTypesList).mockResolvedValue(listResult(200, [MEETING_TYPE]));

    await expect(listMeetingTypes()).resolves.toEqual({
      kind: "success",
      value: [MEETING_TYPE],
    });
  });

  it.each([
    ["an HTTP failure", listResult(500, { message: "broken" })],
    ["an empty success payload", listResult(200, {})],
    ["a non-array success payload", listResult(200, MEETING_TYPE)],
  ])("maps %s to a list network outcome", async (_label, result) => {
    vi.mocked(meetingTypesList).mockResolvedValue(result);

    await expect(listMeetingTypes()).resolves.toMatchObject({ kind: "network" });
  });

  it("maps a valid 200 MeetingType to create success", async () => {
    vi.mocked(meetingTypesCreate).mockResolvedValue(createResult(200, MEETING_TYPE));

    await expect(createMeetingType(INPUT)).resolves.toEqual({
      kind: "success",
      value: MEETING_TYPE,
    });
    expect(meetingTypesCreate).toHaveBeenCalledWith(INPUT);
  });

  it("maps 422 DomainError to a domain outcome", async () => {
    vi.mocked(meetingTypesCreate).mockResolvedValue(createResult(422, DOMAIN_ERROR));

    await expect(createMeetingType(INPUT)).resolves.toEqual({
      kind: "domain",
      error: DOMAIN_ERROR,
    });
  });

  it.each([
    ["an unknown code", createResult(422, { ...DOMAIN_ERROR, code: "FST_ERR_VALIDATION" })],
    ["a mismatched statusCode", createResult(422, { ...DOMAIN_ERROR, statusCode: 409 })],
  ])("maps %s in a domain response to network", async (_label, result) => {
    vi.mocked(meetingTypesCreate).mockResolvedValue(result);

    await expect(createMeetingType(INPUT)).resolves.toMatchObject({ kind: "network" });
  });

  it.each([
    ["Fastify 400", createResult(400, { statusCode: 400, code: "FST_ERR_VALIDATION" })],
    ["an empty success payload", createResult(200, {})],
    ["a DomainError mislabelled as success", createResult(200, DOMAIN_ERROR)],
    ["an upstream failure", createResult(500, DOMAIN_ERROR)],
  ])("maps %s to a create network outcome", async (_label, result) => {
    vi.mocked(meetingTypesCreate).mockResolvedValue(result);

    await expect(createMeetingType(INPUT)).resolves.toMatchObject({ kind: "network" });
  });

  it("maps generated fetch and JSON parsing rejections to network", async () => {
    vi.mocked(meetingTypesCreate).mockRejectedValue(new SyntaxError("Invalid JSON"));

    await expect(createMeetingType(INPUT)).resolves.toEqual({
      kind: "network",
      message: "Invalid JSON",
    });
  });
});
