import "@typespec/http";

using TypeSpec.Http;

namespace BookingApi;

@route("/meeting-types")
namespace MeetingTypes {
  @doc("Создать тип встречи. Возвращает `MeetingType` с HTTP 200. Длительность, не кратная `slotStepMinutes`, отклоняется с HTTP 422 и `DomainError` с кодом `INVALID_DURATION`.")
  @post
  op create(@body body: CreateMeetingTypeRequest): MeetingType | UnprocessableDomainErrorResponse;

  @doc("Список всех типов встреч. Возвращается плоским массивом без пагинации.")
  @get
  op list(): MeetingType[];

  @doc("Получить конкретный тип встречи. Возвращает `MeetingType` с HTTP 200. Если тип не существует — HTTP 404 с `DomainError` и кодом `MEETING_TYPE_NOT_FOUND`.")
  @get
  @route("/{id}")
  op getById(@path id: string): MeetingType | NotFoundDomainErrorResponse;

  @doc("Получить свободные слоты типа встречи в текущем окне бронирования (14 дней). Возвращает `Availability` с HTTP 200. Слоты, которые уже начались, не отдаются: в сетку попадают только старты в будущем. Если тип встречи не существует — HTTP 404 с `DomainError` и кодом `MEETING_TYPE_NOT_FOUND`.")
  @get
  @route("/{id}/availability")
  op availability(@path id: string): Availability | NotFoundDomainErrorResponse;
}
