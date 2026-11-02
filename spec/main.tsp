import "@typespec/http";
import "@typespec/rest";

import "./models/configuration.tsp";
import "./models/meeting-type.tsp";
import "./models/booking.tsp";
import "./models/errors.tsp";

import "./routes/config.tsp";
import "./routes/meeting-types.tsp";
import "./routes/bookings.tsp";

using TypeSpec.Http;
using TypeSpec.Rest;

@doc("Booking API: Cal.com-подобный сервис бронирования с одним предопределённым владельцем календаря.")
@service(#{ title: "Booking API" })
@server("http://127.0.0.1:3000", "Локальный dev-сервер")
namespace BookingApi;
