import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  bookingsCreate,
  type bookingsCreateResponse,
  type Booking,
  type DomainError,
} from "@/api/sdk";
import { createBooking } from "@/features/guest/book/api";

vi.mock("@/api/sdk", async (importOriginal) => ({
  ...(await importOriginal()),
  bookingsCreate: vi.fn(),
}));

const BOOKING: Booking = {
  id: "22222222-2222-4222-8222-222222222222",
  meetingTypeId: "11111111-1111-4111-8111-111111111111",
  meetingTypeName: "Консультация",
  guestName: "Иван Петров",
  guestEmail: "ivan@example.com",
  startsAt: "2026-11-04T09:00:00.000+03:00",
  endsAt: "2026-11-04T09:30:00.000+03:00",
};

const INPUT = {
  meetingTypeId: BOOKING.meetingTypeId,
  startsAt: BOOKING.startsAt,
  guestName: BOOKING.guestName,
  guestEmail: BOOKING.guestEmail,
};

function sdkResult(status: number, data: unknown): bookingsCreateResponse {
  return { status, data, headers: new Headers() } as bookingsCreateResponse;
}

function domainError(statusCode: number, code: DomainError["code"]): DomainError {
  return { statusCode, code, message: "domain failure" };
}

describe("createBooking outcome adapter", () => {
  beforeEach(() => {
    vi.mocked(bookingsCreate).mockReset();
  });

  it("maps only a valid 200 Booking to success", async () => {
    vi.mocked(bookingsCreate).mockResolvedValue(sdkResult(200, BOOKING));

    await expect(createBooking(INPUT)).resolves.toEqual({ kind: "success", booking: BOOKING });
    expect(bookingsCreate).toHaveBeenCalledWith(INPUT);
  });

  it.each([404, 409, 422] as const)("maps domain HTTP %i to a domain outcome", async (status) => {
    const error = domainError(status, status === 409 ? "SLOT_TAKEN" : "MEETING_TYPE_NOT_FOUND");
    vi.mocked(bookingsCreate).mockResolvedValue(sdkResult(status, error));

    await expect(createBooking(INPUT)).resolves.toEqual({ kind: "domain", error });
  });

  it.each([
    [
      "an unknown error code",
      sdkResult(409, { statusCode: 409, code: "FST_ERR_VALIDATION", message: "bad" }),
    ],
    ["a mismatched statusCode", sdkResult(409, domainError(422, "OUTSIDE_WINDOW"))],
  ])("maps %s in a domain response to network", async (_label, result) => {
    vi.mocked(bookingsCreate).mockResolvedValue(result);

    await expect(createBooking(INPUT)).resolves.toMatchObject({ kind: "network" });
  });

  it("maps Fastify 400 to a field-level network outcome, not a domain success", async () => {
    vi.mocked(bookingsCreate).mockResolvedValue(
      sdkResult(400, {
        statusCode: 400,
        code: "FST_ERR_VALIDATION",
        message: "body/guestEmail must be email",
      }),
    );

    const outcome = await createBooking(INPUT);

    expect(outcome.kind).toBe("network");
    expect(outcome).toMatchObject({ message: expect.stringContaining("body/guestEmail") });
  });

  it.each([
    ["an empty success payload", sdkResult(200, {})],
    ["a DomainError mislabelled as success", sdkResult(200, domainError(409, "SLOT_TAKEN"))],
    ["an upstream failure", sdkResult(500, { message: "broken" })],
  ])("maps %s to network", async (_label, result) => {
    vi.mocked(bookingsCreate).mockResolvedValue(result);

    await expect(createBooking(INPUT)).resolves.toMatchObject({ kind: "network" });
  });

  it("maps fetch and JSON parsing rejections to network", async () => {
    vi.mocked(bookingsCreate).mockRejectedValue(new SyntaxError("Unexpected end of JSON input"));

    await expect(createBooking(INPUT)).resolves.toEqual({
      kind: "network",
      message: "Unexpected end of JSON input",
    });
  });
});
