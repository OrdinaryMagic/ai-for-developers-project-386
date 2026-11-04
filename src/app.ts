import Fastify, { type FastifyInstance } from "fastify";
import sensible from "@fastify/sensible";
import { DateTime } from "luxon";
import { loadOwnerConfig, type OwnerConfig } from "./config/owner.js";
import { MeetingTypeStore } from "./store/meeting-type-store.js";
import { BookingStore } from "./store/booking-store.js";
import rootRoutes from "./routes/root.js";
import healthRoutes from "./routes/health.js";
import apiRoutes from "./routes/api.js";
import { registerStaticUi, resolveStaticRoot } from "./static-ui.js";

/** Функция-часы, дающая «сейчас» в TZ владельца. Используется сторами и маршрутами. */
export type Clock = () => DateTime;

/**
 * Префикс-алиас API.
 *
 * Фронтенд ходит в backend по путям с префиксом `/api` (`/api/meeting-types`,
 * `/api/bookings`, …) — это конвенция dev-прокси Vite
 * (`web/vite.config.ts`: `/api/*` → Fastify без префикса). В production
 * фронтенд отдаётся тем же сервисом, что и API, и Vite-прокси там нет —
 * значит префикс снимает сам backend.
 *
 * Канонический контракт API при этом не меняется: `/meeting-types` остаётся
 * `/meeting-types` (его и описывает `spec/*.tsp`), а `/api/meeting-types` —
 * его алиас. Решение зафиксировано в ADR-0006.
 */
export const API_PREFIX = "/api";

/**
 * Опции приложения.
 * — `config` — если передан, используется как `OwnerConfig`; иначе читается из env.
 * — `clock` — функция «сейчас»; по умолчанию — `DateTime.now().setZone(tz)`.
 * — `logger: false` — отключает pino-лог (полезно в интеграционных тестах).
 */
export interface BuildAppOptions {
  config?: OwnerConfig;
  clock?: Clock;
  logger?: boolean;
  /**
   * Каталог со сборкой фронтенда (`web/dist`), который сервис отдаёт как
   * статику. `undefined` — авто-поиск `web/dist` рядом с корнем проекта;
   * `null` — статика выключена (например, в API-only тестах).
   */
  staticRoot?: string | null;
}

export async function buildApp(opts: BuildAppOptions = {}): Promise<FastifyInstance> {
  const config = opts.config ?? loadOwnerConfig();
  const meetingTypeStore = new MeetingTypeStore({ slotStepMinutes: config.slotStepMinutes });
  const bookingStore = new BookingStore(meetingTypeStore, config);

  const clock: Clock = opts.clock ?? (() => DateTime.now().setZone(config.owner.timezone));

  const app = Fastify({ logger: opts.logger ?? false });

  // Фронтенд отдаётся тем же сервисом, что и API: сначала статика (она же
  // ставит SPA-fallback на 404), потом API-маршруты.
  const staticRoot = resolveStaticRoot(opts.staticRoot);
  const shell = staticRoot === null ? undefined : (await registerStaticUi(app, staticRoot)).send;

  await app.register(sensible);
  await app.register(rootRoutes, { shell });
  await app.register(healthRoutes);

  // API смонтирован дважды: под канонические пути и под алиас `/api/*`
  // (см. `API_PREFIX`). Оба монтирования делят одни и те же сторы.
  const apiOptions = { config, meetingTypeStore, bookingStore, clock };
  await app.register(apiRoutes, apiOptions);
  await app.register(apiRoutes, { ...apiOptions, prefix: API_PREFIX });

  return app;
}
