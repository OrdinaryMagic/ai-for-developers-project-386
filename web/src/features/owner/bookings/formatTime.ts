import { DateTime } from "luxon";

/**
 * Format an ISO 8601 datetime as a human-readable string in the given IANA
 * timezone. Both timezone-aware (`2026-12-01T09:00:00+03:00`) and naive
 * (`2026-12-01T09:00:00`) ISO strings are accepted; naive ones are
 * interpreted as wall-clock time in `tz`.
 *
 * Example output: `"01.12.2026 09:00 Europe/Moscow"`.
 */
export function formatDateTime(iso: string, tz: string): string {
  const dt = DateTime.fromISO(iso, { zone: tz });
  if (!dt.isValid) {
    return `${iso} ${tz}`;
  }
  return `${dt.toFormat("dd.LL.yyyy HH:mm")} ${tz}`;
}
