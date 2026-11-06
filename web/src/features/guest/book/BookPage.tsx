import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { Button } from "@/components/ui/button";
import {
  getAvailability,
  getMeetingType,
  type Availability,
  type MeetingType,
} from "@/features/guest/api";
import { BookingForm } from "@/features/guest/book/BookingForm";
import { DayAvailability } from "@/features/guest/book/DayAvailability";
import { useOwnerTimezone } from "@/features/owner/bookings/OwnerTimezoneContext";
import { formatBookingWindow, formatDay } from "@/lib/dateTime";

type State =
  | { kind: "loading" }
  | { kind: "ready"; availability: Availability; meetingType: MeetingType }
  | { kind: "error"; message: string };

/**
 * `/book/:meetingTypeId` — выбор слота или заполнение брони.
 *
 * День и слот выбираются локальным state, а не отдельным URL. Список дней
 * остаётся доступным, а форма заменяет слоты выбранного дня. Только при
 * успешном POST родитель навигирует на `/confirmed` через `location.state`.
 * URL `/book/:id` остаётся постоянным во время «выбрал слот → заполняю поля».
 */
export function BookPage() {
  const { meetingTypeId } = useParams<{ meetingTypeId: string }>();
  const { timezone } = useOwnerTimezone();
  const navigate = useNavigate();
  const [state, setState] = useState<State>({ kind: "loading" });
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);

  useEffect(() => {
    if (!meetingTypeId) {
      setState({ kind: "error", message: "Не указан тип встречи." });
      return;
    }
    let aborted = false;
    setState({ kind: "loading" });
    setSelectedDay(null);
    setSelectedSlot(null);
    Promise.all([getAvailability(meetingTypeId), getMeetingType(meetingTypeId)])
      .then(([availability, meetingType]) => {
        if (aborted) return;
        setState({ kind: "ready", availability, meetingType });
        setSelectedDay(
          availability.days.slice(0, 14).find((day) => day.slots.length > 0)?.date ?? null,
        );
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

  const selectedAvailabilityDay =
    state.kind === "ready"
      ? state.availability.days.find((day) => day.date === selectedDay)
      : undefined;

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
      ) : (
        <div data-testid="book-grid" className="space-y-6">
          <div
            data-testid="day-buttons"
            role="group"
            aria-label="Дни бронирования"
            className="flex flex-wrap gap-2"
          >
            {state.availability.days.slice(0, 14).map((day) => (
              <Button
                key={day.date}
                type="button"
                size="sm"
                variant={day.date === selectedDay ? "default" : "outline"}
                data-testid={`day-${day.date}-button`}
                aria-pressed={day.date === selectedDay}
                disabled={day.slots.length === 0}
                onClick={() => {
                  if (day.date === selectedDay) return;
                  setSelectedDay(day.date);
                  setSelectedSlot(null);
                }}
              >
                {formatDay(day.date, timezone)}
              </Button>
            ))}
          </div>
          {selectedSlot !== null && meetingTypeId ? (
            <section className="max-w-md space-y-4">
              <h2 className="text-xl font-medium">Заполните данные</h2>
              <BookingForm
                meetingType={state.meetingType}
                slot={selectedSlot}
                onBooked={handleBooked}
                onCancel={handleCancel}
              />
            </section>
          ) : selectedAvailabilityDay ? (
            <DayAvailability
              key={selectedAvailabilityDay.date}
              day={selectedAvailabilityDay}
              onSlotClick={setSelectedSlot}
            />
          ) : (
            <p
              data-testid="availability-empty"
              role="status"
              className="rounded-md border border-dashed p-6 text-sm text-muted-foreground"
            >
              В окне бронирования нет свободных слотов. Попробуйте позже.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default BookPage;
