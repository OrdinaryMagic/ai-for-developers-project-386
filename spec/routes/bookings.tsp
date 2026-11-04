import "@typespec/http";

using TypeSpec.Http;

namespace BookingApi;

@route("/bookings")
namespace Bookings {
  @doc("Создать бронирование на свободный слот. Коды `SLOT_TAKEN`/`MEETING_TYPE_NOT_FOUND`/`OUTSIDE_WORKING_HOURS`/`OUTSIDE_WINDOW`/`MISMATCH_STEP` приходят в теле как `DomainError`; сервер выставляет HTTP 409/404/422 на уровне реализации. Слот, который уже начался, не бронируется: `OUTSIDE_WINDOW`. Идемпотентность: повтор того же `slotKey` возвращает `SLOT_TAKEN`.")
  @post
  op create(@body body: CreateBookingRequest): Booking | DomainError;

  @doc("Список предстоящих бронирований владельца. Без пагинации, ASC по `startsAt`, только будущие.")
  @get
  op list(): Booking[];
}
