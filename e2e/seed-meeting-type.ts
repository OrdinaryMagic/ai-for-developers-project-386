import { expect, request as pwRequest } from "@playwright/test";

const API_PORT = Number(process.env.E2E_API_PORT ?? 3030);
const API_BASE = `http://127.0.0.1:${API_PORT}`;

type MeetingTypeSeed = {
  name: string;
  description: string;
  durationMinutes: number;
};

/** Создаёт MeetingType через настоящий API и всегда освобождает request context. */
export async function seedMeetingType(data: MeetingTypeSeed): Promise<string> {
  const api = await pwRequest.newContext({ baseURL: API_BASE });
  try {
    const response = await api.post("/meeting-types", { data });
    expect(response.status(), "seed POST /meeting-types").toBe(200);

    const body: unknown = await response.json();
    if (
      typeof body !== "object" ||
      body === null ||
      !("id" in body) ||
      typeof body.id !== "string" ||
      body.id.length === 0
    ) {
      throw new Error("seed POST /meeting-types returned no MeetingType ID");
    }
    return body.id;
  } finally {
    await api.dispose();
  }
}
