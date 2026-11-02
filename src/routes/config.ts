import type { FastifyPluginAsync } from "fastify";
import type { OwnerConfig } from "../config/owner.js";

/**
 * Маршруты конфигурации владельца. На данный момент — один эндпоинт
 * `GET /config`, отдающий текущую {@link OwnerConfig} как объект, форма
 * которого соответствует схеме `Configuration` в `openapi.yaml`.
 *
 * Конфиг передаётся явно через опции плагина (а не читается из env
 * внутри маршрута) — это даёт детерминизм в интеграционных тестах:
 * `buildApp({ config: ... })` фиксирует состояние для одного прогона.
 */
export const configRoutes: FastifyPluginAsync<{ config: OwnerConfig }> = async (app, opts) => {
  app.get("/config", async () => opts.config);
};

export default configRoutes;
