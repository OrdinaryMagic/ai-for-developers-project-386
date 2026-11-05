import "@typespec/http";

using TypeSpec.Http;

namespace BookingApi;

@doc("Стабильные коды доменных ошибок v1. Клиентский SDK разбирает их напрямую, без парсинга `message`.")
enum DomainErrorCode {
  @doc("Запрашиваемый тип встречи не существует.")
  MeetingTypeNotFound: "MEETING_TYPE_NOT_FOUND",

  @doc("Запрашиваемый старт не попадает в рабочие часы владельца.")
  OutsideWorkingHours: "OUTSIDE_WORKING_HOURS",

  @doc("Запрашиваемый старт вне 14-дневного окна бронирования.")
  OutsideWindow: "OUTSIDE_WINDOW",

  @doc("Старт не выровнен по шагу слотов.")
  MismatchStep: "MISMATCH_STEP",

  @doc("Слот уже занят другим (или тем же) бронированием.")
  SlotTaken: "SLOT_TAKEN",

  @doc("Длительность типа встречи не кратна `slotStepMinutes` (HTTP 422).")
  InvalidDuration: "INVALID_DURATION",
}

@doc("Тело ответа с доменной ошибкой.")
model DomainError {
  @doc("HTTP-код ответа (4xx или 5xx).")
  statusCode: int32;

  @doc("Стабильный код ошибки для разбора на клиенте.")
  code: DomainErrorCode;

  @doc("Человекочитаемое описание ситуации.")
  message: string;
}

model NotFoundDomainErrorResponse {
  @statusCode statusCode: 404;
  @body body: DomainError;
}

model ConflictDomainErrorResponse {
  @statusCode statusCode: 409;
  @body body: DomainError;
}

model UnprocessableDomainErrorResponse {
  @statusCode statusCode: 422;
  @body body: DomainError;
}
