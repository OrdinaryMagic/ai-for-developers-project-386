import type { components } from "@/api/sdk";

/**
 * Re-exported SDK schema types. Anything we touch on the API boundary
 * must come from `web/src/api/sdk.ts` (см. AGENTS.md rule #11). Локальные
 * `interface Booking {...}` запрещены — следующая регенерация SDK всё
 * сотрёт.
 */
export type Booking = components["schemas"]["Booking"];
export type CreateBookingRequest = components["schemas"]["CreateBookingRequest"];
export type DomainError = components["schemas"]["DomainError"];
export type DomainErrorCode = components["schemas"]["DomainErrorCode"];

/**
 * Дискриминированный результат `POST /api/bookings`. Бэкенд возвращает
 * `Booking` при успехе (HTTP 200) и `DomainError` при 4xx; 5xx/сеть идут
 * в `kind: "network"`. UI решает по `kind`, какой текст показать —
 * `Booking` в success, баннер по `DomainError.code`, retry CTA для сети.
 */
export type CreateBookingOutcome =
  | { kind: "success"; booking: Booking }
  | { kind: "domain"; error: DomainError }
  | { kind: "network"; message: string };

const JSON_HEADERS = { "Content-Type": "application/json" };

async function parseJson<T>(res: Response, _label: string): Promise<T | null> {
  const text = await res.text();
  if (text.length === 0) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

/**
 * Создаёт бронирование через `POST /api/bookings`. Маппит HTTP-коды на
 * `CreateBookingOutcome`:
 *
 * - `200 OK` → `kind: "success"` (тело парсится как `Booking`);
 * - `409 / 422 / 404` → `kind: "domain"` (тело парсится как `DomainError`);
 * - `400` → `kind: "domain"` с кодом `MEETING_TYPE_NOT_FOUND` исключительно
 *   для `404`; остальные `400` от Fastify-schema идут в `network` с
 *   подсказкой field-level, потому что их контракт не совпадает с
 *   `DomainError` envelope;
 * - всё прочее + сетевой сбой → `kind: "network"`.
 */
export async function createBooking(input: CreateBookingRequest): Promise<CreateBookingOutcome> {
  try {
    const res = await fetch("/api/bookings", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(input),
    });
    if (res.ok) {
      const value = await parseJson<Booking>(res, "POST /bookings");
      if (value === null) {
        return { kind: "network", message: "POST /bookings: пустое тело ответа" };
      }
      return { kind: "success", booking: value };
    }
    if (res.status === 409 || res.status === 422 || res.status === 404) {
      const err = await parseJson<DomainError>(res, "POST /bookings");
      if (err !== null) {
        return { kind: "domain", error: err };
      }
      return {
        kind: "network",
        message: `POST /bookings: сервер ответил ${res.status}`,
      };
    }
    if (res.status === 400) {
      const text = await res.text();
      return {
        kind: "network",
        message: `Проверьте правильность заполнения полей: ${text.slice(0, 200)}`,
      };
    }
    return {
      kind: "network",
      message: `POST /bookings: сервер ответил ${res.status}`,
    };
  } catch (cause) {
    return {
      kind: "network",
      message: cause instanceof Error ? cause.message : String(cause),
    };
  }
}
