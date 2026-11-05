import {
  meetingTypesCreate,
  meetingTypesList,
  DomainErrorCode,
  type CreateMeetingTypeRequest,
  type DomainError,
  type MeetingType,
} from "@/api/sdk";

export type { CreateMeetingTypeRequest, DomainError, DomainErrorCode, MeetingType };

export type CreateOutcome =
  | { kind: "success"; value: MeetingType }
  | { kind: "domain"; error: DomainError }
  | { kind: "network"; message: string };

export type ListOutcome =
  | { kind: "success"; value: MeetingType[] }
  | { kind: "network"; message: string };

function isMeetingType(value: unknown): value is MeetingType {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.name === "string" &&
    typeof candidate.description === "string" &&
    typeof candidate.durationMinutes === "number"
  );
}

const DOMAIN_ERROR_CODES = new Set<string>(Object.values(DomainErrorCode));

function isDomainError(value: unknown, status: number): value is DomainError {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    candidate.statusCode === status &&
    typeof candidate.code === "string" &&
    DOMAIN_ERROR_CODES.has(candidate.code) &&
    typeof candidate.message === "string"
  );
}

function responseMessage(value: unknown): string {
  if (typeof value === "object" && value !== null && "message" in value) {
    const { message } = value;
    if (typeof message === "string") return message;
  }
  return "неизвестный ответ сервера";
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

/** Загружает типы встреч через generated Orval endpoint-функцию. */
export async function listMeetingTypes(): Promise<ListOutcome> {
  try {
    const result = await meetingTypesList();
    const status: number = result.status;
    const data: unknown = result.data;
    if (status === 200 && Array.isArray(data) && data.every(isMeetingType)) {
      return { kind: "success", value: data };
    }
    if (status === 200) {
      return { kind: "network", message: "listMeetingTypes: пустое или невалидное тело ответа" };
    }
    return { kind: "network", message: `listMeetingTypes: сервер ответил ${status}` };
  } catch (cause) {
    return { kind: "network", message: errorMessage(cause) };
  }
}

/** Переводит generated create result в success/domain/network outcome для формы. */
export async function createMeetingType(input: CreateMeetingTypeRequest): Promise<CreateOutcome> {
  try {
    const result = await meetingTypesCreate(input);
    const status: number = result.status;
    const data: unknown = result.data;

    if (status === 200) {
      if (isMeetingType(data)) return { kind: "success", value: data };
      return {
        kind: "network",
        message: "createMeetingType: пустое или невалидное тело ответа",
      };
    }
    if (status === 422 && isDomainError(data, status)) return { kind: "domain", error: data };
    if (status === 400) {
      return {
        kind: "network",
        message: `Проверьте правильность заполнения полей: ${responseMessage(data).slice(0, 200)}`,
      };
    }
    return { kind: "network", message: `createMeetingType: сервер ответил ${status}` };
  } catch (cause) {
    return { kind: "network", message: errorMessage(cause) };
  }
}
