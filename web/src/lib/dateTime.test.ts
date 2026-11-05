import { describe, expect, it } from "vitest";

import {
  formatBookingSummary,
  formatBookingWindow,
  formatDateTime,
  formatDay,
  formatTime,
} from "@/lib/dateTime";

describe("dateTime formatter", () => {
  it("formats a date-only value in Russian without a UTC calendar shift", () => {
    expect(formatDay("2026-11-06", "America/New_York")).toBe("пт, 6 ноября 2026");
    expect(formatDay("2026-11-06", "Pacific/Kiritimati")).toBe("пт, 6 ноября 2026");
  });

  it("converts timestamps to the owner timezone for both date and time", () => {
    const startsAt = "2026-11-06T14:00:00+03:00";

    expect(formatTime(startsAt, "America/New_York")).toBe("06:00");
    expect(formatDateTime(startsAt, "America/New_York")).toBe("пятница, 6 ноября 2026, 06:00");
  });

  it("keeps Russian full dates correct at a year boundary", () => {
    expect(formatDateTime("2027-01-01T00:00:00+03:00", "Europe/Moscow")).toBe(
      "пятница, 1 января 2027, 00:00",
    );
  });

  it("shows the last available calendar day before the exclusive window end", () => {
    expect(
      formatBookingWindow(
        "2026-11-04T00:00:00+03:00",
        "2026-11-18T00:00:00+03:00",
        "Europe/Moscow",
      ),
    ).toBe("ср, 4 ноября 2026 — вт, 17 ноября 2026");
  });

  it("handles an exclusive window end at a month and year boundary", () => {
    expect(
      formatBookingWindow(
        "2026-12-30T00:00:00+03:00",
        "2027-01-01T00:00:00+03:00",
        "Europe/Moscow",
      ),
    ).toBe("ср, 30 декабря 2026 — чт, 31 декабря 2026");
  });

  it("formats one booking summary with type, full date, start and end", () => {
    expect(
      formatBookingSummary(
        "Консультация",
        "2026-11-06T14:00:00+03:00",
        "2026-11-06T14:30:00+03:00",
        "Europe/Moscow",
      ),
    ).toBe("Консультация · пятница, 6 ноября 2026 · 14:00–14:30");
  });
});
