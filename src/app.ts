import Fastify, { type FastifyInstance } from "fastify";
import sensible from "@fastify/sensible";
import { loadOwnerConfig, type OwnerConfig } from "./config/owner.js";
import { MeetingTypeStore } from "./store/meeting-type-store.js";
import rootRoutes from "./routes/root.js";
import healthRoutes from "./routes/health.js";
import configRoutes from "./routes/config.js";
import meetingTypesRoutes from "./routes/meeting-types.js";

/**
 * Опции приложения. `config` — необязателен: если передан, используется как
 * `OwnerConfig`; иначе читается из `process.env` через {@link loadOwnerConfig}.
 *
 * `logger: false` отключает pino-лог Fastify (полезно в интеграционных тестах,
 * чтобы не засорять вывод vitest).
 */
export interface BuildAppOptions {
  config?: OwnerConfig;
  logger?: boolean;
}

export async function buildApp(opts: BuildAppOptions = {}): Promise<FastifyInstance> {
  const config = opts.config ?? loadOwnerConfig();
  const meetingTypeStore = new MeetingTypeStore(config.slotStepMinutes);

  const app = Fastify({ logger: opts.logger ?? false });

  await app.register(sensible);
  await app.register(rootRoutes);
  await app.register(healthRoutes);
  await app.register(configRoutes, { config });
  await app.register(meetingTypesRoutes, { store: meetingTypeStore });

  return app;
}
