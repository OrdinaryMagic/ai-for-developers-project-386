import type { FastifyPluginAsync } from "fastify";
import type { BookingStore } from "../store/booking-store.js";
import type { Clock } from "../app.js";

/**
 * Эндпоинт `GET /meeting-types/:id/availability`:
 * — отдаёт 14-дневную сетку свободных слотов для конкретного типа встречи;
 * — если тип встречи не существует — `404 MEETING_TYPE_NOT_FOUND` через
 *   `DomainError` envelope.
 *
 * Реализация живёт в `BookingStore.availability` (см. шов 9); этот модуль
 * держит только маршрутизацию и перевод типов в JSON.
 */
export const availabilityRoutes: FastifyPluginAsync<{
  store: BookingStore;
  clock: Clock;
}> = async (app, opts) => {
  const { store, clock } = opts;

  app.get<{ Params: { id: string } }>("/meeting-types/:id/availability", async (req, reply) => {
    const result = await store.availability(req.params.id, clock());
    if (!result.ok) {
      reply.code(result.error.statusCode);
      return result.error;
    }
    return result.value;
  });
};

export default availabilityRoutes;
