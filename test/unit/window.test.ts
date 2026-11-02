import { describe, it, expect } from "vitest";
import { DateTime } from "luxon";
import { boundsFor } from "../../src/time/window.js";

const tz = "Europe/Moscow";

describe("window.boundsFor", () => {
  it("выдаёт границы 14-дневного окна от сегодня в TZ владельца", () => {
    const now = DateTime.fromISO("2025-11-03T14:32:00", { zone: tz });
    const w = boundsFor(now, 14, tz);
    expect(w.start.toISO()).toBe("2025-11-03T00:00:00.000+03:00");
    expect(w.end.toISO()).toBe("2025-11-17T00:00:00.000+03:00");
  });

  it("обнуляет время на границах", () => {
    const w = boundsFor(DateTime.fromISO("2025-11-03T23:59:59", { zone: tz }), 14, tz);
    expect(w.start.hour).toBe(0);
    expect(w.start.minute).toBe(0);
    expect(w.start.second).toBe(0);
    expect(w.end.hour).toBe(0);
    expect(w.end.minute).toBe(0);
    expect(w.end.second).toBe(0);
  });

  it("учитывает TZ: «сейчас» в UTC после полуночи в Москве даёт начало следующего дня в Москве", () => {
    const nowUtc = DateTime.fromISO("2025-11-03T22:00:00", { zone: "UTC" });
    const w = boundsFor(nowUtc, 14, tz);
    expect(w.start.toISO()).toBe("2025-11-04T00:00:00.000+03:00");
  });

  it("бросает на некорректной длительности окна", () => {
    const now = DateTime.fromISO("2025-11-03T14:32:00", { zone: tz });
    expect(() => boundsFor(now, 0, tz)).toThrow();
    expect(() => boundsFor(now, -1, tz)).toThrow();
    expect(() => boundsFor(now, 366, tz)).toThrow();
    expect(() => boundsFor(now, 14.5, tz)).toThrow();
  });
});
