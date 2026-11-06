import { isDomainError } from "@/api/guards";
import type { DomainError, bookingsCreateResponse, meetingTypesCreateResponse } from "@/api/sdk";

export type DomainOutcome = { kind: "domain"; error: DomainError };
export type NetworkOutcome = { kind: "network"; message: string };

type GeneratedCreateResult = bookingsCreateResponse | meetingTypesCreateResponse;

type CreateResultOptions<T, Success extends { kind: "success" }> = {
  operation: "createBooking" | "createMeetingType";
  isSuccessValue: (value: unknown) => value is T;
  domainStatuses: readonly number[];
  onSuccess: (value: T) => Success;
};

function responseMessage(value: unknown): string {
  if (typeof value === "object" && value !== null && "message" in value) {
    const { message } = value;
    if (typeof message === "string") return message;
  }
  return "неизвестный ответ сервера";
}

export function networkOutcome(cause: unknown): NetworkOutcome {
  return {
    kind: "network",
    message: cause instanceof Error ? cause.message : String(cause),
  };
}

/** Переводит уже полученный generated create result; не выполняет HTTP-запросов и не парсит JSON. */
export function translateCreateResult<T, Success extends { kind: "success" }>(
  result: GeneratedCreateResult,
  options: CreateResultOptions<T, Success>,
): Success | DomainOutcome | NetworkOutcome {
  const status: number = result.status;
  const data: unknown = result.data;

  if (status === 200) {
    if (options.isSuccessValue(data)) return options.onSuccess(data);
    return {
      kind: "network",
      message: `${options.operation}: пустое или невалидное тело ответа`,
    };
  }

  if (options.domainStatuses.includes(status) && isDomainError(data, status)) {
    return { kind: "domain", error: data };
  }

  if (status === 400) {
    return {
      kind: "network",
      message: `Проверьте правильность заполнения полей: ${responseMessage(data).slice(0, 200)}`,
    };
  }

  return { kind: "network", message: `${options.operation}: сервер ответил ${status}` };
}
