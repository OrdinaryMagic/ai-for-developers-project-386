namespace BookingApi;

@doc("Подтверждённое гостем бронирование слота.")
model Booking {
  @doc("UUID v4 идентификатор.")
  @maxLength(36)
  id: string;

  @doc("UUID v4 идентификатор типа встречи, на который сделана запись.")
  meetingTypeId: string;

  @doc("Имя типа встречи на момент бронирования (снимок).")
  meetingTypeName: string;

  @doc("Имя гостя.")
  guestName: string;

  @doc("Email гостя.")
  guestEmail: string;

  @doc("Время старта встречи в формате ISO 8601 в TZ владельца.")
  startsAt: string;

  @doc("Время окончания встречи в формате ISO 8601 в TZ владельца.")
  endsAt: string;
}

@doc("Тело запроса на создание бронирования.")
model CreateBookingRequest {
  @doc("UUID v4 идентификатор типа встречи.")
  meetingTypeId: string;

  @doc("Время старта слота в формате ISO 8601 в TZ владельца.")
  startsAt: string;

  @doc("Имя гостя, введённое в форме.")
  @maxLength(120)
  guestName: string;

  @doc("Email гостя, введённый в форме.")
  @maxLength(254)
  guestEmail: string;
}

@doc("День в окне с его свободными слотами.")
model AvailabilityDay {
  @doc("Дата в формате ISO 8601 по TZ владельца (YYYY-MM-DD).")
  date: string;

  @doc("Доступные старты в этом дне, ISO 8601 (datetime в TZ владельца).")
  slots: string[];
}

@doc("Ответ с 14-дневной сеткой свободных слотов для типа встречи.")
model Availability {
  @doc("UUID v4 идентификатор типа встречи.")
  meetingTypeId: string;

  @doc("Дата начала окна в формате ISO 8601 (по TZ владельца).")
  windowStart: string;

  @doc("Дата конца окна в формате ISO 8601, исключительно — полночь первого дня за пределами окна (по TZ владельца).")
  windowEnd: string;

  @doc("Свободные слоты по дням, в TZ владельца.")
  days: AvailabilityDay[];
}
