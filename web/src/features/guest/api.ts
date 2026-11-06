import {
  meetingTypesAvailability,
  meetingTypesGetById,
  meetingTypesList,
  type Availability,
  type AvailabilityDay,
  type MeetingType,
} from "@/api/sdk";
import { isMeetingType } from "@/api/guards";

export type { Availability, AvailabilityDay, MeetingType };

function isAvailability(value: unknown): value is Availability {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.meetingTypeId === "string" &&
    typeof candidate.windowStart === "string" &&
    typeof candidate.windowEnd === "string" &&
    Array.isArray(candidate.days) &&
    candidate.days.every((day: unknown) => {
      if (typeof day !== "object" || day === null) return false;
      const candidateDay = day as Record<string, unknown>;
      return (
        typeof candidateDay.date === "string" &&
        Array.isArray(candidateDay.slots) &&
        candidateDay.slots.every((slot: unknown) => typeof slot === "string")
      );
    })
  );
}

export async function listMeetingTypes(): Promise<MeetingType[]> {
  const result = await meetingTypesList();
  const status: number = result.status;
  const data: unknown = result.data;
  if (status !== 200) throw new Error(`listMeetingTypes: HTTP ${status}`);
  if (!Array.isArray(data) || !data.every(isMeetingType)) {
    throw new Error("listMeetingTypes: пустое или невалидное тело ответа");
  }
  return data;
}

export async function getMeetingType(meetingTypeId: string): Promise<MeetingType> {
  const result = await meetingTypesGetById(meetingTypeId);
  const status: number = result.status;
  const data: unknown = result.data;
  if (status !== 200) throw new Error(`getMeetingType: HTTP ${status}`);
  if (!isMeetingType(data)) {
    throw new Error("getMeetingType: пустое или невалидное тело ответа");
  }
  return data;
}

export async function getAvailability(meetingTypeId: string): Promise<Availability> {
  const result = await meetingTypesAvailability(meetingTypeId);
  const status: number = result.status;
  const data: unknown = result.data;
  if (status !== 200) {
    throw new Error(`getAvailability: HTTP ${status}`);
  }
  if (!isAvailability(data)) {
    throw new Error("getAvailability: пустое или невалидное тело ответа");
  }
  return data;
}
