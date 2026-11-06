import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { BookingsTable } from "./BookingsTable";
import { listBookings, type Booking } from "./api";

export function BookingsPage() {
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listBookings()
      .then((list) => {
        if (cancelled) {
          return;
        }
        setBookings(list);
      })
      .catch((err: unknown) => {
        if (cancelled) {
          return;
        }
        setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="container py-8" data-testid="bookings-page">
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Бронирования</h1>
      <p className="mb-4 text-sm text-muted-foreground">
        Только предстоящие бронирования — прошедшие в v1 не показываются.
      </p>

      {error !== null && (
        <div data-testid="bookings-error" className="text-sm text-destructive">
          Не удалось загрузить бронирования: {error}
        </div>
      )}

      {bookings === null && error === null && (
        <div data-testid="bookings-loading" className="text-sm text-muted-foreground">
          Загрузка…
        </div>
      )}

      {bookings !== null && bookings.length === 0 && (
        <Card className="max-w-md">
          <CardContent
            data-testid="bookings-empty"
            className="py-8 text-center text-muted-foreground"
          >
            Нет предстоящих встреч
          </CardContent>
        </Card>
      )}

      {bookings !== null && bookings.length > 0 && <BookingsTable bookings={bookings} />}
    </div>
  );
}
