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

  @doc("Длительность встречи в минутах: положительное целое <= 1440 (сутки), кратное `slotStepMinutes`.")
  @minValue(1)
  @maxValue(1440)
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

  @doc("Длительность встречи в минутах. Должна быть в [1, 1440] и кратна `slotStepMinutes` (30 по умолчанию). Не-кратное значение → 422 INVALID_DURATION.")
  @minValue(1)
  @maxValue(1440)
  durationMinutes: int32;
}
