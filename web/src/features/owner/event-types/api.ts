import type { components } from "@/api/sdk";

export type MeetingType = components["schemas"]["MeetingType"];
export type CreateMeetingTypeRequest = components["schemas"]["CreateMeetingTypeRequest"];
export type DomainError = components["schemas"]["DomainError"];
export type DomainErrorCode = components["schemas"]["DomainErrorCode"];

/**
 * Результат вызова `POST /api/meeting-types`.
 *
 * Бэкенд возвращает `MeetingType` при HTTP 200 и `DomainError` при 4xx/5xx.
 * Сервер на spec-уровне НЕ оборачивает успех в envelope — тело напрямую
 * парсится как `MeetingType`. Сетевые сбои (TypeError от `fetch`, не-JSON
 * ответ) дают `kind: "network"` — для них UI рисует retry CTA.
 *
 * `DomainError.code` дискриминируется на уровне UI (см. {@link mapDomainError}),
 * здесь мы возвращаем сырой ответ, чтобы caller сам решил, какой текст
 * показать и куда (поле vs. банер).
 */
export type CreateOutcome =
  | { kind: "success"; value: MeetingType }
  | { kind: "domain"; error: DomainError }
  | { kind: "network"; message: string };

/** Результат `GET /api/meeting-types`. */
export type ListOutcome =
  | { kind: "success"; value: MeetingType[] }
  | { kind: "network"; message: string };

const JSON_HEADERS = { "Content-Type": "application/json" };

async function parseJson<T>(res: Response, label: string): Promise<T | null> {
  const text = await res.text();
  if (text.length === 0) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`${label}: ответ не является валидным JSON`);
  }
}

/** Загружает список существующих `MeetingType`. */
export async function listMeetingTypes(): Promise<ListOutcome> {
  try {
    const res = await fetch("/api/meeting-types", { method: "GET" });
    if (!res.ok) {
      return {
        kind: "network",
        message: `GET /meeting-types: сервер ответил ${res.status}`,
      };
    }
    const parsed = await parseJson<MeetingType[]>(res, "GET /meeting-types");
    return { kind: "success", value: parsed ?? [] };
  } catch (cause) {
    return {
      kind: "network",
      message: cause instanceof Error ? cause.message : String(cause),
    };
  }
}

/** Создаёт тип встречи. */
export async function createMeetingType(input: CreateMeetingTypeRequest): Promise<CreateOutcome> {
  try {
    const res = await fetch("/api/meeting-types", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(input),
    });
    if (res.ok) {
      const value = await parseJson<MeetingType>(res, "POST /meeting-types");
      if (value === null) {
        return { kind: "network", message: "POST /meeting-types: пустое тело ответа" };
      }
      return { kind: "success", value };
    }
    const err = await parseJson<DomainError>(res, "POST /meeting-types");
    if (err !== null) {
      return { kind: "domain", error: err };
    }
    return {
      kind: "network",
      message: `POST /meeting-types: сервер ответил ${res.status}`,
    };
  } catch (cause) {
    return {
      kind: "network",
      message: cause instanceof Error ? cause.message : String(cause),
    };
  }
}
