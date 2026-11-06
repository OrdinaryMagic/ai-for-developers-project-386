import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import HomePage from "@/features/guest/index";

function renderHome() {
  return render(
    <MemoryRouter>
      <HomePage />
    </MemoryRouter>,
  );
}

function mockFetchOnce(body: unknown, init: { status?: number } = {}) {
  const response = new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "Content-Type": "application/json" },
  });
  vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(response);
}

const sampleMeetingType = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Intro chat",
  description: "Quick intro call",
  durationMinutes: 30,
};

describe("HomePage", () => {
  beforeEach(() => {
    vi.spyOn(globalThis, "fetch").mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the empty state when /api/meeting-types returns []", async () => {
    mockFetchOnce([]);
    renderHome();
    expect(await screen.findByTestId("home-empty")).toBeInTheDocument();
    expect(screen.queryByTestId("meeting-type-card")).not.toBeInTheDocument();
  });

  it("renders a card per meeting type", async () => {
    mockFetchOnce([sampleMeetingType]);
    renderHome();
    const card = await screen.findByTestId(`meeting-type-card-${sampleMeetingType.id}`);
    expect(card).toBeInTheDocument();
    expect(card).toHaveAttribute("href", `/book/${sampleMeetingType.id}`);
    expect(within(card).getByTestId("meeting-type-card")).toBeInTheDocument();
  });
});
