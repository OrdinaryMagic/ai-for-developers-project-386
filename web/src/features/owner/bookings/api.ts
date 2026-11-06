import { bookingsList, configGetConfig, type Booking, type Configuration } from "@/api/sdk";
import { isBooking } from "@/api/guards";

export type { Booking, Configuration };

function isConfiguration(value: unknown): value is Configuration {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  if (
    !Array.isArray(candidate.workingDays) ||
    !candidate.workingDays.every((day) => typeof day === "number")
  ) {
    return false;
  }
  if (typeof candidate.owner !== "object" || candidate.owner === null) return false;
  if (typeof candidate.workingHours !== "object" || candidate.workingHours === null) return false;
  const owner = candidate.owner as Record<string, unknown>;
  const workingHours = candidate.workingHours as Record<string, unknown>;
  return (
    typeof owner.name === "string" &&
    typeof owner.timezone === "string" &&
    typeof candidate.windowDays === "number" &&
    typeof candidate.slotStepMinutes === "number" &&
    typeof workingHours.start === "string" &&
    typeof workingHours.end === "string"
  );
}

export async function listBookings(): Promise<Booking[]> {
  const result = await bookingsList();
  const status: number = result.status;
  const data: unknown = result.data;
  if (status !== 200) throw new Error(`listBookings: HTTP ${status}`);
  if (!Array.isArray(data) || !data.every(isBooking)) {
    throw new Error("listBookings: пустое или невалидное тело ответа");
  }
  return data;
}

export async function getConfiguration(): Promise<Configuration> {
  const result = await configGetConfig();
  const status: number = result.status;
  const data: unknown = result.data;
  if (status !== 200) throw new Error(`getConfiguration: HTTP ${status}`);
  if (!isConfiguration(data)) {
    throw new Error("getConfiguration: пустое или невалидное тело ответа");
  }
  return data;
}
