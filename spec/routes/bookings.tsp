import "@typespec/http";

using TypeSpec.Http;

namespace BookingApi;

@route("/bookings")
namespace Bookings {
  @doc("Создать бронирование на свободный слот. Возвращает `Booking` с HTTP 200. Доменные отказы приходят как `DomainError`: `MEETING_TYPE_NOT_FOUND` — 404, `SLOT_TAKEN` — 409, `OUTSIDE_WORKING_HOURS`/`OUTSIDE_WINDOW`/`MISMATCH_STEP` — 422. Слот, который уже начался, не бронируется: `OUTSIDE_WINDOW`. Идемпотентность: повтор того же `slotKey` возвращает `SLOT_TAKEN`.")
  @post
  op create(@body body: CreateBookingRequest):
    | Booking
    | NotFoundDomainErrorResponse
    | ConflictDomainErrorResponse
    | UnprocessableDomainErrorResponse;

  @doc("Список предстоящих бронирований владельца. Без пагинации, ASC по `startsAt`, только будущие.")
  @get
  op list(): Booking[];
}
