import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/app.js";
import type { OwnerConfig } from "../../src/config/owner.js";

const tz = "Europe/Moscow";
const sampleConfig: OwnerConfig = {
  owner: { name: "Test Owner", timezone: tz },
  windowDays: 14,
  slotStepMinutes: 30,
  workingDays: [1, 2, 3, 4, 5],
  workingHours: { start: "09:00", end: "18:00" },
};

let envBackup: NodeJS.ProcessEnv;
let app: FastifyInstance | null = null;

beforeEach(() => {
  envBackup = { ...process.env };
});

afterEach(async () => {
  process.env = { ...envBackup };
  if (app) {
    await app.close();
    app = null;
  }
});

describe("GET /config", () => {
  it("отдаёт переданный конфиг как JSON, форма как в OpenAPI", async () => {
    app = await buildApp({ config: sampleConfig });
    const res = await app.inject({ method: "GET", url: "/config" });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toMatch(/application\/json/);
    expect(res.json()).toEqual(sampleConfig);
  });

  it("читает конфиг из process.env, если он не передан явно", async () => {
    process.env.OWNER_NAME = "Env Owner";
    process.env.OWNER_TIMEZONE = "Europe/Moscow";
    process.env.OWNER_WINDOW_DAYS = "21";
    process.env.OWNER_SLOT_STEP_MINUTES = "15";
    process.env.OWNER_WORKING_DAYS = "6,7";
    process.env.OWNER_WORKING_HOURS_START = "08:00";
    process.env.OWNER_WORKING_HOURS_END = "20:00";

    app = await buildApp();
    const res = await app.inject({ method: "GET", url: "/config" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      owner: { name: "Env Owner", timezone: "Europe/Moscow" },
      windowDays: 21,
      slotStepMinutes: 15,
      workingDays: [6, 7],
      workingHours: { start: "08:00", end: "20:00" },
    });
  });

  it("buildApp бросает, если process.env даёт невалидный TZ", async () => {
    process.env.OWNER_TIMEZONE = "Mars/Olympus_Mons";
    await expect(buildApp()).rejects.toThrow(/valid IANA timezone/);
  });

  it("buildApp бросает при старте на пустом OWNER_WORKING_DAYS", async () => {
    process.env.OWNER_WORKING_DAYS = "";
    await expect(buildApp()).rejects.toThrow(/OWNER_WORKING_DAYS/);
  });
});
