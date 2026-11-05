import { Link, useLocation } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import type { Booking } from "@/features/guest/book/api";
import { useOwnerTimezone } from "@/features/owner/bookings/OwnerTimezoneContext";
import { formatBookingDateAndTime } from "@/lib/dateTime";

/**
 * Route-state session, переданный из {@link BookingForm} при успешном
 * `POST /bookings`. Делаем поля явными, чтобы TS не давал забыть обновить
 * `ConfirmedPage`, если source of truth изменится.
 */
interface ConfirmedState {
  booking: Booking;
}

/**
 * Success-route `/book/:meetingTypeId/confirmed`.
 *
 * Данные приходят через `location.state` — это результат успешного
 * `POST /bookings`, прокинутый из {@link BookingForm} через родительский
 * {@link BookPage}. Если пользователь сюда попал без state (например,
 * перезагрузил страницу), показываем короткий fallback со ссылкой
 * обратно на сетку слотов — иначе UUID и даты рендерить нечем.
 */
export function ConfirmedPage() {
  const { timezone } = useOwnerTimezone();
  const location = useLocation();
  const state = location.state as ConfirmedState | null;
  const booking = state?.booking;

  if (!booking) {
    return (
      <div data-testid="confirmed-empty" className="container py-8">
        <h1 className="text-3xl font-semibold tracking-tight">Бронь подтверждена</h1>
        <p className="text-sm text-muted-foreground mt-2">
          Страница открыта без данных брони — обновите предыдущий экран или вернитесь к списку
          слотов.
        </p>
        <Button asChild variant="outline" className="mt-4">
          <Link to="/">На главную</Link>
        </Button>
      </div>
    );
  }

  return (
    <div data-testid="booking-success" className="container py-8">
      <h1 className="text-3xl font-semibold tracking-tight">Бронь подтверждена</h1>
      <p className="text-sm text-muted-foreground mt-1">
        Можно закрыть вкладку — на email мы прислали подтверждение.
      </p>

      <Card className="mt-6 max-w-xl">
        <CardHeader>
          <CardTitle data-testid="booking-success-summary" className="text-lg">
            <span data-testid="booking-success-meeting-type-name">{booking.meetingTypeName}</span>
            {" · "}
            <span data-testid="booking-success-dates">
              {formatBookingDateAndTime(booking.startsAt, booking.endsAt, timezone)}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div>
            <p className="text-muted-foreground">Идентификатор брони</p>
            <p data-testid="booking-success-uuid" className="font-mono break-all">
              {booking.id}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Кто придёт</p>
            <p>
              {booking.guestName} ({booking.guestEmail})
            </p>
          </div>
        </CardContent>
      </Card>

      <Button asChild variant="outline" className="mt-6">
        <Link to="/">На главную</Link>
      </Button>
    </div>
  );
}

export default ConfirmedPage;
