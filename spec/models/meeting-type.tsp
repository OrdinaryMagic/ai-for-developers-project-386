namespace BookingApi;

@doc("Категория, которую владелец делает доступной для бронирования.")
model MeetingType {
  @doc("UUID v4 идентификатор.")
  @maxLength(36)
  id: string;

  @doc("Название типа встречи.")
  @maxLength(120)
  name: string;

  @doc("Описание встречи.")
  @maxLength(2000)
  description: string;

  @doc("Длительность встречи в минутах.")
  durationMinutes: int32;
}

@doc("Тело запроса на создание типа встречи.")
model CreateMeetingTypeRequest {
  @doc("Название типа встречи.")
  @maxLength(120)
  name: string;

  @doc("Описание типа встречи.")
  @maxLength(2000)
  description: string;

  @doc("Длительность встречи в минутах; v1 — должна быть кратна `slotStepMinutes`.")
  durationMinutes: int32;
}
