import "@typespec/http";

using TypeSpec.Http;

namespace BookingApi;

@doc("Конфигурация владельца и его правил: TZ, рабочие часы, шаг слотов, длина окна бронирования.")
model Configuration {
  @doc("Имя и TZ владельца календаря.")
  owner: Owner;

  @doc("Длина катящегося окна бронирования в календарных днях (v1: 14).")
  windowDays: int32;

  @doc("Шаг между соседними возможными стартами слотов в минутах (v1: 30).")
  slotStepMinutes: int32;

  @doc("Рабочие часы владельца в его TZ.")
  workingHours: WorkingHours;
}

@doc("Владелец календаря.")
model Owner {
  @doc("Имя, отображается в UI владельца и гостя.")
  @maxLength(120)
  name: string;

  @doc("IANA TZ владельца (например, `Europe/Moscow`).")
  timezone: string;
}

@doc("Рабочие часы владельца внутри суток, выражены в TZ владельца.")
model WorkingHours {
  @doc("Время начала рабочего дня в формате HH:MM (24-часовой).")
  start: string;

  @doc("Время конца рабочего дня в формате HH:MM.")
  end: string;
}
