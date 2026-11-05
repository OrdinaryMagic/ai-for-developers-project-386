import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import {
  getAvailability,
  getMeetingType,
  type Availability,
  type MeetingType,
} from "@/features/guest/api";
import { BookingForm } from "@/features/guest/book/BookingForm";
import { DayAvailability } from "@/features/guest/book/DayAvailability";
import { useOwnerTimezone } from "@/features/owner/bookings/OwnerTimezoneContext";
import { formatBookingWindow } from "@/lib/dateTime";

type State =
  | { kind: "loading" }
  | { kind: "ready"; availability: Availability; meetingType: MeetingType }
  | { kind: "error"; message: string };

/**
 * `/book/:meetingTypeId` — выбор слота или заполнение брони.
 *
 * Решение по роутингу (см. commit body #33): слот выбирается локальным
 * state, а не отдельным URL. Форма появляется inline поверх сетки, и
 * только при успешном POST родитель навигирует на `/confirmed` через
 * `location.state`. Это мини-роутер без третьего маршрута
 * `/book/:id/confirm-form` и оставляет URL `/book/:id` постоянным во
 * время «выбрал слот → заполняю поля».
 */
export function BookPage() {
  const { meetingTypeId } = useParams<{ meetingTypeId: string }>();
  const { timezone } = useOwnerTimezone();
  const navigate = useNavigate();
  const [state, setState] = useState<State>({ kind: "loading" });
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);

  useEffect(() => {
    if (!meetingTypeId) {
      setState({ kind: "error", message: "Не указан тип встречи." });
      return;
    }
    let aborted = false;
    setState({ kind: "loading" });
    Promise.all([getAvailability(meetingTypeId), getMeetingType(meetingTypeId)])
      .then(([availability, meetingType]) => {
        if (aborted) return;
        setState({ kind: "ready", availability, meetingType });
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

  const handleBooked = useCallback(
    (booking: { id: string; meetingTypeId: string }) => {
      if (!meetingTypeId) return;
      navigate(`/book/${meetingTypeId}/confirmed`, {
        state: { booking },
        replace: true,
      });
    },
    [meetingTypeId, navigate],
  );

  const handleCancel = useCallback(() => {
    setSelectedSlot(null);
  }, []);

  return (
    <div data-testid="book-page" className="container py-8">
      <header className="mb-6">
        <h1 className="text-3xl font-semibold tracking-tight">Выбор слота</h1>
        {state.kind === "ready" ? (
          <p className="text-sm text-muted-foreground mt-1">
            Окно бронирования:{" "}
            {formatBookingWindow(
              state.availability.windowStart,
              state.availability.windowEnd,
              timezone,
            )}
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
      ) : selectedSlot !== null && meetingTypeId ? (
        <section className="max-w-md space-y-4">
          <h2 className="text-xl font-medium">Заполните данные</h2>
          <BookingForm
            meetingType={state.meetingType}
            slot={selectedSlot}
            onBooked={handleBooked}
            onCancel={handleCancel}
          />
        </section>
      ) : (
        <div
          data-testid="book-grid"
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
        >
          {state.availability.days.map((day) => (
            <DayAvailability key={day.date} day={day} onSlotClick={setSelectedSlot} />
          ))}
        </div>
      )}
    </div>
  );
}

export default BookPage;
