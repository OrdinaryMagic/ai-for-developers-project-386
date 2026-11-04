import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import fastifyStatic from "@fastify/static";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

/**
 * Раздача собранного фронтенда (SPA) тем же сервисом, что и API.
 *
 * Зачем: production-размещение — один домен (`*.up.railway.app`), и фронтенд
 * должен открываться на нём же. Отдельный статический деплой заставил бы
 * фронтенд ходить в API на другой origin (CORS, отдельный домен, отдельный
 * деплой) — вместо этого тот же сервис отдаёт собранный `web/dist` и
 * API-маршруты. Решение зафиксировано в ADR-0006.
 *
 * Три правила, на которых держится раскладка:
 *
 * 1. **API-пути остаются API-путями.** Канонические маршруты (`/config`,
 *    `/meeting-types`, `/bookings`, …) не меняются: специфичный маршрут
 *    Fastify всегда выигрывает у wildcard'а статики.
 * 2. **Фронтенд ходит в API через префикс `/api`.** В dev его ставит Vite-proxy
 *    (`/api/*` → backend без префикса), в production — тот же алиас внутри
 *    backend'а (см. `src/app.ts`). Поэтому клиентский код не знает, где
 *    именно живёт API.
 * 3. **Клиентский маршрут отдаёт оболочку приложения.** `/admin/event-types`
 *    и `/book/:id` существуют только в браузере: сервер отдаёт для них
 *    `index.html` (SPA-fallback), а не 404.
 */

/**
 * Каталог со сборкой фронтенда по умолчанию — `web/dist` рядом с корнем
 * проекта (в контейнере это `/app/web/dist`, см. `Dockerfile`).
 */
export function defaultStaticRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "../web/dist");
}

/**
 * Каталог статики, который реально можно отдавать: `null`, если сборки нет
 * (dev без `npm --prefix web run build`, тесты API-only).
 *
 * Путь приводится к абсолютному — `@fastify/static` требует именно такого.
 */
export function resolveStaticRoot(root?: string | null): string | null {
  const candidate = root === undefined ? defaultStaticRoot() : root;
  if (candidate === null) return null;
  const absolute = resolve(candidate);
  return existsSync(absolute) ? absolute : null;
}

/**
 * Просит ли клиент HTML? Браузерная навигация шлёт `Accept: text/html`,
 * API-клиенты (`fetch`, `curl`, smoke-скрипт) — без заголовка `Accept` или
 * с `application/json`.
 *
 * Это различение позволяет отдать UI человеку и JSON программе на одном
 * маршруте `/`: контракт `GET /` → `{"hello":"world"}` остаётся в силе для
 * API-клиентов, а браузер получает оболочку приложения.
 */
export function wantsHtml(request: FastifyRequest): boolean {
  return (request.headers.accept ?? "").includes("text/html");
}

/**
 * Ответчик, отдающий оболочку SPA (`index.html`).
 *
 * Оболочка читается один раз при старте: она меняется только вместе с новым
 * деплоем, перечитывать её на каждый запрос незачем.
 */
export interface ShellSender {
  /** HTML оболочки приложения. */
  readonly html: string;
  /** Отправить оболочку в ответ. */
  send: (reply: FastifyReply) => Promise<unknown>;
}

/**
 * Включить раздачу статики и SPA-fallback.
 *
 * Вызывается из `buildApp` — на корневом экземпляре Fastify: `setNotFoundHandler`
 * внутри зарегистрированного плагина действовал бы только в его контексте,
 * а нам нужен обработчик 404 на весь сервис.
 */
export async function registerStaticUi(app: FastifyInstance, root: string): Promise<ShellSender> {
  const shellHtml = readFileSync(resolve(root, "index.html"), "utf8");

  await app.register(fastifyStatic, {
    root,
    // `index.html` отдаём самим (см. `send`): ему нужен `no-cache`,
    // а @fastify/static не различает «index» и «оболочку приложения».
    index: false,
    // Ассеты Vite хэшированы по содержимому — их можно кэшировать надолго.
    maxAge: "1y",
    immutable: true,
  });

  // @fastify/static перебивает `cache-control` своим заголовком, поэтому
  // правило «HTML — всегда свежий» задаём сами, уже после его ответа.
  app.addHook("onSend", async (_request, reply, payload) => {
    const contentType = reply.getHeader("content-type");
    if (typeof contentType === "string" && contentType.includes("text/html")) {
      reply.header("cache-control", "no-cache");
    }
    return payload;
  });

  app.setNotFoundHandler(async (request, reply) => {
    const isApiPath = request.url === "/api" || request.url.startsWith("/api/");
    if (
      !isApiPath &&
      (request.method === "GET" || request.method === "HEAD") &&
      wantsHtml(request)
    ) {
      // Клиентский маршрут SPA: отдаём оболочку приложения.
      return send(reply);
    }
    // Обычный 404 в JSON-виде, как у Fastify по умолчанию.
    return reply.code(404).send({
      message: `Route ${request.method}:${request.url} not found`,
      error: "Not Found",
      statusCode: 404,
    });
  });

  async function send(reply: FastifyReply): Promise<unknown> {
    return reply
      .type("text/html; charset=utf-8")
      .header("cache-control", "no-cache")
      .send(shellHtml);
  }

  return { html: shellHtml, send };
}
