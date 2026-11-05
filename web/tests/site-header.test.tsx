import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

import App from "@/App";
import { OwnerTimezoneProvider } from "@/features/owner/bookings/OwnerTimezoneContext";

/**
 * Тесты шапки приложения: ссылки на доступные страницы, активное
 * состояние текущего маршрута и переходы по ссылкам.
 */
function jsonResponse(body: unknown): Promise<Response> {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

function mockApi(): void {
  vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : (input as Request).url;
    if (url === "/api/meeting-types") return jsonResponse([]);
    if (url === "/api/bookings") return jsonResponse([]);
    if (url === "/api/config") {
      return jsonResponse({
        owner: { name: "Owner", timezone: "Europe/Moscow" },
        windowDays: 14,
        slotStepMinutes: 30,
        workingDays: [1, 2, 3, 4, 5],
        workingHours: { start: "09:00", end: "18:00" },
      });
    }
    return Promise.reject(new Error(`Unexpected fetch: ${url}`));
  });
}

function renderApp(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <OwnerTimezoneProvider>
        <App />
      </OwnerTimezoneProvider>
    </MemoryRouter>,
  );
}

describe("SiteHeader", () => {
  beforeEach(() => {
    mockApi();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("показывает ссылки на все доступные страницы", async () => {
    renderApp("/");

    const nav = screen.getByRole("navigation", { name: "Основная навигация" });
    expect(nav).toBeInTheDocument();

    expect(screen.getByRole("link", { name: "Запись" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "Бронирования" })).toHaveAttribute(
      "href",
      "/admin/bookings",
    );
    expect(screen.getByRole("link", { name: "Типы встреч" })).toHaveAttribute(
      "href",
      "/admin/event-types",
    );

    // Drain pending microtasks so act() reports a clean exit.
    await act(async () => {});
  });

  it("отмечает текущую страницу в навигации", async () => {
    renderApp("/admin/bookings");

    expect(screen.getByRole("link", { name: "Бронирования" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Запись" })).not.toHaveAttribute("aria-current");

    // Drain pending microtasks so act() reports a clean exit.
    await act(async () => {});
  });

  it("переходит на страницу типов встреч по ссылке из шапки", async () => {
    const user = userEvent.setup();
    renderApp("/");

    await user.click(screen.getByRole("link", { name: "Типы встреч" }));

    expect(await screen.findByTestId("event-types-page")).toBeInTheDocument();

    // Drain pending microtasks so act() reports a clean exit.
    await act(async () => {});
  });

  it("рендерит шапку и на странице «не найдено»", async () => {
    renderApp("/no-such-page");

    expect(screen.getByTestId("not-found-page")).toBeInTheDocument();
    expect(screen.getByTestId("site-header")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByRole("link", { name: "Запись" })).toBeInTheDocument();
    });

    // Drain pending microtasks so act() reports a clean exit.
    await act(async () => {});
  });
});
