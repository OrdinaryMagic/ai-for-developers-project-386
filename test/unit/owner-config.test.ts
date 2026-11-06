import { describe, it, expect } from "vitest";
import { loadOwnerConfig } from "../../src/config/owner.js";

const tz = "Europe/Moscow";

describe("loadOwnerConfig defaults", () => {
  it("возвращает согласованные с ТЗ дефолты", () => {
    const cfg = loadOwnerConfig({});
    expect(cfg).toEqual({
      owner: { name: "Demo Owner", timezone: tz },
      windowDays: 14,
      slotStepMinutes: 30,
      workingDays: [1, 2, 3, 4, 5],
      workingHours: { start: "09:00", end: "18:00" },
    });
  });
});

describe("loadOwnerConfig happy path", () => {
  it("читает значения из env", () => {
    const cfg = loadOwnerConfig({
      OWNER_NAME: "Иван Петров",
      OWNER_TIMEZONE: "Asia/Yekaterinburg",
      OWNER_WINDOW_DAYS: "7",
      OWNER_SLOT_STEP_MINUTES: "60",
      OWNER_WORKING_DAYS: "6,7",
      OWNER_WORKING_HOURS_START: "10:00",
      OWNER_WORKING_HOURS_END: "19:30",
    });
    expect(cfg).toEqual({
      owner: { name: "Иван Петров", timezone: "Asia/Yekaterinburg" },
      windowDays: 7,
      slotStepMinutes: 60,
      workingDays: [6, 7],
      workingHours: { start: "10:00", end: "19:30" },
    });
  });
});

describe("loadOwnerConfig validation", () => {
  it.each(["", "   ", "0", "8", "1,,2", ",1", "1,", "1,1", "1,2,2", "1.0", "01", "1 2", "Mon"])(
    "отклоняет OWNER_WORKING_DAYS=%j с понятной ошибкой",
    (raw) => {
      expect(() => loadOwnerConfig({ OWNER_WORKING_DAYS: raw })).toThrow(/OWNER_WORKING_DAYS/);
    },
  );

  it("бросает на некорректном TZ", () => {
    expect(() => loadOwnerConfig({ OWNER_TIMEZONE: "Mars/Olympus_Mons" })).toThrow();
  });

  it("бросает на некорректном HH:MM", () => {
    expect(() => loadOwnerConfig({ OWNER_WORKING_HOURS_END: "25:00" })).toThrow();
    expect(() => loadOwnerConfig({ OWNER_WORKING_HOURS_END: "18:60" })).toThrow();
    expect(() => loadOwnerConfig({ OWNER_WORKING_HOURS_START: "abc" })).toThrow();
  });

  it("принимает HH:MM и в однозначном формате (H:MM)", () => {
    const cfg = loadOwnerConfig({ OWNER_WORKING_HOURS_START: "9:00" });
    expect(cfg.workingHours.start).toBe("9:00");
  });

  it("бросает, когда end ≤ start", () => {
    expect(() =>
      loadOwnerConfig({ OWNER_WORKING_HOURS_START: "18:00", OWNER_WORKING_HOURS_END: "18:00" }),
    ).toThrow();
    expect(() =>
      loadOwnerConfig({ OWNER_WORKING_HOURS_START: "18:00", OWNER_WORKING_HOURS_END: "17:00" }),
    ).toThrow();
  });

  it("бросает на не-положительных или нечисловых числах", () => {
    expect(() => loadOwnerConfig({ OWNER_WINDOW_DAYS: "0" })).toThrow();
    expect(() => loadOwnerConfig({ OWNER_WINDOW_DAYS: "-1" })).toThrow();
    expect(() => loadOwnerConfig({ OWNER_WINDOW_DAYS: "14.5" })).toThrow();
    expect(() => loadOwnerConfig({ OWNER_SLOT_STEP_MINUTES: "abc" })).toThrow();
    expect(() => loadOwnerConfig({ OWNER_WINDOW_DAYS: "  " })).toThrow();
  });
});
