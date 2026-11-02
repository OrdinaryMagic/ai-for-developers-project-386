import Fastify, { type FastifyInstance } from "fastify";
import sensible from "@fastify/sensible";
import rootRoutes from "./routes/root.js";
import healthRoutes from "./routes/health.js";

export async function buildApp(opts: Record<string, never> = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: true });

  await app.register(sensible);
  await app.register(rootRoutes, opts);
  await app.register(healthRoutes, opts);

  return app;
}
