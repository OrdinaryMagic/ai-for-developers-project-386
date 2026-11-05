import {
  bookingsCreate,
  DomainErrorCode,
  type Booking,
  type CreateBookingRequest,
  type DomainError,
} from "@/api/sdk";

export type { Booking, CreateBookingRequest, DomainError, DomainErrorCode };

/** Результат создания бронирования для UI: успех, доменный отказ или сбой транспорта/контракта. */
export type CreateBookingOutcome =
  | { kind: "success"; booking: Booking }
  | { kind: "domain"; error: DomainError }
  | { kind: "network"; message: string };

const BOOKING_STRING_FIELDS = [
  "id",
  "meetingTypeId",
  "meetingTypeName",
  "guestName",
  "guestEmail",
  "startsAt",
  "endsAt",
] as const;

function isBooking(value: unknown): value is Booking {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return BOOKING_STRING_FIELDS.every((field) => typeof candidate[field] === "string");
}

const DOMAIN_ERROR_CODES = new Set<string>(Object.values(DomainErrorCode));

function isDomainError(value: unknown, status: number): value is DomainError {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    candidate.statusCode === status &&
    typeof candidate.code === "string" &&
    DOMAIN_ERROR_CODES.has(candidate.code) &&
    typeof candidate.message === "string"
  );
}

function responseMessage(value: unknown): string {
  if (typeof value === "object" && value !== null && "message" in value) {
    const { message } = value;
    if (typeof message === "string") return message;
  }
  return "неизвестный ответ сервера";
}

/**
 * Переводит generated Orval result в UI outcome. HTTP runtime, URL и JSON
 * сериализация находятся только в `web/src/api/sdk.ts`.
 */
export async function createBooking(input: CreateBookingRequest): Promise<CreateBookingOutcome> {
  try {
    const result = await bookingsCreate(input);
    const status: number = result.status;
    const data: unknown = result.data;

    if (status === 200) {
      if (isBooking(data)) return { kind: "success", booking: data };
      return { kind: "network", message: "createBooking: пустое или невалидное тело ответа" };
    }

    if ((status === 404 || status === 409 || status === 422) && isDomainError(data, status)) {
      return { kind: "domain", error: data };
    }

    if (status === 400) {
      return {
        kind: "network",
        message: `Проверьте правильность заполнения полей: ${responseMessage(data).slice(0, 200)}`,
      };
    }

    return { kind: "network", message: `createBooking: сервер ответил ${status}` };
  } catch (cause) {
    return {
      kind: "network",
      message: cause instanceof Error ? cause.message : String(cause),
    };
  }
}
