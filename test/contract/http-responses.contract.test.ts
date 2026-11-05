import { afterEach, describe, expect, it } from "vitest";
import { DateTime } from "luxon";
import type { FastifyInstance } from "fastify";
import { buildApp, type Clock } from "../../src/app.js";
import type { OwnerConfig } from "../../src/config/owner.js";
import { loadOpenApi, type OpenApiSchema } from "./load-openapi.js";

const apiDoc = loadOpenApi();
const timezone = "Europe/Moscow";
const config: OwnerConfig = {
  owner: { name: "Owner", timezone },
  windowDays: 14,
  slotStepMinutes: 30,
  workingDays: [1, 2, 3, 4, 5],
  workingHours: { start: "09:00", end: "18:00" },
};
const clock: Clock = () => DateTime.fromISO("2025-11-03T14:00:00", { zone: timezone });

let app: FastifyInstance | null = null;

afterEach(async () => {
  await app?.close();
  app = null;
});

function expectDocumentedJsonSchema(
  path: string,
  method: "get" | "post",
  statusCode: number,
  schemaName: string,
): void {
  const schema =
    apiDoc.paths[path]?.[method]?.responses[String(statusCode)]?.content?.["application/json"]
      ?.schema;
  expect(schema).toEqual({ $ref: `#/components/schemas/${schemaName}` });
}

function documentedJsonSchema(
  path: string,
  method: "get" | "post",
  statusCode: number,
): OpenApiSchema | undefined {
  return apiDoc.paths[path]?.[method]?.responses[String(statusCode)]?.content?.["application/json"]
    ?.schema;
}

describe("contract seam: HTTP responses ↔ openapi.yaml", () => {
  it("POST /bookings разделяет Booking и доменные отказы по реальным HTTP-статусам", async () => {
    app = await buildApp({ config, clock });
    const created = await app.inject({
      method: "POST",
      url: "/meeting-types",
      payload: { name: "Stand-up", description: "", durationMinutes: 30 },
    });
    const meetingTypeId = created.json().id;
    const payload = {
      meetingTypeId,
      startsAt: "2025-11-03T15:00:00+03:00",
      guestName: "Guest",
      guestEmail: "guest@example.test",
    };

    const success = await app.inject({ method: "POST", url: "/bookings", payload });
    expect(success.statusCode).toBe(200);
    expectDocumentedJsonSchema("/bookings", "post", success.statusCode, "Booking");

    const conflict = await app.inject({ method: "POST", url: "/bookings", payload });
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json()).toMatchObject({ statusCode: 409, code: "SLOT_TAKEN" });
    expectDocumentedJsonSchema("/bookings", "post", conflict.statusCode, "DomainError");

    const notFound = await app.inject({
      method: "POST",
      url: "/bookings",
      payload: { ...payload, meetingTypeId: "00000000-0000-0000-0000-000000000000" },
    });
    expect(notFound.statusCode).toBe(404);
    expect(notFound.json()).toMatchObject({
      statusCode: 404,
      code: "MEETING_TYPE_NOT_FOUND",
    });
    expectDocumentedJsonSchema("/bookings", "post", notFound.statusCode, "DomainError");

    const unprocessable = await app.inject({
      method: "POST",
      url: "/bookings",
      payload: { ...payload, startsAt: "2025-11-03T15:15:00+03:00" },
    });
    expect(unprocessable.statusCode).toBe(422);
    expect(unprocessable.json()).toMatchObject({ statusCode: 422, code: "MISMATCH_STEP" });
    expectDocumentedJsonSchema("/bookings", "post", unprocessable.statusCode, "DomainError");

    const badRequest = await app.inject({
      method: "POST",
      url: "/bookings",
      payload: { ...payload, guestName: "" },
    });
    expect(badRequest.statusCode).toBe(400);
    expect(badRequest.json()).toMatchObject({ statusCode: 400, code: "FST_ERR_VALIDATION" });
    expect(documentedJsonSchema("/bookings", "post", badRequest.statusCode)?.$ref).not.toBe(
      "#/components/schemas/DomainError",
    );
  });

  it("POST /meeting-types отделяет доменную 422 от Fastify schema validation 400", async () => {
    app = await buildApp({ config, clock });

    const success = await app.inject({
      method: "POST",
      url: "/meeting-types",
      payload: { name: "Stand-up", description: "", durationMinutes: 30 },
    });
    expect(success.statusCode).toBe(200);
    expectDocumentedJsonSchema("/meeting-types", "post", success.statusCode, "MeetingType");

    const unprocessable = await app.inject({
      method: "POST",
      url: "/meeting-types",
      payload: { name: "Invalid", description: "", durationMinutes: 15 },
    });
    expect(unprocessable.statusCode).toBe(422);
    expect(unprocessable.json()).toMatchObject({ statusCode: 422, code: "INVALID_DURATION" });
    expectDocumentedJsonSchema("/meeting-types", "post", unprocessable.statusCode, "DomainError");

    const badRequest = await app.inject({
      method: "POST",
      url: "/meeting-types",
      payload: { name: "Invalid", description: "", durationMinutes: 0 },
    });
    expect(badRequest.statusCode).toBe(400);
    expect(badRequest.json()).toMatchObject({ statusCode: 400, code: "FST_ERR_VALIDATION" });
    expect(documentedJsonSchema("/meeting-types", "post", badRequest.statusCode)?.$ref).not.toBe(
      "#/components/schemas/DomainError",
    );
  });

  it("GET /meeting-types/{id} разделяет успешный 200 и доменный 404", async () => {
    app = await buildApp({ config, clock });
    const created = await app.inject({
      method: "POST",
      url: "/meeting-types",
      payload: { name: "Stand-up", description: "", durationMinutes: 30 },
    });
    const meetingTypeId = created.json().id;

    const success = await app.inject({ method: "GET", url: `/meeting-types/${meetingTypeId}` });
    expect(success.statusCode).toBe(200);
    expectDocumentedJsonSchema("/meeting-types/{id}", "get", success.statusCode, "MeetingType");

    const notFound = await app.inject({
      method: "GET",
      url: "/meeting-types/00000000-0000-0000-0000-000000000000",
    });
    expect(notFound.statusCode).toBe(404);
    expect(notFound.json()).toMatchObject({
      statusCode: 404,
      code: "MEETING_TYPE_NOT_FOUND",
    });
    expectDocumentedJsonSchema("/meeting-types/{id}", "get", notFound.statusCode, "DomainError");
  });

  it("GET /meeting-types/{id}/availability разделяет успешный 200 и доменный 404", async () => {
    app = await buildApp({ config, clock });
    const created = await app.inject({
      method: "POST",
      url: "/meeting-types",
      payload: { name: "Stand-up", description: "", durationMinutes: 30 },
    });
    const meetingTypeId = created.json().id;

    const success = await app.inject({
      method: "GET",
      url: `/meeting-types/${meetingTypeId}/availability`,
    });
    expect(success.statusCode).toBe(200);
    expectDocumentedJsonSchema(
      "/meeting-types/{id}/availability",
      "get",
      success.statusCode,
      "Availability",
    );

    const notFound = await app.inject({
      method: "GET",
      url: "/meeting-types/00000000-0000-0000-0000-000000000000/availability",
    });
    expect(notFound.statusCode).toBe(404);
    expect(notFound.json()).toMatchObject({
      statusCode: 404,
      code: "MEETING_TYPE_NOT_FOUND",
    });
    expectDocumentedJsonSchema(
      "/meeting-types/{id}/availability",
      "get",
      notFound.statusCode,
      "DomainError",
    );
  });
});
