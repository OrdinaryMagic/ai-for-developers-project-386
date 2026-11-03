/**
 * Тест empty-state на отдельном файле: используется e2e-селектором
 * `data-testid="event-types-empty"` (см. ticket #30 acceptance criteria).
 * Держим контракт: при пустом массиве элемент существует, при непустом —
 * нет. Покрываем только этот узкий сценарий, чтобы регрессия в
 * `EventTypesList` была локализована и не мешала крупным тестам страницы.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import EventTypesPage from "@/features/owner/event-types/index.js";

describe("EventTypesPage empty state", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });
  afterEach(() => {
    fetchMock.mockRestore();
  });

  it("рендерит data-testid='event-types-empty' при пустом ответе", async () => {
    fetchMock.mockResolvedValue(new Response("[]", { status: 200 }));

    render(
      <MemoryRouter initialEntries={["/admin/event-types"]}>
        <EventTypesPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("event-types-page")).toBeInTheDocument();
    });
    // После ответа сервера [] — пустое состояние активно.
    await waitFor(() => {
      expect(screen.getByTestId("event-types-empty")).toBeInTheDocument();
    });

    const empty = screen.getByTestId("event-types-empty");
    expect(empty.tagName.toLowerCase()).toBe("p");
    expect(empty.textContent).toMatch(/нет типов встреч/i);
  });

  it("empty-state отсутствует, когда в ответе есть элементы", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            id: "id-1",
            name: "X",
            description: "Y",
            durationMinutes: 30,
          },
        ]),
        { status: 200 },
      ),
    );

    render(
      <MemoryRouter initialEntries={["/admin/event-types"]}>
        <EventTypesPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("event-types-list")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("event-types-empty")).not.toBeInTheDocument();
  });
});
