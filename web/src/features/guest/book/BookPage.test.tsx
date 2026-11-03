import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import BookPage from "@/features/guest/book/BookPage";

const MEETING_TYPE_ID = "11111111-1111-4111-8111-111111111111";

function mockFetchOnce(
  url: string | RegExp,
  body: unknown,
  init: { status?: number; ok?: boolean } = {},
) {
  const status = init.status ?? 200;
  const ok = init.ok ?? (status >= 200 && status < 300);
  const response = {
    ok,
    status,
    json: async () => body,
  } as unknown as Response;
  const fetchSpy = vi.spyOn(globalThis, "fetch");
  fetchSpy.mockImplementationOnce(async (input) => {
    const resolved = typeof input === "string" ? input : input.toString();
    if (typeof url === "string" ? resolved === url : url.test(resolved)) {
      return response;
    }
    throw new Error(`Unexpected fetch URL: ${resolved}`);
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

  it("renders a 14-day grid: 2 days × 3 slots → 6 slot buttons", async () => {
    mockFetchOnce(
      new RegExp(`/api/meeting-types/${MEETING_TYPE_ID}/availability$`),
      sampleAvailability,
    );
    renderBookAt(`/book/${MEETING_TYPE_ID}`);

    const dayContainers = await screen.findAllByTestId(/^day-\d{4}-\d{2}-\d{2}$/);
    expect(dayContainers).toHaveLength(2);

    const day1 = screen.getByTestId("day-2026-11-04");
    expect(within(day1).queryByTestId("day-empty")).not.toBeInTheDocument();
    for (const slot of sampleAvailability.days[0]!.slots) {
      expect(within(day1).getByTestId(`slot-${slot}`)).toBeInTheDocument();
    }

    const day2 = screen.getByTestId("day-2026-11-05");
    for (const slot of sampleAvailability.days[1]!.slots) {
      expect(within(day2).getByTestId(`slot-${slot}`)).toBeInTheDocument();
    }

    const allSlots = await screen.findAllByTestId(/^slot-/);
    expect(allSlots).toHaveLength(6);
  });

  it("shows day-empty when a day has zero slots", async () => {
    const emptyDayAvailability = {
      ...sampleAvailability,
      days: [
        {
          date: "2026-11-04",
          slots: [],
        },
      ],
    };
    mockFetchOnce(
      new RegExp(`/api/meeting-types/${MEETING_TYPE_ID}/availability$`),
      emptyDayAvailability,
    );
    renderBookAt(`/book/${MEETING_TYPE_ID}`);
    const day = await screen.findByTestId("day-2026-11-04");
    expect(within(day).getByTestId("day-empty")).toBeInTheDocument();
  });
});
