import { DateTime } from "luxon";

/**
 * Рабочие часы владельца в его TZ: начало и конец дня, выражены как `HH:MM`.
 * Минуты от полуночи — целые числа от 0 (включительно) до 1440 (исключительно).
 */
export interface WorkingHours {
  /** Минуты от полуночи для начала рабочего дня (>= 0). */
  startMin: number;
  /** Минуты от полуночи для конца рабочего дня (> `startMin`, <= 1440). */
  endMin: number;
}

/**
 * Парсит строку `HH:MM` в минуты от полуночи. Бросает, если формат некорректный.
 */
export function parseHHMM(s: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!m) throw new Error(`WorkingHours value "${s}" is not in HH:MM format`);
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isInteger(hh) || hh < 0 || hh > 24) {
    throw new Error(`WorkingHours hour out of range in "${s}"`);
  }
  if (!Number.isInteger(mm) || mm < 0 || mm > 59) {
    throw new Error(`WorkingHours minute out of range in "${s}"`);
  }
  if (hh === 24 && mm !== 0) {
    throw new Error(`WorkingHours "24:MM" is not a valid time`);
  }
  return hh * 60 + mm;
}

/**
 * Проверяет инвариант Step alignment (см. GLOSSARY.md): интервал
 * `[slot.start, slot.start + durationMinutes)`
 * целиком лежит внутри рабочего дня владельца в его TZ.
 *
 * Условие: `slot.start >= wh.start` И `slot.start + duration <= wh.end`.
 */
export function contains(slotStart: DateTime, durationMinutes: number, wh: WorkingHours): boolean {
  if (!Number.isInteger(durationMinutes) || durationMinutes <= 0) {
    throw new Error("durationMinutes must be a positive integer");
  }
  const startMin = slotStart.hour * 60 + slotStart.minute + slotStart.second / 60;
  const endMin = startMin + durationMinutes;
  return startMin >= wh.startMin && endMin <= wh.endMin;
}
