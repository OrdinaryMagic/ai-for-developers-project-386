import { DateTime } from "luxon";

/**
 * Format ISO 8601 datetime as a human-readable slot label в указанной IANA
 * timezone владельца (через `useOwnerTimezone`).
 *
 * Example output: `"Wed, 04 Nov 2026, 09:00 Europe/Moscow"`.
 *
 * Naive ISO (`2026-11-04T09:00:00` без offset) трактуется как wall-clock
 * в указанной TZ — это поведение Luxon по умолчанию и совпадает с тем,
 * как сервер хранит слоты в Booking-сцене (см. AGENTS.md / GLOSSARY.md:
 * `startsAt` зафиксирован в TZ владельца).
 */
export function formatSlot(iso: string, tz: string): string {
  const dt = DateTime.fromISO(iso, { zone: tz });
  if (!dt.isValid) {
    return `${iso} ${tz}`;
  }
  return `${dt.toFormat("EEE, dd LLL yyyy, HH:mm")} ${tz}`;
}
