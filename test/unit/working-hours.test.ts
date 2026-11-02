import { describe, it, expect } from "vitest";
import { DateTime } from "luxon";
import { contains, parseHHMM, type WorkingHours } from "../../src/time/working-hours.js";

const tz = "Europe/Moscow";
const at = (h: number, m: number): DateTime =>
  DateTime.fromObject({ hour: h, minute: m }, { zone: tz });
const standWH: WorkingHours = { startMin: parseHHMM("09:00"), endMin: parseHHMM("18:00") };

describe("parseHHMM", () => {
  it("разбирает корректные строки", () => {
    expect(parseHHMM("00:00")).toBe(0);
    expect(parseHHMM("09:00")).toBe(540);
    expect(parseHHMM("18:30")).toBe(1110);
    expect(parseHHMM("24:00")).toBe(1440);
  });

  it("бросает на некорректных строках", () => {
    expect(() => parseHHMM("9")).toThrow();
    expect(() => parseHHMM("09:60")).toThrow();
    expect(() => parseHHMM("24:01")).toThrow();
    expect(() => parseHHMM("25:00")).toThrow();
    expect(() => parseHHMM("")).toThrow();
  });
});

describe("working-hours.contains", () => {
  it("принимает слоты, целиком лежащие внутри рабочего дня", () => {
    expect(contains(at(9, 0), 30, standWH)).toBe(true);
    expect(contains(at(17, 30), 30, standWH)).toBe(true);
    expect(contains(at(10, 15), 60, standWH)).toBe(true);
  });

  it("отвергает слоты, которые вылезают за конец рабочего дня", () => {
    expect(contains(at(17, 31), 30, standWH)).toBe(false);
    expect(contains(at(17, 30), 31, standWH)).toBe(false);
    expect(contains(at(18, 0), 30, standWH)).toBe(false);
  });

  it("отвергает слоты, начинающиеся до начала рабочего дня", () => {
    expect(contains(at(8, 59), 30, standWH)).toBe(false);
    expect(contains(at(8, 30), 30, standWH)).toBe(false);
  });

  it("принимает слот, начинающийся ровно в начале рабочего дня", () => {
    expect(contains(at(9, 0), 30, standWH)).toBe(true);
  });

  it("отвергает нулевую и отрицательную длительность", () => {
    expect(() => contains(at(9, 0), 0, standWH)).toThrow();
    expect(() => contains(at(9, 0), -1, standWH)).toThrow();
  });
});
