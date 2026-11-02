import "@typespec/http";

using TypeSpec.Http;

namespace BookingApi;

@route("/meeting-types")
namespace MeetingTypes {
  @doc("Создать тип встречи. Реальный HTTP-код — 200; доменная информация об успехе в теле. Клиентский SDK интерпретирует тело по типу `MeetingType`.")
  @post
  op create(@body body: CreateMeetingTypeRequest): MeetingType;

  @doc("Список всех типов встреч. Возвращается плоским массивом без пагинации.")
  @get
  op list(): MeetingType[];

  @doc("Получить конкретный тип встречи. Если не существует — тело содержит `DomainError` с кодом `MEETING_TYPE_NOT_FOUND`, HTTP-статус сервера — 404 на уровне реализации.")
  @get
  @route("/{id}")
  op getById(@path id: string): MeetingType | DomainError;

  @doc("Получить свободные слоты типа встречи в текущем окне бронирования (14 дней). Если тип встречи не существует — тело содержит `DomainError`.")
  @get
  @route("/{id}/availability")
  op availability(@path id: string): Availability | DomainError;
}
