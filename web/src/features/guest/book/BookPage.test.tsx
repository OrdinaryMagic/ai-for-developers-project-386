import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import BookPage from "@/features/guest/book/BookPage";

const MEETING_TYPE_ID = "11111111-1111-4111-8111-111111111111";
const MEETING_TYPE = {
  id: MEETING_TYPE_ID,
  name: "Консультация",
  description: "Знакомство",
  durationMinutes: 30,
};

function mockBookPageFetch(availability: unknown) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = typeof input === "string" ? input : input.toString();
    const body =
      url === `/api/meeting-types/${MEETING_TYPE_ID}/availability`
        ? availability
        : url === `/api/meeting-types/${MEETING_TYPE_ID}`
          ? MEETING_TYPE
          : null;
    if (body === null) throw new Error(`Unexpected fetch URL: ${url}`);
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
}

function renderBookAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/book/:meetingTypeId" element={<BookPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

const sampleAvailability = {
  meetingTypeId: MEETING_TYPE_ID,
  windowStart: "2026-11-04T00:00:00.000+03:00",
  windowEnd: "2026-11-18T00:00:00.000+03:00",
  days: [
    {
      date: "2026-11-04",
      slots: [
        "2026-11-04T09:00:00.000+03:00",
        "2026-11-04T09:30:00.000+03:00",
        "2026-11-04T10:00:00.000+03:00",
      ],
    },
    {
      date: "2026-11-05",
      slots: [
        "2026-11-05T09:00:00.000+03:00",
        "2026-11-05T09:30:00.000+03:00",
        "2026-11-05T10:00:00.000+03:00",
      ],
    },
  ],
};

describe("BookPage", () => {
  beforeEach(() => {
    vi.spyOn(globalThis, "fetch").mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("selects the first day by default and renders only its slots", async () => {
    mockBookPageFetch(sampleAvailability);
    renderBookAt(`/book/${MEETING_TYPE_ID}`);

    const dayButtons = await screen.findAllByTestId(/^day-\d{4}-\d{2}-\d{2}-button$/);
    expect(dayButtons).toHaveLength(2);
    expect(
      screen.getByText("Окно бронирования: ср, 4 ноября 2026 — вт, 17 ноября 2026"),
    ).toBeInTheDocument();

    const firstDayButton = screen.getByTestId("day-2026-11-04-button");
    const secondDayButton = screen.getByTestId("day-2026-11-05-button");
    expect(firstDayButton).toHaveTextContent("ср, 4 ноября 2026");
    expect(firstDayButton).not.toHaveTextContent("2026-11-04");
    expect(firstDayButton).toHaveAttribute("aria-pressed", "true");
    expect(secondDayButton).toHaveAttribute("aria-pressed", "false");

    const selectedDay = screen.getByTestId("day-2026-11-04");
    expect(within(selectedDay).getByRole("heading")).toHaveTextContent("ср, 4 ноября 2026");
    for (const slot of sampleAvailability.days[0]!.slots) {
      expect(within(selectedDay).getByTestId(`slot-${slot}`)).toBeInTheDocument();
    }
    for (const slot of sampleAvailability.days[1]!.slots) {
      expect(screen.queryByTestId(`slot-${slot}`)).not.toBeInTheDocument();
    }
    expect(screen.queryByTestId("day-2026-11-05")).not.toBeInTheDocument();
    expect(screen.getAllByTestId(/^slot-/)).toHaveLength(3);
  });

  it("renders at most 14 day buttons and 18 slot buttons", async () => {
    const firstDaySlots = Array.from({ length: 19 }, (_, index) => {
      const hour = 9 + Math.floor(index / 2);
      const minute = index % 2 === 0 ? "00" : "30";
      return `2026-11-04T${String(hour).padStart(2, "0")}:${minute}:00.000+03:00`;
    });
    mockBookPageFetch({
      ...sampleAvailability,
      days: Array.from({ length: 15 }, (_, index) => ({
        date: `2026-11-${String(index + 4).padStart(2, "0")}`,
        slots:
          index === 0
            ? firstDaySlots
            : [`2026-11-${String(index + 4).padStart(2, "0")}T09:00:00.000+03:00`],
      })),
    });
    renderBookAt(`/book/${MEETING_TYPE_ID}`);

    expect(await screen.findAllByTestId(/^day-\d{4}-\d{2}-\d{2}-button$/)).toHaveLength(14);
    expect(screen.getAllByTestId(/^slot-/)).toHaveLength(18);
    expect(screen.queryByTestId("day-2026-11-18-button")).not.toBeInTheDocument();
  });

  it("skips empty days when choosing the default day", async () => {
    mockBookPageFetch({
      ...sampleAvailability,
      days: [{ date: "2026-11-04", slots: [] }, sampleAvailability.days[1]!],
    });
    renderBookAt(`/book/${MEETING_TYPE_ID}`);

    expect(await screen.findByTestId("day-2026-11-05")).toBeInTheDocument();
    expect(screen.getByTestId("day-2026-11-04-button")).toBeDisabled();
    expect(screen.getByTestId("day-2026-11-04-button")).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByTestId("day-2026-11-05-button")).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByTestId("availability-empty")).not.toBeInTheDocument();
  });

  it("switches the visible slots with the keyboard and exposes the selected state", async () => {
    const user = userEvent.setup();
    mockBookPageFetch(sampleAvailability);
    renderBookAt(`/book/${MEETING_TYPE_ID}`);

    await screen.findByTestId("day-2026-11-04");
    const secondDayButton = screen.getByTestId("day-2026-11-05-button");
    secondDayButton.focus();
    expect(secondDayButton).toHaveFocus();
    await user.keyboard("{Enter}");

    expect(secondDayButton).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("day-2026-11-04-button")).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByTestId("day-2026-11-05")).toBeInTheDocument();
    expect(screen.queryByTestId("day-2026-11-04")).not.toBeInTheDocument();
    for (const slot of sampleAvailability.days[0]!.slots) {
      expect(screen.queryByTestId(`slot-${slot}`)).not.toBeInTheDocument();
    }
    for (const slot of sampleAvailability.days[1]!.slots) {
      expect(screen.getByTestId(`slot-${slot}`)).toBeInTheDocument();
    }
  });

  it("resets the selected slot and form when another day is chosen", async () => {
    const user = userEvent.setup();
    mockBookPageFetch(sampleAvailability);
    renderBookAt(`/book/${MEETING_TYPE_ID}`);

    await user.click(await screen.findByTestId(`slot-${sampleAvailability.days[0]!.slots[0]!}`));
    expect(await screen.findByTestId("booking-form")).toBeInTheDocument();
    await user.type(screen.getByTestId("booking-name"), "Иван");

    await user.click(screen.getByTestId("day-2026-11-05-button"));

    expect(screen.queryByTestId("booking-form")).not.toBeInTheDocument();
    expect(screen.queryByTestId("booking-prefilled-slot-iso")).not.toBeInTheDocument();
    expect(screen.getByTestId("day-2026-11-05-button")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("day-2026-11-05")).toBeInTheDocument();
    expect(screen.queryByTestId("day-2026-11-04")).not.toBeInTheDocument();

    await user.click(screen.getByTestId(`slot-${sampleAvailability.days[1]!.slots[0]!}`));
    expect(await screen.findByTestId("booking-name")).toHaveValue("");
  });

  it("keeps the selected day when returning from the form without submitting", async () => {
    const user = userEvent.setup();
    mockBookPageFetch(sampleAvailability);
    renderBookAt(`/book/${MEETING_TYPE_ID}`);

    await user.click(await screen.findByTestId("day-2026-11-05-button"));
    await user.click(screen.getByTestId(`slot-${sampleAvailability.days[1]!.slots[0]!}`));
    await user.click(await screen.findByTestId("booking-cancel"));

    expect(screen.getByTestId("day-2026-11-05-button")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("day-2026-11-05")).toBeInTheDocument();
    expect(screen.getByTestId(`slot-${sampleAvailability.days[1]!.slots[0]!}`)).toBeInTheDocument();
    expect(screen.queryByTestId("day-2026-11-04")).not.toBeInTheDocument();
  });

  it("disables empty days and shows a global empty state when the whole window is empty", async () => {
    const emptyDayAvailability = {
      ...sampleAvailability,
      days: [
        {
          date: "2026-11-04",
          slots: [],
        },
        {
          date: "2026-11-05",
          slots: [],
        },
      ],
    };
    mockBookPageFetch(emptyDayAvailability);
    renderBookAt(`/book/${MEETING_TYPE_ID}`);

    expect(await screen.findByTestId("day-2026-11-04-button")).toBeDisabled();
    expect(screen.getByTestId("day-2026-11-05-button")).toBeDisabled();
    expect(screen.getByTestId("availability-empty")).toHaveTextContent(
      "В окне бронирования нет свободных слотов",
    );
    expect(screen.queryByTestId(/^slot-/)).not.toBeInTheDocument();
    expect(screen.queryByTestId(/^day-\d{4}-\d{2}-\d{2}$/)).not.toBeInTheDocument();
  });
});
