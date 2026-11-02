import Fastify, { type FastifyInstance } from "fastify";
import sensible from "@fastify/sensible";
import { DateTime } from "luxon";
import { loadOwnerConfig, type OwnerConfig } from "./config/owner.js";
import { MeetingTypeStore } from "./store/meeting-type-store.js";
import { BookingStore } from "./store/booking-store.js";
import rootRoutes from "./routes/root.js";
import healthRoutes from "./routes/health.js";
import configRoutes from "./routes/config.js";
import meetingTypesRoutes from "./routes/meeting-types.js";
import availabilityRoutes from "./routes/availability.js";
import bookingsRoutes from "./routes/bookings.js";

/** Функция-часы, дающая «сейчас» в TZ владельца. Используется сторами и маршрутами. */
export type Clock = () => DateTime;

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
}

export async function buildApp(opts: BuildAppOptions = {}): Promise<FastifyInstance> {
  const config = opts.config ?? loadOwnerConfig();
  const meetingTypeStore = new MeetingTypeStore(config.slotStepMinutes);
  const bookingStore = new BookingStore(meetingTypeStore, config);

  const clock: Clock = opts.clock ?? (() => DateTime.now().setZone(config.owner.timezone));

  const app = Fastify({ logger: opts.logger ?? false });

  await app.register(sensible);
  await app.register(rootRoutes);
  await app.register(healthRoutes);
  await app.register(configRoutes, { config });
  await app.register(meetingTypesRoutes, { store: meetingTypeStore });
  await app.register(availabilityRoutes, { store: bookingStore, clock });
  await app.register(bookingsRoutes, { store: bookingStore, clock });

  return app;
}
