import type { components } from "@/api/sdk";

/**
 * Re-exported SDK schema types. These are the only contract for the API —
 * do NOT hand-define `Booking` / `Configuration` elsewhere. The next SDK
 * regen will overwrite anything we write by hand (see AGENTS.md rule #11).
 */
export type Booking = components["schemas"]["Booking"];
export type Configuration = components["schemas"]["Configuration"];

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} on ${url}`);
  }
  return res.json();
}

export async function listBookings(): Promise<Booking[]> {
  const json = await fetchJson("/api/bookings");
  return json as Booking[];
}

export async function getConfiguration(): Promise<Configuration> {
  const json = await fetchJson("/api/config");
  return json as Configuration;
}
