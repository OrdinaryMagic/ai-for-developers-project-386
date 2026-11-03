import { DateTime } from "luxon";

/**
 * Границы катящегося окна бронирования в TZ владельца. Оба конца — `DateTime` с
 * `hour/minute/second/millisecond` = 0. `start` всегда — 00:00 текущего дня в TZ.
 *
 * Для `days = 14` окно включает сегодня и ещё 13 календарных дней вперёд (т.е.
 * 14 точек старта, не 14 интервалов).
 */
export interface Window {
  start: DateTime;
  end: DateTime;
}

/**
 * Вычисляет границы окна бронирования длиной `days` календарных дней,
 * стартующего с 00:00 дня, на который приходится `now` в TZ `tz`.
 *
 * Окно включает сегодняшнюю дату и ещё `days - 1` следующих. Например, для
 * `days = 14` и `now = 2025-11-03 14:32 Europe/Moscow` →
 *   `start = 2025-11-03 00:00 Europe/Moscow`,
 *   `end   = 2025-11-16 00:00 Europe/Moscow` (исключительно).
 */
export function boundsFor(now: DateTime, days: number, tz: string): Window {
  if (!Number.isInteger(days) || days <= 0 || days > 365) {
    throw new Error("days must be a positive integer in (0; 365]");
  }
  const startOfToday = now.setZone(tz).startOf("day");
  return {
    start: startOfToday,
    end: startOfToday.plus({ days }),
  };
}
