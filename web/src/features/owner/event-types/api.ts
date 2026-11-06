import {
  meetingTypesCreate,
  meetingTypesList,
  type CreateMeetingTypeRequest,
  type DomainError,
  type DomainErrorCode,
  type MeetingType,
} from "@/api/sdk";
import {
  networkOutcome,
  translateCreateResult,
  type DomainOutcome,
  type NetworkOutcome,
} from "@/api/createOutcome";
import { isMeetingType } from "@/api/guards";

export type { CreateMeetingTypeRequest, DomainError, DomainErrorCode, MeetingType };

export type CreateOutcome =
  | { kind: "success"; value: MeetingType }
  | DomainOutcome
  | NetworkOutcome;

export type ListOutcome = { kind: "success"; value: MeetingType[] } | NetworkOutcome;

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
    return networkOutcome(cause);
  }
}

/** Переводит generated create result в success/domain/network outcome для формы. */
export async function createMeetingType(input: CreateMeetingTypeRequest): Promise<CreateOutcome> {
  try {
    const result = await meetingTypesCreate(input);
    return translateCreateResult(result, {
      operation: "createMeetingType",
      isSuccessValue: isMeetingType,
      domainStatuses: [422],
      onSuccess: (value) => ({ kind: "success", value }),
    });
  } catch (cause) {
    return networkOutcome(cause);
  }
}
