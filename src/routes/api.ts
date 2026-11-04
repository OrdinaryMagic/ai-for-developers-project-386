import type { FastifyPluginAsync } from "fastify";
import type { OwnerConfig } from "../config/owner.js";
import type { MeetingTypeStore } from "../store/meeting-type-store.js";
import type { BookingStore } from "../store/booking-store.js";
import type { Clock } from "../app.js";
import configRoutes from "./config.js";
import meetingTypesRoutes from "./meeting-types.js";
import availabilityRoutes from "./availability.js";
import bookingsRoutes from "./bookings.js";

/**
 * Собранный API-поверхности: конфиг, типы встреч, доступность, бронирования.
 *
 * Держим эти маршруты в одном плагине по конкретной причине: их нужно
 * замонтировать дважды — под канонический префикс (`/meeting-types`,
 * `/bookings`, …) и под алиас `/api/*` (см. `src/app.ts` и ADR-0006).
 * Канонический контракт OpenAPI задаётся спекой `spec/*.tsp`, а алиас —
 * конвенция фронтенда (`/api/*`), которую в dev срезает Vite-прокси, а в
 * production — сам backend.
 *
 * Состояние (сторы) передаётся опциями, а не создаётся внутри: оба монтирования
 * делят один и тот же стор — данные не расходятся между `/meeting-types` и
 * `/api/meeting-types`.
 */
export interface ApiRoutesOptions {
  config: OwnerConfig;
  meetingTypeStore: MeetingTypeStore;
  bookingStore: BookingStore;
  clock: Clock;
}

export const apiRoutes: FastifyPluginAsync<ApiRoutesOptions> = async (app, opts) => {
  await app.register(configRoutes, { config: opts.config });
  await app.register(meetingTypesRoutes, { store: opts.meetingTypeStore });
  await app.register(availabilityRoutes, { store: opts.bookingStore, clock: opts.clock });
  await app.register(bookingsRoutes, { store: opts.bookingStore, clock: opts.clock });
};

export default apiRoutes;
