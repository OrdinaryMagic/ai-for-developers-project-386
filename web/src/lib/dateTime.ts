import { DateTime } from "luxon";

const RUSSIAN_LOCALE = "ru";
const DAY_FORMAT = "EEE, d MMMM yyyy";
const FULL_DATE_FORMAT = "EEEE, d MMMM yyyy";

function parse(value: string, timezone: string): DateTime {
  return DateTime.fromISO(value, { zone: timezone, locale: RUSSIAN_LOCALE });
}

/** Форматирует календарный день в TZ владельца без перевода date-only через UTC. */
export function formatDay(value: string, timezone: string): string {
  const date = parse(value, timezone);
  if (!date.isValid) return "Дата недоступна";
  return date.toFormat(DAY_FORMAT);
}

/** Форматирует время datetime в TZ владельца. */
export function formatTime(value: string, timezone: string): string {
  const date = parse(value, timezone);
  if (!date.isValid) return "—";
  return date.toFormat("HH:mm");
}

/** Форматирует datetime с полным русским днём недели и календарной датой. */
export function formatDateTime(value: string, timezone: string): string {
  const date = parse(value, timezone);
  if (!date.isValid) return "Дата недоступна";
  return date.toFormat(`${FULL_DATE_FORMAT}, HH:mm`);
}

/** Форматирует полуоткрытое окно: `windowEnd` в подпись не входит. */
export function formatBookingWindow(start: string, end: string, timezone: string): string {
  const first = parse(start, timezone);
  const exclusiveEnd = parse(end, timezone);
  if (!first.isValid || !exclusiveEnd.isValid) return "Период недоступен";

  const last = exclusiveEnd.minus({ milliseconds: 1 });
  return `${first.toFormat(DAY_FORMAT)} — ${last.toFormat(DAY_FORMAT)}`;
}

/** Форматирует общую для формы и подтверждения часть summary с датой и интервалом. */
export function formatBookingDateAndTime(
  startsAt: string,
  endsAt: string,
  timezone: string,
): string {
  const start = parse(startsAt, timezone);
  const end = parse(endsAt, timezone);
  if (!start.isValid || !end.isValid) return "Дата недоступна";

  return `${start.toFormat(FULL_DATE_FORMAT)} · ${start.toFormat("HH:mm")}–${end.toFormat("HH:mm")}`;
}

/** Форматирует выбранную бронь одной строкой: тип, полная дата и интервал. */
export function formatBookingSummary(
  meetingTypeName: string,
  startsAt: string,
  endsAt: string,
  timezone: string,
): string {
  return `${meetingTypeName} · ${formatBookingDateAndTime(startsAt, endsAt, timezone)}`;
}
