import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/app.js";
import type { OwnerConfig } from "../../src/config/owner.js";

const sampleConfig: OwnerConfig = {
  owner: { name: "Test Owner", timezone: "Europe/Moscow" },
  windowDays: 14,
  slotStepMinutes: 30,
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

describe("POST /meeting-types", () => {
  it("создаёт тип встречи с валидным телом", async () => {
    app = await buildApp({ config: sampleConfig });
    const res = await app.inject({
      method: "POST",
      url: "/meeting-types",
      payload: { name: "Stand-up", description: "Daily stand-up", durationMinutes: 30 },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({
      name: "Stand-up",
      description: "Daily stand-up",
      durationMinutes: 30,
    });
    expect(body.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("отклоняет пустое имя через Fastify-schema (400)", async () => {
    app = await buildApp({ config: sampleConfig });
    const res = await app.inject({
      method: "POST",
      url: "/meeting-types",
      payload: { name: "", description: "x", durationMinutes: 30 },
    });
    expect(res.statusCode).toBe(400);
  });

  it("отклоняет durationMinutes за пределами 1..1440 (400)", async () => {
    app = await buildApp({ config: sampleConfig });
    const zero = await app.inject({
      method: "POST",
      url: "/meeting-types",
      payload: { name: "x", description: "x", durationMinutes: 0 },
    });
    expect(zero.statusCode).toBe(400);
    const tooLong = await app.inject({
      method: "POST",
      url: "/meeting-types",
      payload: { name: "x", description: "x", durationMinutes: 1441 },
    });
    expect(tooLong.statusCode).toBe(400);
  });

  it("принимает описание ровно 2000 символов (граница)", async () => {
    app = await buildApp({ config: sampleConfig });
    const description = "a".repeat(2000);
    const res = await app.inject({
      method: "POST",
      url: "/meeting-types",
      payload: { name: "x", description, durationMinutes: 30 },
    });
    expect(res.statusCode).toBe(200);
  });
});

describe("GET /meeting-types", () => {
  it("возвращает пустой массив, если ничего не создано", async () => {
    app = await buildApp({ config: sampleConfig });
    const res = await app.inject({ method: "GET", url: "/meeting-types" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
  });

  it("возвращает массив созданных типов в порядке вставки", async () => {
    app = await buildApp({ config: sampleConfig });
    await app.inject({
      method: "POST",
      url: "/meeting-types",
      payload: { name: "A", description: "", durationMinutes: 15 },
    });
    await app.inject({
      method: "POST",
      url: "/meeting-types",
      payload: { name: "B", description: "", durationMinutes: 30 },
    });
    const res = await app.inject({ method: "GET", url: "/meeting-types" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveLength(2);
    expect(body[0].name).toBe("A");
    expect(body[1].name).toBe("B");
  });
});

describe("GET /meeting-types/:id", () => {
  it("возвращает тип по существующему id", async () => {
    app = await buildApp({ config: sampleConfig });
    const created = await app.inject({
      method: "POST",
      url: "/meeting-types",
      payload: { name: "X", description: "desc", durationMinutes: 30 },
    });
    const id = created.json().id;
    const res = await app.inject({ method: "GET", url: `/meeting-types/${id}` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ id, name: "X", description: "desc", durationMinutes: 30 });
  });

  it("возвращает 404 + доменный код MEETING_TYPE_NOT_FOUND для отсутствующего id", async () => {
    app = await buildApp({ config: sampleConfig });
    const res = await app.inject({
      method: "GET",
      url: "/meeting-types/00000000-0000-0000-0000-000000000000",
    });
    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(body).toMatchObject({
      statusCode: 404,
      code: "MEETING_TYPE_NOT_FOUND",
    });
    expect(typeof body.message).toBe("string");
  });
});
