import type { components } from "@/api/sdk";

export type MeetingType = components["schemas"]["MeetingType"];
export type Availability = components["schemas"]["Availability"];
export type AvailabilityDay = components["schemas"]["AvailabilityDay"];

const MEETING_TYPES_PATH = "/api/meeting-types";

export async function listMeetingTypes(): Promise<MeetingType[]> {
  const res = await fetch(MEETING_TYPES_PATH);
  if (!res.ok) {
    throw new Error(`GET ${MEETING_TYPES_PATH} failed: HTTP ${res.status}`);
  }
  return (await res.json()) as MeetingType[];
}

export async function getAvailability(meetingTypeId: string): Promise<Availability> {
  const path = `${MEETING_TYPES_PATH}/${encodeURIComponent(meetingTypeId)}/availability`;
  const res = await fetch(path);
  if (!res.ok) {
    throw new Error(`GET ${path} failed: HTTP ${res.status}`);
  }
  return (await res.json()) as Availability;
}
