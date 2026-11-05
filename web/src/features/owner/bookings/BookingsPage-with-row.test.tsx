import "@testing-library/jest-dom/vitest";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { BookingsPage } from "./index";
import { OwnerTimezoneProvider } from "./OwnerTimezoneContext";

const ONE_BOOKING = {
  id: "00000000-0000-4000-8000-000000000001",
  meetingTypeId: "00000000-0000-4000-8000-000000000002",
  meetingTypeName: "Intro 30m",
  guestName: "Alice",
  guestEmail: "[email protected]",
  startsAt: "2026-12-01T09:00:00+03:00",
  endsAt: "2026-12-01T09:30:00+03:00",
};

function mockFetch(bookings: unknown, timezone = "Europe/Moscow"): void {
  vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : (input as Request).url;
    if (url === "/api/bookings") {
      return Promise.resolve(
        new Response(JSON.stringify(bookings), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }
    if (url === "/api/config") {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            owner: { name: "Owner", timezone },
            windowDays: 14,
            slotStepMinutes: 30,
            workingDays: [1, 2, 3, 4, 5],
            workingHours: { start: "09:00", end: "18:00" },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );
    }
    return Promise.reject(new Error(`Unexpected fetch: ${url}`));
  });
}

describe("BookingsPage (one row)", () => {
  beforeEach(() => {
    mockFetch([ONE_BOOKING]);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders exactly one booking row from /api/bookings", async () => {
    render(
      <MemoryRouter>
        <OwnerTimezoneProvider>
          <BookingsPage />
        </OwnerTimezoneProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("bookings-table")).toBeInTheDocument();
    });

    expect(screen.getAllByTestId("booking-row")).toHaveLength(1);

    const row = screen.getByTestId("booking-row");
    expect(row).toHaveTextContent("Intro 30m");
    expect(row).toHaveTextContent("Alice");
    expect(row).toHaveTextContent("[email protected]");

    expect(screen.getByTestId("booking-row-starts-at")).toHaveTextContent(
      "вторник, 1 декабря 2026, 09:00",
    );
    expect(screen.getByTestId("booking-row-ends-at")).toHaveTextContent(
      "вторник, 1 декабря 2026, 09:30",
    );
    expect(screen.getByRole("heading", { name: "Бронирования" })).toBeInTheDocument();
    expect(screen.getByTestId("bookings-table-head-meeting-type")).toHaveTextContent("Тип встречи");
    expect(screen.getByTestId("bookings-table-head-guest-name")).toHaveTextContent("Гость");
    expect(screen.getByTestId("bookings-table-head-starts-at")).toHaveTextContent("Начало");
    expect(screen.getByTestId("bookings-table-head-ends-at")).toHaveTextContent("Окончание");

    expect(screen.queryByTestId("bookings-empty")).not.toBeInTheDocument();
  });
});
