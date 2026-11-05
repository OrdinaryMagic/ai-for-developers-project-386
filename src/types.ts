/**
 * Доменные типы, зеркально повторяющие схемы из `openapi.yaml` (`spec/models/*.tsp`).
 * Источник истины для runtime-кода — сгенерированный OpenAPI; эти интерфейсы
 * должны оставаться с ним согласованными вручную (проверяется через contract-тесты).
 */

/**
 * Категория, которую владелец делает доступной для бронирования.
 * Соответствует `MeetingType` в `openapi.yaml`.
 */
export interface MeetingType {
  /** UUID v4 идентификатор, выдаётся сервером. */
  id: string;
  /** Название, отображается в UI. */
  name: string;
  /** Описание встречи. */
  description: string;
  /** Длительность встречи в минутах (положительное целое ≤1440). */
  durationMinutes: number;
}

/**
 * Подтверждённое гостем бронирование слота.
 * Соответствует `Booking` в `openapi.yaml`.
 */
export interface Booking {
  id: string;
  meetingTypeId: string;
  /** Снимок имени типа встречи на момент бронирования. */
  meetingTypeName: string;
  guestName: string;
  guestEmail: string;
  /** ISO 8601 datetime в TZ владельца. */
  startsAt: string;
  /** ISO 8601 datetime в TZ владельца. */
  endsAt: string;
}

/** День в окне с его свободными слотами. */
export interface AvailabilityDay {
  /** Дата в формате ISO 8601 по TZ владельца (YYYY-MM-DD). */
  date: string;
  /** Доступные старты в этом дне (ISO 8601 datetime). */
  slots: string[];
}

/** Ответ с 14-дневной сеткой свободных слотов для типа встречи. */
export interface Availability {
  meetingTypeId: string;
  /** Начало окна (ISO 8601 в TZ владельца). */
  windowStart: string;
  /** Конец окна исключительно: полночь первого дня за его пределами (ISO 8601 в TZ владельца). */
  windowEnd: string;
  days: AvailabilityDay[];
}
