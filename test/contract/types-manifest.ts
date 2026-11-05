/**
 * Манифест ожидаемой формы каждого доменного интерфейса.
 *
 * Источник истины — это `openapi.yaml`; этот манифест — зеркало, которое
 * держит contract-тест. Любая правка `openapi.yaml` или
 * переименование/удаление поля в `src/types.ts`, которое забыли отразить
 * здесь, ловит следующий прогон vitest.
 *
 * Чтобы добавить новую схему:
 *   1. добавьте запись в `typesManifest`;
 *   2. при наличии TS-зеркала в `src/types.ts` — заявите `tsInterface`
 *      и соответствующий фантом в `test/contract/ts-shape.ts`.
 */
import type { Availability, AvailabilityDay, Booking, MeetingType } from "../../src/types.js";

/** Описание элемента для свойств типа `array`. */
export type ManifestArrayItems =
  | { kind: "string" }
  | { kind: "integer"; minimum?: number; maximum?: number }
  | { kind: "ref"; ref: string };

/** Описание одного свойства объекта. */
export type ManifestProperty =
  | { kind: "string"; maxLength?: number }
  | { kind: "integer"; minimum?: number; maximum?: number }
  | { kind: "ref"; ref: string }
  | { kind: "array"; items: ManifestArrayItems };

/** Карта имён TS-интерфейсов, для которых в манифесте зафиксировано соответствие. */
export interface ManifestTsTable {
  MeetingType: MeetingType;
  Booking: Booking;
  Availability: Availability;
  AvailabilityDay: AvailabilityDay;
}

/** Декларация одной схемы из `components.schemas`. */
export type ManifestSchema =
  | {
      kind: "object";
      /** Имя интерфейса в `src/types.ts`, который должен совпадать (опционально). */
      tsInterface?: keyof ManifestTsTable;
      required: readonly string[];
      properties: Record<string, ManifestProperty>;
    }
  | {
      kind: "enum";
      values: readonly string[];
    };

export const typesManifest: Record<string, ManifestSchema> = {
  MeetingType: {
    kind: "object",
    tsInterface: "MeetingType",
    required: ["id", "name", "description", "durationMinutes"],
    properties: {
      id: { kind: "string", maxLength: 36 },
      name: { kind: "string", maxLength: 120 },
      description: { kind: "string", maxLength: 2000 },
      durationMinutes: { kind: "integer", minimum: 1, maximum: 1440 },
    },
  },
  Booking: {
    kind: "object",
    tsInterface: "Booking",
    required: [
      "id",
      "meetingTypeId",
      "meetingTypeName",
      "guestName",
      "guestEmail",
      "startsAt",
      "endsAt",
    ],
    properties: {
      id: { kind: "string", maxLength: 36 },
      meetingTypeId: { kind: "string" },
      meetingTypeName: { kind: "string" },
      guestName: { kind: "string" },
      guestEmail: { kind: "string" },
      startsAt: { kind: "string" },
      endsAt: { kind: "string" },
    },
  },
  AvailabilityDay: {
    kind: "object",
    tsInterface: "AvailabilityDay",
    required: ["date", "slots"],
    properties: {
      date: { kind: "string" },
      slots: { kind: "array", items: { kind: "string" } },
    },
  },
  Availability: {
    kind: "object",
    tsInterface: "Availability",
    required: ["meetingTypeId", "windowStart", "windowEnd", "days"],
    properties: {
      meetingTypeId: { kind: "string" },
      windowStart: { kind: "string" },
      windowEnd: { kind: "string" },
      days: { kind: "array", items: { kind: "ref", ref: "AvailabilityDay" } },
    },
  },
  Configuration: {
    kind: "object",
    required: ["owner", "windowDays", "slotStepMinutes", "workingDays", "workingHours"],
    properties: {
      owner: { kind: "ref", ref: "Owner" },
      windowDays: { kind: "integer" },
      slotStepMinutes: { kind: "integer" },
      workingDays: { kind: "array", items: { kind: "integer", minimum: 1, maximum: 7 } },
      workingHours: { kind: "ref", ref: "WorkingHours" },
    },
  },
  Owner: {
    kind: "object",
    required: ["name", "timezone"],
    properties: {
      name: { kind: "string", maxLength: 120 },
      timezone: { kind: "string" },
    },
  },
  WorkingHours: {
    kind: "object",
    required: ["start", "end"],
    properties: {
      start: { kind: "string" },
      end: { kind: "string" },
    },
  },
  CreateMeetingTypeRequest: {
    kind: "object",
    required: ["name", "description", "durationMinutes"],
    properties: {
      name: { kind: "string", maxLength: 120 },
      description: { kind: "string", maxLength: 2000 },
      durationMinutes: { kind: "integer", minimum: 1, maximum: 1440 },
    },
  },
  CreateBookingRequest: {
    kind: "object",
    required: ["meetingTypeId", "startsAt", "guestName", "guestEmail"],
    properties: {
      meetingTypeId: { kind: "string" },
      startsAt: { kind: "string" },
      guestName: { kind: "string", maxLength: 120 },
      guestEmail: { kind: "string", maxLength: 254 },
    },
  },
  DomainError: {
    kind: "object",
    required: ["statusCode", "code", "message"],
    properties: {
      statusCode: { kind: "integer" },
      code: { kind: "ref", ref: "DomainErrorCode" },
      message: { kind: "string" },
    },
  },
  DomainErrorCode: {
    kind: "enum",
    values: [
      "MEETING_TYPE_NOT_FOUND",
      "OUTSIDE_WORKING_HOURS",
      "OUTSIDE_WINDOW",
      "MISMATCH_STEP",
      "SLOT_TAKEN",
      "INVALID_DURATION",
    ],
  },
};
