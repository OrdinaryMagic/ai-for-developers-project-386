import { Type, type Static } from "@sinclair/typebox";
import type { FastifyPluginAsync } from "fastify";
import type { MeetingTypeStore } from "../store/meeting-type-store.js";
import { makeDomainError } from "../errors/domain-errors.js";

/**
 * JSON-схема ответа `MeetingType` — соответствует схеме `MeetingType` в
 * `openapi.yaml`. Используется Fastify-schema валидатором для сериализации
 * (через `fast-json-stringify`).
 */
const MeetingTypeDto = Type.Object({
  id: Type.String(),
  name: Type.String(),
  description: Type.String(),
  durationMinutes: Type.Integer({ minimum: 1, maximum: 1440 }),
});

/** Тело запроса `POST /meeting-types`. Соответствует `CreateMeetingTypeRequest` в спеке. */
const CreateMeetingTypeDto = Type.Object({
  name: Type.String({ minLength: 1, maxLength: 120 }),
  description: Type.String({ maxLength: 2000 }),
  durationMinutes: Type.Integer({ minimum: 1, maximum: 1440 }),
});

type CreateBody = Static<typeof CreateMeetingTypeDto>;

export const meetingTypesRoutes: FastifyPluginAsync<{ store: MeetingTypeStore }> = async (
  app,
  opts,
) => {
  const { store } = opts;

  app.post(
    "/meeting-types",
    {
      schema: {
        body: CreateMeetingTypeDto,
      },
    },
    async (req, reply) => {
      const body = req.body as CreateBody;
      const outcome = store.create(body);
      if (!outcome.ok) {
        reply.code(outcome.error.statusCode);
        return outcome.error;
      }
      return outcome.value;
    },
  );

  app.get("/meeting-types", async () => store.list());

  app.get<{ Params: { id: string } }>(
    "/meeting-types/:id",
    {
      schema: {
        response: { 200: MeetingTypeDto },
      },
    },
    async (req, reply) => {
      const mt = store.getById(req.params.id);
      if (!mt) {
        reply.code(404);
        return makeDomainError("MEETING_TYPE_NOT_FOUND", `Тип встречи ${req.params.id} не найден.`);
      }
      return mt;
    },
  );
};

export default meetingTypesRoutes;
