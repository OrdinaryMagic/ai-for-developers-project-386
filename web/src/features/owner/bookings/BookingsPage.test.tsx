import "@testing-library/jest-dom/vitest";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { BookingsPage } from "./index";
import { OwnerTimezoneProvider } from "./OwnerTimezoneContext";

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

describe("BookingsPage (empty state)", () => {
  beforeEach(() => {
    mockFetch([]);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("shows the 'booking-row empty' copy when /api/bookings returns []", async () => {
    render(
      <MemoryRouter>
        <OwnerTimezoneProvider>
          <BookingsPage />
        </OwnerTimezoneProvider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("bookings-empty")).toBeInTheDocument();
    });

    expect(screen.getByTestId("bookings-empty")).toHaveTextContent("Нет предстоящих встреч");
    expect(screen.queryAllByTestId("booking-row")).toHaveLength(0);
  });
});
