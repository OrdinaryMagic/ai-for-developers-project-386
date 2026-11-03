import { Suspense } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

import EventTypesPage from "@/features/owner/event-types/index.js";

const FIXTURE_TYPES = [
  {
    id: "11111111-1111-1111-1111-111111111111",
    name: "30-минутная консультация",
    description: "Знакомство и обсуждение задачи",
    durationMinutes: 30,
  },
  {
    id: "22222222-2222-2222-2222-222222222222",
    name: "Deep dive",
    description: "Глубокое погружение",
    durationMinutes: 60,
  },
];

function mount(initialPath = "/admin/event-types") {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Suspense fallback={<div>Загрузка…</div>}>
        <EventTypesPage />
      </Suspense>
    </MemoryRouter>,
  );
}

describe("EventTypesPage", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });
  afterEach(() => {
    fetchMock.mockRestore();
  });

  it("рендерит список типов встречи из GET /api/meeting-types", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(FIXTURE_TYPES), { status: 200 }));

    mount();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/meeting-types", { method: "GET" });
    });

    await waitFor(() => {
      expect(screen.getByTestId("event-types-page")).toBeInTheDocument();
    });
    expect(screen.getByTestId("event-types-list")).toBeInTheDocument();
    for (const mt of FIXTURE_TYPES) {
      expect(screen.getByTestId(`event-types-row-${mt.id}`)).toBeInTheDocument();
    }
  });

  it("показывает empty-state когда GET возвращает []", async () => {
    fetchMock.mockResolvedValue(new Response("[]", { status: 200 }));

    mount();

    await waitFor(() => {
      expect(screen.getByTestId("event-types-empty")).toBeInTheDocument();
    });
  });

  it("показывает banner + retry когда GET падает по сети/HTTP", async () => {
    fetchMock.mockResolvedValue(new Response("upstream broken", { status: 500 }));

    mount();

    await waitFor(() => {
      expect(screen.getByTestId("event-types-list-error")).toBeInTheDocument();
    });
    expect(screen.getByTestId("event-types-retry")).toBeInTheDocument();
  });

  it("повторный вызов через retry перезапрашивает список", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response("upstream broken", { status: 500 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(FIXTURE_TYPES), { status: 200 }));

    const user = userEvent.setup();
    mount();

    await waitFor(() => {
      expect(screen.getByTestId("event-types-list-error")).toBeInTheDocument();
    });

    await user.click(screen.getByTestId("event-types-retry"));

    await waitFor(() => {
      expect(screen.getByTestId("event-types-list")).toBeInTheDocument();
    });
    for (const mt of FIXTURE_TYPES) {
      expect(screen.getByTestId(`event-types-row-${mt.id}`)).toBeInTheDocument();
    }
    expect(screen.queryByTestId("event-types-list-error")).not.toBeInTheDocument();
  });

  it("создание: новый тип появляется в списке без перезагрузки", async () => {
    const created = {
      id: "33333333-3333-3333-3333-333333333333",
      name: "Walk-in",
      description: "Без записи",
      durationMinutes: 30,
    };

    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify(FIXTURE_TYPES), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(created), { status: 200 }));

    const user = userEvent.setup();
    mount();

    // Дожидаемся загрузки исходного списка.
    await waitFor(() => {
      expect(screen.getByTestId(`event-types-row-${FIXTURE_TYPES[0]?.id}`)).toBeInTheDocument();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await user.clear(screen.getByTestId("event-type-name"));
    await user.type(screen.getByTestId("event-type-name"), "Walk-in");
    await user.clear(screen.getByTestId("event-type-description"));
    await user.type(screen.getByTestId("event-type-description"), "Без записи");
    // duration default 30 уже валидно; чистим и набираем заново.
    await user.clear(screen.getByTestId("event-type-duration"));
    await user.type(screen.getByTestId("event-type-duration"), "30");

    await user.click(screen.getByTestId("event-type-submit"));

    await waitFor(() => {
      expect(screen.getByTestId(`event-types-row-${created.id}`)).toBeInTheDocument();
    });

    // Должен быть ровно один GET (список) и один POST.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const postCall = fetchMock.mock.calls[1];
    expect(postCall?.[0]).toBe("/api/meeting-types");
    const init = postCall?.[1] as RequestInit | undefined;
    expect(init?.method).toBe("POST");

    const body = JSON.parse(String(init?.body));
    expect(body).toEqual({
      name: "Walk-in",
      description: "Без записи",
      durationMinutes: 30,
    });
  });

  it("INVALID_DURATION с сервера → field-level ошибка", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            statusCode: 422,
            code: "INVALID_DURATION",
            message: "Длительность 15 мин не кратна шагу 30 мин.",
          }),
          { status: 422, headers: { "Content-Type": "application/json" } },
        ),
      );

    const user = userEvent.setup();
    mount();

    await waitFor(() => {
      expect(screen.getByTestId("event-types-empty")).toBeInTheDocument();
    });

    await user.clear(screen.getByTestId("event-type-name"));
    await user.type(screen.getByTestId("event-type-name"), "Без шага");
    // 15 — невалидно локально, но мы хотим протестировать СЕРВЕРНУЮ ветку;
    // снимем клиентский guard, набрав валидное число и подменив fetch?
    // Проще: подменяем правило через setError или меняем подход.
    // Решение: используем валидное число 30, но сервер всё равно вернёт 422
    // (тестируем именно обработку серверной ошибки, не клиентскую).
    await user.clear(screen.getByTestId("event-type-duration"));
    await user.type(screen.getByTestId("event-type-duration"), "30");

    await user.click(screen.getByTestId("event-type-submit"));

    await waitFor(() => {
      expect(screen.getByTestId("event-type-error-invalid-duration")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("event-type-error-banner")).not.toBeInTheDocument();
  });

  it("сетевой сбой при создании → banner + retry", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))
      .mockResolvedValueOnce(new Response("boom", { status: 500 }));

    const user = userEvent.setup();
    mount();

    await waitFor(() => {
      expect(screen.getByTestId("event-types-empty")).toBeInTheDocument();
    });

    await user.type(screen.getByTestId("event-type-name"), "X");
    await user.clear(screen.getByTestId("event-type-duration"));
    await user.type(screen.getByTestId("event-type-duration"), "30");

    await user.click(screen.getByTestId("event-type-submit"));

    await waitFor(() => {
      expect(screen.getByTestId("event-type-error-banner")).toBeInTheDocument();
    });
    expect(screen.getByTestId("event-type-retry")).toBeInTheDocument();
  });
});
