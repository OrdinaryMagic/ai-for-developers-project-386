import { describe, it, expect } from "vitest";
import { DateTime } from "luxon";
import { toStep } from "../../src/time/align.js";

const tz = "Europe/Moscow";
const at = (h: number, m: number, s = 0, ms = 0): DateTime =>
  DateTime.fromObject({ hour: h, minute: m, second: s, millisecond: ms }, { zone: tz });

describe("align.toStep", () => {
  it("округляет 30-минутную сетку вниз", () => {
    expect(toStep(at(9, 15), 30).toISO()).toBe(at(9, 0).toISO());
    expect(toStep(at(9, 30), 30).toISO()).toBe(at(9, 30).toISO());
    expect(toStep(at(9, 45), 30).toISO()).toBe(at(9, 30).toISO());
    expect(toStep(at(10, 0), 30).toISO()).toBe(at(10, 0).toISO());
    expect(toStep(at(9, 29, 59), 30).toISO()).toBe(at(9, 0).toISO());
  });

  it("округляет 15-минутную сетку вниз", () => {
    expect(toStep(at(9, 7), 15).toISO()).toBe(at(9, 0).toISO());
    expect(toStep(at(9, 14), 15).toISO()).toBe(at(9, 0).toISO());
    expect(toStep(at(9, 15), 15).toISO()).toBe(at(9, 15).toISO());
    expect(toStep(at(9, 16), 15).toISO()).toBe(at(9, 15).toISO());
  });

  it("обнуляет секунды и миллисекунды", () => {
    const dt = at(9, 13, 45, 123);
    expect(toStep(dt, 30).toISO()).toBe(at(9, 0).toISO());
  });

  it("идемпотентен на уже выровненном времени", () => {
    const a = toStep(at(9, 30), 30);
    expect(toStep(a, 30).toISO()).toBe(a.toISO());
  });

  it("бросает на некорректном шаге", () => {
    expect(() => toStep(at(9, 0), 0)).toThrow();
    expect(() => toStep(at(9, 0), -1)).toThrow();
    expect(() => toStep(at(9, 0), 1441)).toThrow();
    expect(() => toStep(at(9, 0), 7.5)).toThrow();
  });

  it("работает в любой момент суток", () => {
    expect(toStep(at(23, 59), 30).toISO()).toBe(at(23, 30).toISO());
    expect(toStep(at(0, 1), 30).toISO()).toBe(at(0, 0).toISO());
    expect(toStep(at(0, 30), 30).toISO()).toBe(at(0, 30).toISO());
  });
});
