import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import { ConfirmedPage } from "@/features/guest/book/ConfirmedPage";
import { OwnerTimezoneProvider } from "@/features/owner/bookings/OwnerTimezoneContext";

const MEETING_TYPE_ID = "11111111-1111-4111-8111-111111111111";
const BOOKING_ID = "22222222-2222-4222-8222-222222222222";
const SLOT = "2026-11-04T09:00:00.000+03:00";

const bookingFixture = {
  id: BOOKING_ID,
  meetingTypeId: MEETING_TYPE_ID,
  meetingTypeName: "30-минутная консультация",
  guestName: "Иван Петров",
  guestEmail: "ivan@example.com",
  startsAt: SLOT,
  endsAt: "2026-11-04T09:30:00.000+03:00",
};

function renderConfirmed(state: { booking: typeof bookingFixture } | null) {
  return render(
    <OwnerTimezoneProvider>
      <MemoryRouter initialEntries={[{ pathname: "/book/anything/confirmed", state }]}>
        <Routes>
          <Route path="/book/:meetingTypeId/confirmed" element={<ConfirmedPage />} />
        </Routes>
      </MemoryRouter>
    </OwnerTimezoneProvider>,
  );
}

describe("ConfirmedPage #33", () => {
  it("renders UUID + meetingTypeName + dates when location.state.booking задан", () => {
    renderConfirmed({ booking: bookingFixture });

    expect(screen.getByTestId("booking-success")).toBeInTheDocument();
    expect(screen.getByTestId("booking-success-uuid")).toHaveTextContent(BOOKING_ID);
    expect(screen.getByTestId("booking-success-meeting-type-name")).toHaveTextContent(
      "30-минутная консультация",
    );
    expect(screen.getByTestId("booking-success-summary")).toHaveTextContent(
      "30-минутная консультация · среда, 4 ноября 2026 · 09:00–09:30",
    );
    expect(screen.getByTestId("booking-success-dates")).toHaveTextContent(
      "среда, 4 ноября 2026 · 09:00–09:30",
    );
    expect(screen.getByTestId("booking-success")).not.toHaveTextContent(SLOT);
  });

  it("показывает fallback когда открыт без state (например, после reload)", () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          owner: { name: "Owner", timezone: "Europe/Moscow" },
          windowDays: 14,
          slotStepMinutes: 30,
          workingDays: [1, 2, 3, 4, 5],
          workingHours: { start: "09:00", end: "18:00" },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    renderConfirmed(null);

    expect(screen.getByTestId("confirmed-empty")).toBeInTheDocument();
    expect(screen.queryByTestId("booking-success")).not.toBeInTheDocument();
  });
});
