import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

import App from "@/App";

const MEETING_TYPE_ID = "11111111-1111-4111-8111-111111111111";
const SLOT = "2026-11-04T09:00:00.000+03:00";

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

const meetingTypeFixture = {
  id: MEETING_TYPE_ID,
  name: "Консультация",
  description: "Знакомство",
  durationMinutes: 30,
};

const configResponse = {
  owner: { name: "Owner", timezone: "Europe/Moscow" },
  windowDays: 14,
  slotStepMinutes: 30,
  workingDays: [1, 2, 3, 4, 5],
  workingHours: { start: "09:00", end: "18:00" },
};

/**
 * Универсальный мок `fetch` для тестов BookingForm: фиксирует ответы
 * `/api/config` (OwnerTimezoneProvider) и availability, а для
 * `/api/bookings` принимает колбэк handler, который возвращает
 * Response для каждого вызова (handler вызывается на каждый POST).
 * Если handler не зарегистрирован (cancel-сценарий), POST не происходит.
 */
function setupFetch(handler: (url: string, init: RequestInit | undefined) => Response) {
  const spy: import("vitest").MockInstance = vi.spyOn(globalThis, "fetch");
  spy.mockImplementation((input, init) => {
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
      return Promise.resolve(handler(url, init as RequestInit | undefined));
    }
    return Promise.reject(new Error(`Unexpected fetch: ${url}`));
  });
  return spy;
}

function domainErrorResponse(code: string, status: number): Response {
  return new Response(JSON.stringify({ statusCode: status, code, message: "boom" }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function bookingsCallCount(spy: import("vitest").MockInstance): number {
  return spy.mock.calls.filter((call: unknown[]) => {
    const arg = call[0];
    const url =
      typeof arg === "string" ? arg : arg instanceof URL ? arg.toString() : (arg as Request).url;
    return url === "/api/bookings";
  }).length;
}

function lastBookingsCallBody(spy: import("vitest").MockInstance): unknown {
  for (let i = spy.mock.calls.length - 1; i >= 0; i--) {
    const call = spy.mock.calls[i];
    if (!call) continue;
    const arg = call[0];
    const url =
      typeof arg === "string" ? arg : arg instanceof URL ? arg.toString() : (arg as Request).url;
    if (url === "/api/bookings") {
      return JSON.parse((call[1] as RequestInit).body as string) as unknown;
    }
  }
  throw new Error("no /api/bookings call recorded");
}

function renderAppAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

describe("BookingForm — guests conflict + retry (#33)", () => {
  beforeEach(() => {
    vi.spyOn(globalThis, "fetch").mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("409 SLOT_TAKEN: показывает баннер и сохраняет введённые поля для retry", async () => {
    const user = userEvent.setup();
    const fetchSpy = setupFetch(() => domainErrorResponse("SLOT_TAKEN", 409));

    renderAppAt(`/book/${MEETING_TYPE_ID}`);

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(`/api/meeting-types/${MEETING_TYPE_ID}/availability`, {
        method: "GET",
      });
    });

    const slotButton = await screen.findByTestId(`slot-${SLOT}`);
    await user.click(slotButton);

    const nameInput = await screen.findByTestId("booking-name");
    const emailInput = screen.getByTestId("booking-email");
    await user.type(nameInput, "Иван Петров");
    await user.type(emailInput, "ivan@example.com");

    await user.click(screen.getByTestId("booking-submit"));

    await waitFor(() => expect(screen.getByTestId("booking-error-slot-taken")).toBeInTheDocument());
    expect(screen.getByTestId("booking-error-slot-taken")).toHaveTextContent("Слот уже занят");

    // previous payload not lost
    expect((nameInput as HTMLInputElement).value).toBe("Иван Петров");
    expect((emailInput as HTMLInputElement).value).toBe("ivan@example.com");

    const before = bookingsCallCount(fetchSpy);

    await user.click(screen.getByTestId("booking-submit"));

    await waitFor(() => {
      expect(bookingsCallCount(fetchSpy)).toBe(before + 1);
    });

    const secondBody = lastBookingsCallBody(fetchSpy);
    expect(secondBody).toEqual({
      meetingTypeId: MEETING_TYPE_ID,
      startsAt: SLOT,
      guestName: "Иван Петров",
      guestEmail: "ivan@example.com",
    });

    // баннер всё ещё виден
    expect(screen.getByTestId("booking-error-slot-taken")).toBeInTheDocument();

    await act(async () => {});
  });

  it("422 OUTSIDE_WINDOW: баннер с понятным текстом", async () => {
    const user = userEvent.setup();
    setupFetch(() => domainErrorResponse("OUTSIDE_WINDOW", 422));

    renderAppAt(`/book/${MEETING_TYPE_ID}`);

    await user.click(await screen.findByTestId(`slot-${SLOT}`));
    await user.type(await screen.findByTestId("booking-name"), "Иван");
    await user.type(screen.getByTestId("booking-email"), "i@e.co");
    await user.click(screen.getByTestId("booking-submit"));

    const banner = await screen.findByTestId("booking-error-outside-window");
    expect(banner).toBeInTheDocument();
    expect(banner).toHaveTextContent("окна бронирования");

    await act(async () => {});
  });

  it("400 Fastify-schema: показывает generic network-error ban", async () => {
    const user = userEvent.setup();
    setupFetch(
      () =>
        new Response(
          '{"statusCode":400,"code":"FST_ERR_VALIDATION","message":"body/guestEmail must be email"}',
          { status: 400, headers: { "Content-Type": "application/json" } },
        ),
    );

    renderAppAt(`/book/${MEETING_TYPE_ID}`);

    await user.click(await screen.findByTestId(`slot-${SLOT}`));
    await user.type(await screen.findByTestId("booking-name"), "Иван");
    await user.type(screen.getByTestId("booking-email"), "i@e.co");
    await user.click(screen.getByTestId("booking-submit"));

    const banner = await screen.findByTestId("booking-error");
    expect(banner).toBeInTheDocument();
    expect(banner).toHaveTextContent("Не удалось отправить запрос");

    await act(async () => {});
  });

  it.each([
    ["пустое тело", () => new Response(null, { status: 200 })],
    [
      "невалидный JSON",
      () =>
        new Response("{", {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    ],
  ])("200 с ответом '%s' не принимается за успешную бронь", async (_label, response) => {
    const user = userEvent.setup();
    setupFetch(response);

    renderAppAt(`/book/${MEETING_TYPE_ID}`);

    await user.click(await screen.findByTestId(`slot-${SLOT}`));
    await user.type(await screen.findByTestId("booking-name"), "Иван");
    await user.type(screen.getByTestId("booking-email"), "i@e.co");
    await user.click(screen.getByTestId("booking-submit"));

    expect(await screen.findByTestId("booking-error")).toHaveTextContent(
      "Не удалось отправить запрос",
    );
    expect(screen.queryByTestId("booking-success")).not.toBeInTheDocument();

    await act(async () => {});
  });

  it("cancel возвращает к сетке слотов без потери availability", async () => {
    const user = userEvent.setup();
    const fetchSpy = setupFetch(() => {
      throw new Error("should not be called");
    });

    renderAppAt(`/book/${MEETING_TYPE_ID}`);

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(`/api/meeting-types/${MEETING_TYPE_ID}/availability`, {
        method: "GET",
      });
    });

    await user.click(await screen.findByTestId(`slot-${SLOT}`));
    expect(await screen.findByTestId("booking-form")).toBeInTheDocument();

    await user.click(screen.getByTestId("booking-cancel"));

    expect(screen.queryByTestId("booking-form")).not.toBeInTheDocument();
    expect(await screen.findByTestId("book-grid")).toBeInTheDocument();
    expect(screen.getByTestId(`slot-${SLOT}`)).toBeInTheDocument();

    await act(async () => {});
  });
});
