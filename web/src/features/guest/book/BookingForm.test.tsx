import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

import App from "@/App";

const MEETING_TYPE_ID = "11111111-1111-4111-8111-111111111111";
const SLOT = "2026-11-04T09:00:00.000+03:00";
const MEETING_TYPE_NAME = "30-минутная консультация";
const BOOKING_ID = "22222222-2222-4222-8222-222222222222";
const SELECTED_SUMMARY = "30-минутная консультация · среда, 4 ноября 2026 · 09:00–09:30";

const meetingTypeFixture = {
  id: MEETING_TYPE_ID,
  name: MEETING_TYPE_NAME,
  description: "Знакомство",
  durationMinutes: 30,
};

const sampleAvailability = {
  meetingTypeId: MEETING_TYPE_ID,
  windowStart: "2026-11-04T00:00:00.000+03:00",
  windowEnd: "2026-11-18T00:00:00.000+03:00",
  days: [
    {
      date: "2026-11-04",
      slots: [SLOT],
    },
  ],
};

const bookingFixture = {
  id: BOOKING_ID,
  meetingTypeId: MEETING_TYPE_ID,
  meetingTypeName: MEETING_TYPE_NAME,
  guestName: "Иван Петров",
  guestEmail: "ivan@example.com",
  startsAt: SLOT,
  endsAt: "2026-11-04T09:30:00.000+03:00",
};

const configResponse = {
  owner: { name: "Owner", timezone: "Europe/Moscow" },
  windowDays: 14,
  slotStepMinutes: 30,
  workingDays: [1, 2, 3, 4, 5],
  workingHours: { start: "09:00", end: "18:00" },
};

/**
 * Глобальный (catch-all) мок `fetch` для тестов BookingForm. Сопоставляет
 * URL с ожидаемым сценарием и возвращает нужный ответ; неизвестные URL —
 * fail, чтобы случайный fetch с плохим URL не проходил молча.
 *
 * Роутер моков фиксирован: `/api/config` (OwnerTimezoneProvider),
 * `/api/meeting-types/:id/availability` (BookPage) и `/api/bookings`
 * (BookingForm submit). Для error-cases отдельные helper-функции ниже.
 */
function setupHappyFetch(createBookingResponse: Response) {
  const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : (input as Request).url;
    if (url === "/api/config") {
      return Promise.resolve(
        new Response(JSON.stringify(configResponse), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }
    if (url === `/api/meeting-types/${MEETING_TYPE_ID}/availability`) {
      return Promise.resolve(
        new Response(JSON.stringify(sampleAvailability), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }
    if (url === `/api/meeting-types/${MEETING_TYPE_ID}`) {
      return Promise.resolve(
        new Response(JSON.stringify(meetingTypeFixture), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }
    if (url === "/api/bookings") {
      return Promise.resolve(createBookingResponse);
    }
    return Promise.reject(new Error(`Unexpected fetch: ${url}`));
  });
  return fetchSpy;
}

function renderAppAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

describe("BookingForm — guests happy path (#33)", () => {
  beforeEach(() => {
    vi.spyOn(globalThis, "fetch").mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("slot click → form → submit навигирует на /confirmed с данными брони", async () => {
    const user = userEvent.setup();
    const createBookingResponse = new Response(JSON.stringify(bookingFixture), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
    const fetchSpy = setupHappyFetch(createBookingResponse);

    renderAppAt(`/book/${MEETING_TYPE_ID}`);

    // availability fetch от BookPage
    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(`/api/meeting-types/${MEETING_TYPE_ID}/availability`, {
        method: "GET",
      });
    });

    const slotButton = await screen.findByTestId(`slot-${SLOT}`);
    await user.click(slotButton);

    const form = await screen.findByTestId("booking-form");
    expect(form).toBeInTheDocument();
    expect(screen.getByTestId("booking-prefilled-slot-iso")).toHaveValue(SLOT);
    expect(screen.getByTestId("booking-prefilled-slot-iso")).not.toBeVisible();
    expect(screen.getByTestId("booking-prefilled-slot")).toHaveTextContent(SELECTED_SUMMARY);
    expect(screen.getByTestId("booking-prefilled-slot")).not.toHaveTextContent(SLOT);

    await user.type(screen.getByTestId("booking-name"), "Иван Петров");
    await user.type(screen.getByTestId("booking-email"), "ivan@example.com");

    await user.click(screen.getByTestId("booking-submit"));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        "/api/bookings",
        expect.objectContaining({ method: "POST" }),
      );
    });

    const bookingsCalls = fetchSpy.mock.calls.filter(([arg]) => {
      const url =
        typeof arg === "string" ? arg : arg instanceof URL ? arg.toString() : (arg as Request).url;
      return url === "/api/bookings";
    });
    const body = JSON.parse((bookingsCalls[0]![1] as RequestInit).body as string) as unknown;
    expect(body).toEqual({
      meetingTypeId: MEETING_TYPE_ID,
      startsAt: SLOT,
      guestName: "Иван Петров",
      guestEmail: "ivan@example.com",
    });

    await screen.findByTestId("booking-success");
    expect(screen.getByTestId("booking-success-uuid")).toHaveTextContent(BOOKING_ID);
    expect(screen.getByTestId("booking-success-meeting-type-name")).toHaveTextContent(
      MEETING_TYPE_NAME,
    );
    expect(screen.getByTestId("booking-success-summary")).toHaveTextContent(SELECTED_SUMMARY);
    expect(screen.getByTestId("booking-success-dates")).toHaveTextContent(
      "среда, 4 ноября 2026 · 09:00–09:30",
    );
    expect(screen.getByTestId("booking-success")).not.toHaveTextContent(SLOT);

    // Drain pending microtasks so act() reports a clean exit.
    await act(async () => {});
  });
});
