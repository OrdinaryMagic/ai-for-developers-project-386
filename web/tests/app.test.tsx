import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import App from "@/App";

describe("App", () => {
  beforeEach(() => {
    vi.spyOn(globalThis, "fetch").mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("mounts the home page at / and fetches meeting types", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("[]", {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    );

    expect(screen.getByTestId("home-page")).toBeInTheDocument();
    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith("/api/meeting-types", { method: "GET" });
    });
    expect(await screen.findByTestId("home-empty")).toBeInTheDocument();

    // Drain pending microtasks so act() reports a clean exit.
    await act(async () => {});
  });

  it("renders the not-found page for an unknown route", async () => {
    // Сервер отдаёт оболочку SPA для любого неизвестного пути
    // (SPA-fallback, ADR-0006) — клиент обязан показать 404-страницу,
    // а не пустой экран.
    render(
      <MemoryRouter initialEntries={["/owner/event-types"]}>
        <App />
      </MemoryRouter>,
    );

    expect(screen.getByTestId("not-found-page")).toBeInTheDocument();

    // Drain pending microtasks so act() reports a clean exit.
    await act(async () => {});
  });
});
