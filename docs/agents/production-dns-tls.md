# Production DNS + TLS: runbook

Как booking-api v1 получает публичный домен и HTTPS-сертификат на Fly.io: какие
DNS-записи ставить, как выдаётся сертификат, как включить HTTP→HTTPS redirect и
как проверить, что всё работает.

- **Платформа:** Fly.io — решение принято в
  [ADR-0004](../adr/0004-hosting-platform.md).
- **Конфиг приложения:** [`fly.toml`](../../fly.toml) в корне репозитория.
- **Правило:** DNS-записи живут в зоне домена, сертификат — в управляемом хранилище
  Fly. В репозитории остаётся только процедура (этот файл) и ключ
  `force_https` в `fly.toml`. Секретов (и значений сертификата) в репозитории
  нет — см. [production-secrets.md](production-secrets.md).

Тикет: #56 «Public DNS + TLS». Соседние тикеты карты #52: #54 — `fly.toml`,
#55 — секреты, #57 — post-deploy smoke, #62 — канонический публичный URL в
репозитории.

> **Статус процедуры.** В среде разработки нет живого Fly-аккаунта и реального
> домена, поэтому фактическое provisioning не выполнялся: все шаги ниже —
> инструкция владельцу релиза, а не отчёт о выполненных действиях. Каждый шаг
> проверен по документации Fly (сверено **2026-11-04**, ссылки в разделе
> «Связи»).

## Коротко

```bash
# 0. Приложение Fly (имя глобально-уникально) — см. шаг 0.
fly apps create booking-api
fly status                      # фактический hostname приложения

# 1. Тип DNS-записи: CNAME для поддомена, A+AAAA для apex (см. шаг 1).
# 2. Адреса приложения для A/AAAA (см. шаг 2).
fly ips list

# 3. Выдача сертификата: Fly печатает нужные DNS-записи (см. шаг 3).
fly certs add booking.example.com

# 4. Статус сертификата и валидации DNS (см. шаг 4).
fly certs check booking.example.com

# 5. HTTP→HTTPS redirect — ключ force_https = true в fly.toml → fly deploy.

# 6. Проверки после provisioning (AC #56) — см. шаг 6.
curl -sS -o /dev/null -w '%{http_code}\n' https://booking.example.com/          # 200
curl -sS https://booking.example.com/health                                     # {"status":"ok"}
curl -sS https://booking.example.com/config                                     # Configuration JSON
```

## Что нужно от владельца релиза

- домен (или поддомен) и доступ к его DNS-зоне;
- Fly-аккаунт с доступом к приложению `booking-api`;
- приложение уже задеплоено (`fly deploy`) — без работающей машины сертификат
  не проверить.

## Шаг 0. Имя Fly-приложения (глобально-уникально)

Имя приложения берётся из ключа `app` в [`fly.toml`](../../fly.toml):

```toml
app = "booking-api"
```

Имя **глобально-уникально** на fly.io: если `booking-api` уже занят, `fly apps
create booking-api` не пройдёт. Тогда владелец:

1. создаёт приложение под другим именем (`fly apps create booking-api-<суффикс>`);
2. **в том же PR** правит ключ `app` в `fly.toml` — иначе `fly deploy` из
   репозитория продолжит деплоить чужое/старое приложение;
3. сверяет фактический hostname с записанным в репозитории каноническим URL
   (`fly status`) — это требование тикета #62.

```bash
fly apps create booking-api
fly status          # фактический hostname приложения (напр. booking-api.fly.dev)
```

## Шаг 1. Тип DNS-записи

Выбор зависит от того, что именно мы хостим — поддомен или apex-домен.

| Что хостим                       | Тип записи   | Куда указывает                                       | Комментарий                                                                           |
| -------------------------------- | ------------ | ---------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Поддомен (`booking.example.com`) | **CNAME**    | `<app>.fly.dev` (уникальный CNAME-target приложения) | Рекомендованный способ для поддоменов. Не требует знания IP, переживает смену адресов |
| Apex-домен (`example.com`)       | **A + AAAA** | IP-адреса приложения (шаг 2)                         | CNAME на apex невозможен — см. предупреждение ниже                                    |

**⚠️ CNAME на apex невозможен.** Имя с CNAME не может иметь других DNS-записей
(у apex обязательно есть SOA/NS), поэтому CNAME-запись на корне домена
невалидна. Часть провайдеров умеет «CNAME flattening» (ANAME/ALIAS) — Fly
настоятельно не рекомендует такую схему: «Setting CNAME records for the apex
domain can be problematic, and should be avoided unless your DNS provider
supports CNAME flattening. In general, we recommend setting A/AAAA records on
the apex domain».

**Не смешивайте CNAME и A/AAAA** для одного имени: «You need either A **and**
AAAA records, or a single CNAME record pointing to Fly (don't mix CNAME with
A/AAAA)» — docs Fly, раздел «Troubleshoot your deployment».

Дополнительные записи, которые Fly может попросить (нужны не всегда):

| Запись                    | Тип   | Когда нужна                                                                                                                            |
| ------------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `_acme-challenge.<домен>` | CNAME | DNS-01 challenge: wildcard-сертификат или выпуск сертификата **до** переключения трафика. Target — вида `example.com.XXXXX.flydns.net` |
| `_fly-ownership.<домен>`  | TXT   | Подтверждение владения доменом: домен за CDN/прокси, свой сертификат или решение не выделять IPv6                                      |

Обе записи показывает `fly certs setup <домен>` (или dashboard → Certificates) —
вместе с точными значениями.

## Шаг 2. Адреса приложения (A / AAAA)

Для apex-варианта адреса приложения нужны обязательно (это цель A/AAAA); для
CNAME-схемы их полезно знать, чтобы проверить, что CNAME ведёт туда же:

```bash
fly ips list       # IP-адреса, выделенные приложению
fly ips allocate   # выделить IPv4/IPv6, если их нет (нужно для A/AAAA)
```

Альтернатива — MCP-инструмент Fly `list_app_ips`: тот же список адресов, если в
окружении подключён Fly MCP со scope на чтение приложений. В текущем
окружении Fly MCP отдаёт только контекст подключения и инструменты Managed
Postgres (`list_app_ips` не экспонирован) — проверено 2026-11-04.

**Важно для выпуска и обновления сертификата:** Fly должен иметь возможность
проверить домен хотя бы одним способом — через AAAA-запись, указывающую на
приложение, через CNAME `_acme-challenge` или через TXT `_fly-ownership`.
Практический вывод: **не удаляйте AAAA-запись**, даже если трафик идёт по CNAME.

## Шаг 3. Выдача сертификата

```bash
fly certs add booking.example.com
```

Команда «Add a certificate for an application. Takes a hostname as a parameter
for the certificate» — она привязывает домен к приложению и печатает
применимые варианты DNS-конфигурации для вашего случая (какие именно записи
поставить: A/AAAA или CNAME, какие значения).

Дальше Fly сам валидирует домен и выпускает сертификат Let's Encrypt —
внешний ACME-клиент и cron для этого не нужны. Способы валидации, которые
использует Fly:

- **TLS-ALPN** — предпочтительный, работает автоматически при прямом соединении;
- **HTTP-01** — fallback, если TLS-ALPN недоступен;
- **DNS-01** — вручную, через `_acme-challenge` CNAME (нужен для wildcard и для
  выпуска сертификата до переключения трафика).

Wildcard-домен требует кавычек, иначе shell развернёт `*`:

```bash
fly certs add "*.example.com"
```

Статусы сертификата (поле `status` в ответе Certificates API):

| Статус               | Что означает                                                                  |
| -------------------- | ----------------------------------------------------------------------------- |
| `pending_validation` | DNS-записи выставлены, но валидация домена ещё не пройдена                    |
| `pending_ownership`  | Владение доменом не подтверждено (актуально для импортированных сертификатов) |
| `active`             | Сертификат выпущен и отдаётся Fly Proxy                                       |

## Шаг 4. Проверка сертификата и DNS

```bash
fly certs list                        # сертификаты приложения
fly certs check booking.example.com  # статус сертификата + проверка DNS-конфигурации
fly certs setup booking.example.com  # какие DNS-записи поставить (если ещё не поставили)
```

`fly certs check` «trigger a check on the domain validation and DNS
configuration for the given hostname» — то есть перепроверяет DNS по факту и
возвращает разрешённые адреса и ошибки валидации (в ответе Certificates API это
поля `validation`, `validation_errors` и `dns_records`).

Статус должен стать `active`. Если остаётся `pending_*` — см. «Диагностика».

## Шаг 5. HTTP→HTTPS redirect

В [`fly.toml`](../../fly.toml) в секции `[http_service]` выставлен ключ:

```toml
[http_service]
internal_port = 3000
force_https = true
```

По документации Fly, `force_https` — «A Boolean which determines whether to
enforce HTTP to HTTPS redirects». Fly Proxy на порту 80 отвечает редиректом
(3xx) на `https://` — отдельного приложения для этого не нужно. Конкретный
код ответа в документации Fly не зафиксирован: смотрите фактический `Location`
в ответе.

`fly.toml` — конфиг деплоя, поэтому новое значение применяется только после
деплоя:

```bash
fly deploy
```

Оговорка: `force_https = true` несовместим с Flycast — внутренняя сеть Flycast
HTTP-only, и для неё ключ должен быть `false`. booking-api публикуется наружу и
Flycast не использует, поэтому здесь `true` — корректное значение.

## Шаг 6. Проверки после provisioning

Это acceptance criteria тикета #56, оформленные как команды (после
`fly certs add`, выставления DNS-записей и `fly deploy`):

```bash
# / → 200
curl -sS -o /dev/null -w '%{http_code}\n' https://booking.example.com/

# /health → 200 {"status":"ok"}
curl -sS -w '\n%{http_code}\n' https://booking.example.com/health

# /config → 200 Configuration JSON
curl -sS -w '\n%{http_code}\n' https://booking.example.com/config

# HTTP→HTTPS redirect: 3xx на http:// и Location с https://
curl -sSI http://booking.example.com/ | head -3
```

Ожидается: `200`, `{"status":"ok"}`, валидный JSON конфигурации владельца
(`GET /config` отдаёт `OwnerConfig` — см. `src/routes/config.ts`) и редирект с
`http://` на `https://`.

Полный post-deploy smoke (включая `GET /meeting-types`) — отдельная
процедура тикета #57, `scripts/production-smoke.sh https://booking.example.com`.

## Авто-ренью сертификата

Отдельный cron и ACME-клиент **не нужны**: сертификат Let's Encrypt выпускает и
обновляет сам Fly — это «automatic Let's Encrypt certificates that Fly.io
manages for you».

Условие, без которого ренью не пройдёт: Fly должен иметь возможность проверить
домен. По документации — «To issue or renew a certificate, Fly.io needs to
verify your domain through at least one of: an IPv6 address (AAAA record)
pointing to your app, a CNAME `_acme-challenge`, or a `_fly-ownership` TXT
record». Практически: держите AAAA-запись (или `_acme-challenge` CNAME) — иначе
ренью упадёт, а просроченный сертификат уронит HTTPS.

Ограничения Let's Encrypt (дедупликация и защита от флуда) — учитывайте при
экспериментах с несколькими доменами:

- 50 сертификатов на зарегистрированный домен в неделю;
- 5 дубликатов одного сертификата в неделю;
- 5 неуспешных валидаций на одно имя в час;
- ренью **не** учитывается в лимите «50 в неделю».

Если увидели `rate_limited_until` в ответе Certificates API — сбросить лимит
нельзя, надо ждать окна.

## Диагностика

### Сертификат в статусе `pending_*`

1. `fly certs check <домен>` — показывает, что именно Fly не смог проверить
   (`validation`, `validation_errors` с подсказкой `remediation`).
2. Проверьте DNS-записи, которые Fly просил (`fly certs setup <домен>`):
   - для CNAME-схемы — CNAME на `<app>.fly.dev`;
   - для A/AAAA-схемы — **и** A, **и** AAAA (или хотя бы один способ валидации
     из списка выше);
   - для DNS-01 — CNAME `_acme-challenge.<домен>` на выданный target.
3. Проверьте, что DNS-записи уже разошлись (см. ниже) — валидация идёт по
   публичному DNS, кэш может отдавать старое значение.
4. Проверьте CAA-записи (см. ниже).
5. Для wildcard-сертификата обязателен DNS-01 — HTTP-01 и TLS-ALPN wildcard не
   покрывают.

### DNS не сошёлся

```bash
dig +short booking.example.com          # что реально резолвится
dig +short AAAA booking.example.com      # IPv6-запись есть?
dig +short CNAME booking.example.com     # CNAME-запись есть?
dig booking.example.com                  # полная картина + TTL
fly ips list                             # адреса приложения — совпадают с A/AAAA?
```

- **TTL.** Правка DNS-записи не мгновенна: смотрите TTL в выводе `dig` и
  ждите его истечения (плюс кэш резолверов). При смене CNAME-таргета или при
  переносе с IP на CNAME заложите время на распространение.
- **Сверьте с `fly ips list`:** A/AAAA-записи должны указывать на адреса,
  выделенные приложению.
- **Не смешивайте схемы:** одновременно висящие A/AAAA и CNAME — частая причина
  «то работает, то нет».

### CAA-записи

CAA (RFC 8659) ограничивает, кто вообще может выпустить сертификат для
домена. Если в вашей зоне есть CAA-запись, а Let's Encrypt в ней не
разрешён, выпуск не пройдёт — сертификат останется в `pending_validation`.
CA смотрит **ближайшую** CAA-запись к имени (можно переопределить её на
поддомене) и **следует CNAME** при проверке.

```bash
dig +short CAA example.com
dig +short CAA booking.example.com
```

Если CAA-записи нет — ничего делать не нужно (по умолчанию сертификат может
выпустить любой публичный CA). Если есть и Let's Encrypt не разрешён — добавьте
`letsencrypt.org` (для Fly это именно Let's Encrypt) или уберите запись.
Источник поведения — документация Let's Encrypt
(<https://letsencrypt.org/docs/caa/>), сверено 2026-11-04.

### 502 / 503 от Fly Proxy

```bash
fly logs            # логи приложения
fly checks list     # результаты health-check'ов
fly status          # состояние машин
```

- **502 Bad Gateway** — приложение не ответило прокси. Чаще всего не хватило
  времени на старт: увеличьте `grace_period` в `[[http_service.checks]]`
  (в `fly.toml` сейчас 10s).
- **503 Service Unavailable** — нет ни одной здоровой машины: все машины
  остановлены или не проходят health-check. У нас `min_machines_running = 1` и
  `auto_stop_machines = "off"` (тикет #54), поэтому «нулевая» машина — это
  либо не завершившийся деплой, либо упавший процесс.
- **Health-check жёсткий:** Fly Proxy ждёт 2xx. Наш `GET /health` отдаёт
  `{"status":"ok"}` — редиректов и ошибок в нём быть не должно.

### Ошибки в `fly certs check`

Поля `validation_errors` в ответе содержат код, текст и `remediation` —
начинайте с них.

## Откат

### Снять сертификат

```bash
fly certs list
fly certs remove booking.example.com   # -y, чтобы без подтверждения
```

Флаг `--acme` останавливает только выпуск ACME-сертификатов (свой сертификат,
если он есть, продолжит отдаваться), `--custom` — удаляет только свой
сертификат, оставляя ACME. После снятия домен перестаёт работать по HTTPS;
`https://<app>.fly.dev` продолжает работать — у него свой сертификат.

### Откатить HTTP→HTTPS redirect

1. Убрать `force_https = true` (или поставить `false`) в `fly.toml`;
2. `fly deploy`;
3. проверить: `curl -sSI http://booking.example.com/` больше не отдаёт редирект.

### Сменить домен

Порядок без простоя:

1. `fly certs add <новый-домен>` — выпустить сертификат заранее (для этого
   используйте DNS-01 `_acme-challenge`, чтобы не переключать трафик до
   готовности сертификата);
2. дождаться статуса `active` (`fly certs check <новый-домен>`);
3. переключить DNS-записи на новый домен;
4. поправить канонический URL в репозитории (тикет #62) и ссылку на runbook;
5. снять старый сертификат: `fly certs remove <старый-домен>`.

## Что этот runbook не покрывает

- **Wildcard-домены** (вне scope тикета #56) — процедура та же, но нужен
  DNS-01 и wildcard-имя в `fly certs add "*.example.com"`.
- **Multi-env DNS** (dev/staging/prod на разных доменах) и **WAF** — вне
  scope.
- **Импорт собственного сертификата** (`fly certs import`) — не нужен: у Fly
  managed Let's Encrypt. Описан в docs Fly, но вне нашего сценария.
- **Собственный ACME-cron** — не нужен, ренью делает Fly.
- **Фактический прогон** всех шагов: требует живого Fly-аккаунта и домена,
  которых в среде разработки нет.

## Связи

- [`fly.toml`](../../fly.toml) — конфиг приложения: `app` (имя), `[env]`,
  health-check, `force_https` (HTTP→HTTPS redirect).
- [production-secrets.md](production-secrets.md) — секреты (`fly secrets set`),
  конфигурация владельца; DNS/TLS с секретами не пересекаются.
- [ADR-0004 — Размещение Booking API v1 на managed-платформе (Fly.io)](../adr/0004-hosting-platform.md):
  платформа выбрана, managed TLS — часть принятого решения.
- Тикет #54 — `fly.toml` (сервис, health-check, `[env]`, регион).
- Тикет #55 — секреты в production.
- Тикет #56 — этот runbook (`force_https` + процедура DNS/TLS).
- Тикет #57 — post-deploy smoke против реального URL.
- Тикет #62 — канонический публичный URL в репозитории (выводится из `app`).
- [ADR-0001 — In-memory store with restart reset](../adr/0001-in-memory-store-with-restart-reset.md):
  рестарт Machines стирает записи — `fly deploy` из этого runbook'а тоже.
- Источники поведения Fly (сверено **2026-11-04**):
  [Custom domains](https://docs.fly.io/networking/custom-domain/),
  [`fly certs add`](https://docs.fly.io/flyctl/cmd/fly_certs_add/),
  [`fly certs remove`](https://docs.fly.io/flyctl/cmd/fly_certs_remove/),
  [`fly certs`](https://docs.fly.io/flyctl/cmd/fly_certs/),
  [`fly ips list`](https://docs.fly.io/flyctl/cmd/fly_ips_list/),
  [Certificates resource (API)](https://docs.fly.io/machines/api/certificates-resource/),
  [TLS termination by Fly Proxy](https://docs.fly.io/security/tls-termination/),
  [`fly.toml` reference](https://docs.fly.io/reference/configuration/),
  [Troubleshoot your deployment](https://docs.fly.io/getting-started/troubleshooting/),
  [CAA — Let's Encrypt](https://letsencrypt.org/docs/caa/).
