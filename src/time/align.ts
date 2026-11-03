import { DateTime } from "luxon";

/**
 * Округляет {@link dt} вниз к ближайшему шагу сетки `stepMinutes` минут внутри суток
 * в TZ самого `dt`. Секунды и миллисекунды обнуляются.
 *
 * Используется для проверки и нормализации `slot.start` по правилу Step alignment
 * (см. GLOSSARY.md):
 * `slot.start` должен быть кратен `slotStepMinutes` от полуночи по TZ владельца.
 *
 * @throws Error если `stepMinutes` не положительное целое в диапазоне (0; 1440].
 */
export function toStep(dt: DateTime, stepMinutes: number): DateTime {
  if (!Number.isInteger(stepMinutes) || stepMinutes <= 0 || stepMinutes > 1440) {
    throw new Error("stepMinutes must be a positive integer in (0; 1440]");
  }
  const totalMin = dt.hour * 60 + dt.minute + dt.second / 60;
  const aligned = Math.floor(totalMin / stepMinutes) * stepMinutes;
  return dt.set({
    hour: Math.floor(aligned / 60),
    minute: aligned % 60,
    second: 0,
    millisecond: 0,
  });
}
