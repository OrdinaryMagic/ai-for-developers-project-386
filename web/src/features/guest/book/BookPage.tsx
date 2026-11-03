import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

import { getAvailability, type Availability } from "@/features/guest/api";
import { DayAvailability } from "@/features/guest/book/DayAvailability";

type State =
  | { kind: "loading" }
  | { kind: "ready"; availability: Availability }
  | { kind: "error"; message: string };

export function BookPage() {
  const { meetingTypeId } = useParams<{ meetingTypeId: string }>();
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    if (!meetingTypeId) {
      setState({ kind: "error", message: "Не указан тип встречи." });
      return;
    }
    let aborted = false;
    setState({ kind: "loading" });
    getAvailability(meetingTypeId)
      .then((availability) => {
        if (aborted) return;
        setState({ kind: "ready", availability });
      })
      .catch((err: unknown) => {
        if (aborted) return;
        const message = err instanceof Error ? err.message : "Неизвестная ошибка";
        setState({ kind: "error", message });
      });
    return () => {
      aborted = true;
    };
  }, [meetingTypeId]);

  return (
    <div data-testid="book-page" className="container py-8">
      <header className="mb-6">
        <h1 className="text-3xl font-semibold tracking-tight">Выбор слота</h1>
        {state.kind === "ready" ? (
          <p className="text-sm text-muted-foreground mt-1">
            Окно бронирования: {state.availability.windowStart} → {state.availability.windowEnd}
          </p>
        ) : null}
      </header>

      {state.kind === "loading" ? (
        <p data-testid="book-page-loading" className="text-sm text-muted-foreground">
          Загрузка доступных слотов…
        </p>
      ) : state.kind === "error" ? (
        <div
          data-testid="book-page-error"
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive"
        >
          {state.message}
        </div>
      ) : (
        <div
          data-testid="book-grid"
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
        >
          {state.availability.days.map((day) => (
            <DayAvailability key={day.date} day={day} />
          ))}
        </div>
      )}
    </div>
  );
}

export default BookPage;
