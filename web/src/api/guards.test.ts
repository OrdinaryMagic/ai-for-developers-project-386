import { describe, expect, it } from "vitest";

import { isBooking, isDomainError, isMeetingType } from "@/api/guards";
import { DomainErrorCode, type Booking, type MeetingType } from "@/api/sdk";

const MEETING_TYPE = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Консультация",
  description: "Знакомство",
  durationMinutes: 30,
} satisfies MeetingType;

const BOOKING = {
  id: "22222222-2222-4222-8222-222222222222",
  meetingTypeId: MEETING_TYPE.id,
  meetingTypeName: MEETING_TYPE.name,
  guestName: "Иван Петров",
  guestEmail: "ivan@example.com",
  startsAt: "2026-11-04T09:00:00.000+03:00",
  endsAt: "2026-11-04T09:30:00.000+03:00",
} satisfies Booking;

describe("shared SDK payload guards", () => {
  it("accepts complete generated MeetingType and Booking payloads", () => {
    expect(isMeetingType(MEETING_TYPE)).toBe(true);
    expect(isBooking(BOOKING)).toBe(true);
  });

  it.each([
    ["null", null],
    ["an empty payload", {}],
    ["a missing name", { ...MEETING_TYPE, name: undefined }],
    ["a non-numeric duration", { ...MEETING_TYPE, durationMinutes: "30" }],
  ])("rejects %s as MeetingType", (_label, value) => {
    expect(isMeetingType(value)).toBe(false);
  });

  it.each([
    ["an empty payload", {}],
    ["a missing guest email", { ...BOOKING, guestEmail: undefined }],
    ["a non-string start", { ...BOOKING, startsAt: 1_793_776_800_000 }],
  ])("rejects %s as Booking", (_label, value) => {
    expect(isBooking(value)).toBe(false);
  });

  it("accepts a generated DomainError only when its statusCode matches the result", () => {
    const error = {
      statusCode: 409,
      code: DomainErrorCode.SLOT_TAKEN,
      message: "Слот уже занят",
    };

    expect(isDomainError(error, 409)).toBe(true);
    expect(isDomainError(error, 422)).toBe(false);
  });

  it.each([
    ["an unknown code", { statusCode: 409, code: "FST_ERR_VALIDATION", message: "bad" }],
    ["a missing message", { statusCode: 409, code: DomainErrorCode.SLOT_TAKEN }],
    ["null", null],
  ])("rejects %s as DomainError", (_label, value) => {
    expect(isDomainError(value, 409)).toBe(false);
  });
});
