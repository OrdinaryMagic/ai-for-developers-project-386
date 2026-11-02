import "@typespec/http";

using TypeSpec.Http;

namespace BookingApi;

@route("/config")
namespace Config {
  @doc("Получить конфигурацию владельца и его правил.")
  @get
  op getConfig(): Configuration;
}
