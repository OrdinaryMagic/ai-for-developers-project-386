import { describe, expect, it } from "vitest";

import { networkOutcome, translateCreateResult } from "@/api/createOutcome";
import { isMeetingType } from "@/api/guards";
import { DomainErrorCode, type MeetingType, type meetingTypesCreateResponse } from "@/api/sdk";

const MEETING_TYPE = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Консультация",
  description: "Знакомство",
  durationMinutes: 30,
} satisfies MeetingType;

const DOMAIN_ERROR = {
  statusCode: 422,
  code: DomainErrorCode.INVALID_DURATION,
  message: "Длительность не кратна шагу",
};

function createResult(status: number, data: unknown): meetingTypesCreateResponse {
  return { status, data, headers: new Headers() } as meetingTypesCreateResponse;
}

function translate(result: meetingTypesCreateResponse) {
  return translateCreateResult(result, {
    operation: "createMeetingType",
    isSuccessValue: isMeetingType,
    domainStatuses: [422],
    onSuccess: (value) => ({ kind: "success" as const, value }),
  });
}

describe("generated create result translation", () => {
  it("passes a valid 200 payload to the operation-specific success mapping", () => {
    expect(translate(createResult(200, MEETING_TYPE))).toEqual({
      kind: "success",
      value: MEETING_TYPE,
    });
  });

  it("returns a domain outcome for an allowed status with a valid DomainError", () => {
    expect(translate(createResult(422, DOMAIN_ERROR))).toEqual({
      kind: "domain",
      error: DOMAIN_ERROR,
    });
  });

  it("rejects an invalid success payload as a network outcome", () => {
    expect(translate(createResult(200, {}))).toEqual({
      kind: "network",
      message: "createMeetingType: пустое или невалидное тело ответа",
    });
  });

  it("uses the field-level message for a 400 response and caps it at 200 characters", () => {
    const message = "x".repeat(250);

    expect(translate(createResult(400, { message }))).toEqual({
      kind: "network",
      message: `Проверьте правильность заполнения полей: ${"x".repeat(200)}`,
    });
  });

  it("uses the existing fallback when a 400 response has no message", () => {
    expect(translate(createResult(400, {}))).toEqual({
      kind: "network",
      message: "Проверьте правильность заполнения полей: неизвестный ответ сервера",
    });
  });

  it("keeps the operation name in an unexpected status outcome", () => {
    expect(translate(createResult(500, DOMAIN_ERROR))).toEqual({
      kind: "network",
      message: "createMeetingType: сервер ответил 500",
    });
  });

  it("normalizes Error and non-Error rejections without rethrowing them", () => {
    expect(networkOutcome(new SyntaxError("Invalid JSON"))).toEqual({
      kind: "network",
      message: "Invalid JSON",
    });
    expect(networkOutcome("offline")).toEqual({ kind: "network", message: "offline" });
  });
});
