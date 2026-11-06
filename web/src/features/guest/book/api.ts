import {
  bookingsCreate,
  type Booking,
  type CreateBookingRequest,
  type DomainError,
  type DomainErrorCode,
} from "@/api/sdk";
import {
  networkOutcome,
  translateCreateResult,
  type DomainOutcome,
  type NetworkOutcome,
} from "@/api/createOutcome";
import { isBooking } from "@/api/guards";

export type { Booking, CreateBookingRequest, DomainError, DomainErrorCode };

/** Результат создания бронирования для UI: успех, доменный отказ или сбой транспорта/контракта. */
export type CreateBookingOutcome =
  | { kind: "success"; booking: Booking }
  | DomainOutcome
  | NetworkOutcome;

/**
 * Переводит generated Orval result в UI outcome. HTTP runtime, URL и JSON
 * сериализация находятся только в `web/src/api/sdk.ts`.
 */
export async function createBooking(input: CreateBookingRequest): Promise<CreateBookingOutcome> {
  try {
    const result = await bookingsCreate(input);
    return translateCreateResult(result, {
      operation: "createBooking",
      isSuccessValue: isBooking,
      domainStatuses: [404, 409, 422],
      onSuccess: (booking) => ({ kind: "success", booking }),
    });
  } catch (cause) {
    return networkOutcome(cause);
  }
}
