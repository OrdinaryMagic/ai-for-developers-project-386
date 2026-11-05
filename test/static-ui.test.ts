import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import type { OwnerConfig } from "../src/config/owner.js";

/**
 * Тесты раздачи собранного фронтенда тем же сервисом, что и API (ADR-0006).
 *
 * Фикстура — настоящая сборка «как в проде»: `index.html` (оболочка SPA) и
 * `assets/app.js` (хешированный ассет Vite). Проверяем три вещи:
 *
 * 1. Статика отдаётся и кэшируется как надо (ассет — immutable, оболочка —
 *    всегда свежая).
 * 2. Клиентский маршрут (`/admin/event-types`) отдаёт оболочку приложения, а
 *    не 404 — но только браузеру (`Accept: text/html`).
 * 3. Алиас `/api/*` эквивалентен каноническим путям, а не-API-404 остаётся
 *    JSON-ответом, а не оболочкой.
 */

const tz = "Europe/Moscow";
const sampleConfig: OwnerConfig = {
  owner: { name: "Test Owner", timezone: tz },
  windowDays: 14,
  slotStepMinutes: 30,
  workingDays: [1, 2, 3, 4, 5],
  workingHours: { start: "09:00", end: "18:00" },
};

const SHELL_HTML = `<!doctype html>
<html lang="en">
  <head><title>Booking</title></head>
  <body><div id="root"></div><script type="module" src="/assets/app.js"></script></body>
</html>
`;

let staticRoot: string;
let app: FastifyInstance | null = null;

beforeAll(() => {
  staticRoot = mkdtempSync(join(tmpdir(), "booking-static-"));
  mkdirSync(join(staticRoot, "assets"));
  writeFileSync(join(staticRoot, "index.html"), SHELL_HTML, "utf8");
  writeFileSync(join(staticRoot, "assets", "app.js"), "console.log('app');\n", "utf8");
});

afterAll(() => {
  rmSync(staticRoot, { recursive: true, force: true });
});

afterEach(async () => {
  if (app) {
    await app.close();
    app = null;
  }
});

const HTML_ACCEPT = { accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" };

describe("раздача статики", () => {
  it("отдаёт ассет с immutable-кэшем", async () => {
    app = await buildApp({ config: sampleConfig, staticRoot });

    const res = await app.inject({ method: "GET", url: "/assets/app.js" });

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toMatch(/javascript/);
    expect(res.headers["cache-control"]).toContain("immutable");
    expect(res.body).toContain("console.log");
  });

  it("отдаёт оболочку SPA на клиентский маршрут для браузера", async () => {
    app = await buildApp({ config: sampleConfig, staticRoot });

    const res = await app.inject({
      method: "GET",
      url: "/admin/event-types",
      headers: HTML_ACCEPT,
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/html/);
    expect(res.body).toContain('<div id="root">');
  });

  it("не отдаёт оболочку SPA API-клиенту без Accept: text/html", async () => {
    app = await buildApp({ config: sampleConfig, staticRoot });

    const res = await app.inject({ method: "GET", url: "/admin/event-types" });

    expect(res.statusCode).toBe(404);
    expect(res.headers["content-type"]).toMatch(/application\/json/);
    expect(res.json()).toMatchObject({ statusCode: 404 });
  });

  it("держит контракт GET / → { hello: world } для API-клиентов", async () => {
    app = await buildApp({ config: sampleConfig, staticRoot });

    const res = await app.inject({ method: "GET", url: "/" });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ hello: "world" });
  });

  it("отдаёт оболочку SPA на / для браузера", async () => {
    app = await buildApp({ config: sampleConfig, staticRoot });

    const res = await app.inject({ method: "GET", url: "/", headers: HTML_ACCEPT });

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/html/);
    expect(res.body).toContain('<div id="root">');
  });

  it("не кэширует оболочку (no-cache)", async () => {
    app = await buildApp({ config: sampleConfig, staticRoot });

    const res = await app.inject({
      method: "GET",
      url: "/admin/event-types",
      headers: HTML_ACCEPT,
    });

    expect(res.headers["cache-control"]).toBe("no-cache");
  });

  it("выключает статику при staticRoot: null", async () => {
    app = await buildApp({ config: sampleConfig, staticRoot: null });

    const res = await app.inject({
      method: "GET",
      url: "/admin/event-types",
      headers: HTML_ACCEPT,
    });

    expect(res.statusCode).toBe(404);
    expect(res.headers["content-type"]).toMatch(/application\/json/);
  });
});

describe("алиас /api/*", () => {
  it("отдаёт тот же ответ, что и канонический путь", async () => {
    app = await buildApp({ config: sampleConfig, staticRoot });

    const canonical = await app.inject({ method: "GET", url: "/config" });
    const alias = await app.inject({ method: "GET", url: "/api/config" });

    expect(alias.statusCode).toBe(200);
    expect(alias.json()).toEqual(canonical.json());
  });

  it("отдаёт типы встреч по алиасу", async () => {
    app = await buildApp({ config: sampleConfig, staticRoot });

    const res = await app.inject({ method: "GET", url: "/api/meeting-types" });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
  });

  it("делит состояние между каноническим путём и алиасом", async () => {
    app = await buildApp({ config: sampleConfig, staticRoot });

    const created = await app.inject({
      method: "POST",
      url: "/api/meeting-types",
      payload: { name: "Sync", description: "через алиас", durationMinutes: 30 },
    });
    expect(created.statusCode).toBe(200);

    const list = await app.inject({ method: "GET", url: "/meeting-types" });

    expect(list.json()).toHaveLength(1);
    expect(list.json()[0]).toMatchObject({ name: "Sync" });
  });

  it("не подменяет 404 под /api/* оболочкой SPA", async () => {
    app = await buildApp({ config: sampleConfig, staticRoot });

    const res = await app.inject({
      method: "GET",
      url: "/api/nope",
      headers: HTML_ACCEPT,
    });

    expect(res.statusCode).toBe(404);
    expect(res.headers["content-type"]).toMatch(/application\/json/);
    expect(res.json()).toMatchObject({ statusCode: 404 });
  });
});
