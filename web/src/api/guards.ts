import { DomainErrorCode, type Booking, type DomainError, type MeetingType } from "@/api/sdk";

const BOOKING_STRING_FIELDS = [
  "id",
  "meetingTypeId",
  "meetingTypeName",
  "guestName",
  "guestEmail",
  "startsAt",
  "endsAt",
] as const;

const DOMAIN_ERROR_CODES = new Set<string>(Object.values(DomainErrorCode));

export function isMeetingType(value: unknown): value is MeetingType {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.name === "string" &&
    typeof candidate.description === "string" &&
    typeof candidate.durationMinutes === "number"
  );
}

export function isBooking(value: unknown): value is Booking {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return BOOKING_STRING_FIELDS.every((field) => typeof candidate[field] === "string");
}

export function isDomainError(value: unknown, status: number): value is DomainError {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    candidate.statusCode === status &&
    typeof candidate.code === "string" &&
    DOMAIN_ERROR_CODES.has(candidate.code) &&
    typeof candidate.message === "string"
  );
}
