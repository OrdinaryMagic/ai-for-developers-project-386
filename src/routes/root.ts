import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { wantsHtml } from "../static-ui.js";

/**
 * Корневой маршрут сервиса.
 *
 * Отдаёт приветствие API (`{"hello":"world"}` — часть OpenAPI-контракта) или,
 * если запрос пришёл из браузера (`Accept: text/html`), оболочку SPA: на одном
 * домене живут и API, и фронтенд, а корень приложения — это уже UI
 * (см. ADR-0006).
 */
export interface RootRoutesOptions {
  /**
   * Отдать оболочку SPA вместо JSON. Вызывается только для браузерной
   * навигации: API-клиенты (`fetch`, `curl`, smoke-скрипт) получают JSON.
   */
  shell?: (reply: FastifyReply) => Promise<unknown>;
}

const rootRoutes: FastifyPluginAsync<RootRoutesOptions> = async (app, opts) => {
  app.get("/", async (request: FastifyRequest, reply: FastifyReply) => {
    if (opts.shell && wantsHtml(request)) {
      return await opts.shell(reply);
    }
    return { hello: "world" };
  });
};

export default rootRoutes;
