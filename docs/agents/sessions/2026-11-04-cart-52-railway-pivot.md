# 2026-11-04 — Cart #52 «Production deployment» — Railway, живой деплой, единый origin

`@implement-spec` (closure-волна) для карты **#52** «Production deployment for booking-api v1
(post-image)». Ветка интеграции: `chore/cart-52-closure` (14 коммитов) → PR **#69** → squash
**`287107e`**. Дополнения после карты: PR **#70** (`feat/web-spa-not-found`) → catch-all маршрут
SPA (squash **`2f2d01f`**), PR **#73** (`feat/web-header-nav`) → общая шапка с навигацией
(squash **`743c520`**), PR **#75** (`fix/past-slots-not-bookable`) → фикс «запись на уже
начавшийся слот не видна в списке владельца» (squash **`3898485`**).

Карта закрыта фактом: живой деплой на **Railway.io**, платформенный домен с managed TLS, и —
после жалобы «не отдаёт статику» — тот же сервис отдаёт **и API, и собранный фронтенд**
(ADR-0006, единый origin).

## Что сделано

| Коммит    | Тикет     | Артефакты                                                                                                                                  |
| --------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `e2ff515` | #52 (ADR) | `docs/adr/0005-hosting-platform-railway.md` — платформа Railway, формат IaC, модель секретов                                               |
| `bfd301b` | #54       | `.railway/railway.ts` — Railway Infrastructure as Code (source/branch, build, health-check, лимиты, реплики, env)                          |
| `bd41bc1` | #52       | `src/server.ts` — graceful shutdown по SIGTERM/SIGINT с таймаутом 10 с                                                                     |
| `200fda2` | #52       | `GLOSSARY.md`, `docs/adr/0001-…`, README «Ограничения» — упоминания платформы                                                              |
| `5dbc27b` | #57       | `scripts/production-smoke.sh` — post-deploy smoke (URL из манифеста, retry-loop, валидация env)                                            |
| `c16c372` | #62       | README «Production deploy» + `.railway/production.json` (манифест окружения с `publicUrl`) + URL-тест                                      |
| `c89abfd` | #55       | `docs/agents/production-secrets.md` + `.env.example` + drift-тест «код ↔ `.env.example` ↔ runbook»                                         |
| `d1e648b` | #56       | `docs/agents/production-dns-tls.md` — runbook DNS/TLS для Railway                                                                          |
| `8c90c4a` | #63       | `.opencode/opencode.json` (`railway-mcp`) + `docs/agents/production-mcp.md` + тест на отсутствие секретов                                  |
| `51cdbfa` | #54       | Удалены `fly.toml`, `test/helpers/toml.ts`; добавлен `test/deprecated-fly-artifacts.test.ts`                                               |
| `5ddfa5a` | #68 (ADR) | `docs/adr/0006-single-origin-spa.md` — единый origin: API и UI в одном сервисе                                                             |
| `64fee01` | #68       | `src/static-ui.ts`, `src/routes/api.ts`, `src/routes/root.ts`, `src/app.ts`, `Dockerfile` (стадия `web-builder`), `test/static-ui.test.ts` |
| `a97c600` | #68       | `scripts/production-smoke.sh` — две UI-проверки (`Accept: text/html` → `content-type: text/html`)                                          |
| `8074996` | #68       | README «UI на том же домене», «Docker», «Post-deploy smoke»; `GLOSSARY.md`; runbook DNS/TLS                                                |

Плюс PR #70: `web/src/features/shared/NotFoundPage.tsx` + маршрут `*` в `web/src/App.tsx` —
известный путь без маршрута в SPA рисовал пустую страницу.

Плюс PR #73 (отдельный тикет **#72**, вне карты): `web/src/features/shared/SiteHeader.tsx` +
`web/src/features/shared/AppLayout.tsx` — общая шапка со ссылками на доступные страницы
(«Запись» `/`, «Бронирования» `/admin/bookings`, «Типы встреч» `/admin/event-types`) и
layout-роут, чтобы шапка была на всех маршрутах, включая 404-страницу.

Плюс баг-фикс **#74** (открыт по итогам приёмки на живом стенде): «на странице бронирования
не видно записей». Root cause — окно бронирования стартует в 00:00 текущего дня, сетка
`availability` отдавала и уже прошедшие слоты, `POST /bookings` их принимал, а `GET /bookings`
по контракту возвращает только предстоящие ⇒ запись была невидима. Фикс в домене: слот с
`start <= now` не отдаётся в сетке и не бронируется (`422 OUTSIDE_WINDOW`); контракт API не
менялся, перегенерированы только `openapi.yaml` и SDK.

## Живое окружение (факт)

| Параметр         | Значение                                                                       |
| ---------------- | ------------------------------------------------------------------------------ |
| Проект           | `booking-api` — `dcdc3e6c-f49c-4040-83b8-2ced035325a4`                         |
| Окружение        | `production` — `3fce1cf2-7cd3-42f2-8288-993f1b07c0d2`                          |
| Сервис           | `booking-api` — `0032d152-af0a-48b4-96e2-4feff1eb2c9a`                         |
| Публичный адрес  | `https://booking-api-production-b3a4.up.railway.app` (managed TLS)             |
| Регион / реплики | `us-east4-eqdc4a`, 1 реплика                                                   |
| Деплой           | `6af873be-1fd6-4667-82eb-c401c80b9258` — SUCCESS, commit `743c520` (шапка SPA) |
| Деплой (фикс)    | `a38894ff-31ca-4a19-8e36-3876e14883f4` — SUCCESS, commit `3898485` (#74)       |
| Деплой (релиз)   | `9c3aebfe-b2c6-44cd-9328-8d7c23970083` — SUCCESS, commit `06d4242` (v1.2.0)    |
| Деплой (база)    | `e901cc30-20d0-4b3b-bbb7-2c7cf6c8322e` — SUCCESS, commit `287107e`             |

Проверка после деплоя: `scripts/production-smoke.sh` → **`✅ PASS: 6/6 checks passed`**
(4 API + 2 UI). Вручную: `/` → JSON для API-клиента и HTML-оболочка для браузера,
`/admin/event-types` → 200 `text/html`, `/assets/…` → 200 `application/javascript`,
`/api/config` → 200 JSON. После редеплоя с шапкой (`743c520`) — smoke снова 6/6, а в
собранном бандле (`/assets/index-BJYGgXnY.js`) есть строки навигации «Бронирования»,
«Типы встреч», `Основная навигация`.

## Приёмка на живом стенде (пункт 3 задачи владельца)

Проверено headless-браузером (Playwright, Chromium) против публичного URL — сценарий
гостя целиком через UI:

1. `/` → выбор типа встречи → `/book/:id` → выбор первого свободного слота →
   форма (имя, email) → **запись создана** (UUID на странице подтверждения);
2. `/admin/bookings` → **запись видна в списке владельца** (тип, имя, email, старт);
3. **пересекающаяся запись отклоняется**: два гостя в двух вкладках выбирают один слот —
   первый записывается, второй получает баннер «Слот уже занят, выберите другое время»
   (`409 SLOT_TAKEN`), в списке владельца по этому слоту — ровно одна строка;
4. через API: `POST /api/bookings` на пересекающийся интервал → `409 SLOT_TAKEN`,
   на уже начавшийся слот → `422 OUTSIDE_WINDOW` (фикс #74), занятый слот исчезает из
   сетки `availability`.

Отдельно — локальный прогон Docker-образа: `docker build` → `docker run --env PORT=3030`
→ `/`, `/health`, `/api/config`, SPA-оболочка — 200 ⇒ контракт «слушает `PORT`» и
единый origin соблюдены.

## Non-obvious drift

1. **Платформа сменилась: Fly.io → Railway.io** (ADR-0005 supersedes ADR-0004). В среде
   владельца нет Fly-аккаунта, `FLY_API_TOKEN` не выдан, MCP-коннект к Fly.io давал только
   read-скоупы для Managed Postgres — операций деплоя в нём не было ⇒ AC #56/#57 были
   физически невыполнимы. Переход вызван доступностью, а не качеством платформы.
2. **Railway Config as Code (`railway.toml` / `railway.json`) deprecated платформой** с
   hard cutoff **2026-12-01** ⇒ взят официальный **Infrastructure as Code**
   (`.railway/railway.ts`). Плюс: конфиг типизируется (`railway/iac` + `tsconfig.railway.json`
   в шаге `typecheck`) ⇒ опечатка в конфиге ловится на CI, а не молча игнорируется платформой.
3. **npm-пакет `railway@3.16.0` — это TypeScript SDK, а не CLI.** Его бинарник —
   `railway-iac-ts`, и он отказывается работать: «requires Railway CLI 5.42.1 or newer»
   (IaC-движок теперь живёт в CLI). Пакет в `devDependencies` нужен **только** для типизации
   `.railway/railway.ts`; настоящий CLI ставится отдельно (Railway installer, ≥ 5.42.1).
   Фактический деплой в этой сессии сделан через **Railway MCP**
   (`connect-service-source` → build/deploy из коммита `main`).
4. **Railway не задеплоил push в `main` автоматически**: после merge'а PR #69 нового
   deployment'а не появилось (source подключён, но auto-deploy не сработал) ⇒ деплой
   инициирован явно через MCP `connect-service-source` с `repo`+`branch: main`.
5. **Первый живой деплой отдавал только API.** Фронтенд не попадал в образ (`.dockerignore`
   исключал `web/` целиком, Dockerfile собирал только backend) ⇒ `/owner/event-types` и любые
   клиентские маршруты отдавали 404. Это и есть жалоба «не отдаёт статику» ⇒ лист **#68**.
6. **Алиас `/api/*` сделан вторым монтированием API-маршрутов, а не rewrite'ом в хуке.**
   Первая версия была хук `onRequest` с `request.url = stripped` — в Fastify v5 `request.url`
   **readonly-getter** («Cannot set property url of #<Request> which has only a getter»), и
   даже если бы rewrite сработал, роутинг в Fastify происходит **до** `onRequest`. Решение:
   `src/routes/api.ts` регистрируется дважды — под каноническим префиксом и под `prefix: "/api"`.
   Оба монтирования делят одни и те же сторы, поэтому состояние не расходится.
7. **`@fastify/static` перебивает `cache-control` своим заголовком** ⇒ правило «HTML —
   всегда свежий» задано хуком `onSend` (по `content-type`), а не через `setHeaders`.
   Ассеты — `maxAge: "1y"` + `immutable: true` ⇒ `public, max-age=31536000, immutable`.
8. **Кто браузер — определяет `Accept`.** `GET /` отдаёт `{"hello":"world"}` API-клиенту
   (контракт спеки) и HTML-оболочку браузеру (`Accept: text/html`). 404 под `/api/*` остаётся
   JSON — SPA-fallback не должен превращать ошибку API в HTML.
9. **Путь `web/dist` в контейнере — `/app/web/dist`**, его ищет `defaultStaticRoot()`
   (`resolve(dirname(dist/static-ui.js), "../web/dist")`) — одинаково в dev (tsx) и в проде.
10. **`web/tests` не попадают в контекст образа** (`.dockerignore`: `**/tests`, `**/*.test.ts`),
    поэтому `tsc -p tsconfig.json` внутри `web-builder` проверяет только `src` — полный
    typecheck фронтенда живёт в CI.
11. **Smoke-скрипт научился передавать `Accept` и читать `content-type`** (curl
    `--write-out '%{http_code} %{content_type}'`), иначе UI-проверки не отличили бы HTML-оболочку
    от JSON-API. Проверок стало 6 вместо 4.
12. **`buildApp()` по умолчанию ищет `web/dist` рядом с корнем проекта** ⇒ поведение зависит
    от того, собран ли фронтенд локально. Тесты, где это важно, передают `staticRoot` явно
    (фикстура в tmpdir) — иначе smoke-тест был бы зелёным в CI и красным локально.

## Code review findings

Отдельный прогон skill `code-review` по осям Standards/Spec для этой closure-волны **не
запускался**: объём — конфиг платформы + рантайм + документация, а проверка фактом (живой
деплой + smoke + локальный прогон образа) закрывала риски. Вместо ревью прогнаны:

- `make check` (`mise run check`) — **302 теста / 20 файлов**, зелёные; каждый коммит серии
  проверен отдельно (на `64fee01` — 299 тестов, зелёные).
- Локальный прогон образа: `docker build` → `docker run` → `/`, `/health`, `/api/config`,
  `/assets/…`, `/admin/event-types` с `Accept: text/html` — ожидаемые коды и content-type.
- `scripts/production-smoke.sh` против локального контейнера и против живого URL.
- Дополнения после карты (#70, #73, #75) — фронтенд-only либо доменный фикс:
  `npm --prefix web run typecheck lint test build` + `make check` + полный CI (4 job'а,
  включая Playwright e2e и сборку образа).
- Приёмка на живом стенде headless-браузером (Playwright): запись через публичную ссылку →
  видна в списке владельца; пересекающаяся запись (два гостя на одном слоте) → `409
  SLOT_TAKEN` с баннером в форме; прошедший слот → `422 OUTSIDE_WINDOW`.

## Trace

- PR **#69** — base `main`, head `chore/cart-52-closure`, 14 коммитов, **squash `287107e`**
  (`chore(deploy): production deployment для booking-api v1 — Railway, single origin, UI (#52) (#69)`).
- PR **#70** — base `main`, head `feat/web-spa-not-found`, catch-all маршрут SPA, **squash `2f2d01f`**
  (`feat(web): страница «не найдено» для неизвестных маршрутов SPA (#68) (#70)`).
- PR **#73** — base `main`, head `feat/web-header-nav`, общая шапка с навигацией, **squash `743c520`**
  (`feat(web): ссылки на доступные страницы в шапке SPA (#72) (#73)`); тикет #72 — вне карты #52.
- PR **#75** — base `main`, head `fix/past-slots-not-bookable`, фикс «запись на уже начавшийся
  слот не видна в списке владельца», **squash `3898485`**
  (`fix(bookings): слоты, которые уже начались, не бронируются (#74)`); тикет #74 закрылся
  автоматически (`Closes #74`).
- SHA в таблице «Что сделано» — **pre-squash** (ветка `chore/cart-52-closure` осталась на
  origin, SHA достижимы); squash-коммиты на `main` — `287107e`, `2f2d01f`, `743c520`, `3898485`.
- Листья закрыты merge'ом PR: **#54, #55, #57, #62, #63**; **#68** — PR #70 (`Closes #68`,
  закрылся автоматически при merge); **#72** — PR #73 (`Closes #72`); **#74** — PR #75
  (`Closes #74`).
- **#56** (DNS/TLS) закрыт комментарием: живой деплой выполнен на платформенном домене с
  managed TLS; кастомный домен `booking.example.com` делегировать нельзя ⇒ он вне scope v1,
  процедура подключения — в `docs/agents/production-dns-tls.md`.
- **#52** (карта) закрыт комментарием после резолюции — по конвенции wayfinder карты не
  закрываются авто-merge'ом.
- CI на `main` (`287107e`, `2f2d01f`, `743c520`, `3898485`): `Project checks`, `build`,
  `End-to-end tests (Playwright)`, `Build Docker image + smoke test` — success.
- Живой деплой после каждого squash: `287107e` → `e901cc30` (SUCCESS), `743c520` → `6af873be`
  (SUCCESS), `3898485` → `a38894ff` (SUCCESS), `06d4242` (релиз 1.2.0) → `9c3aebfe` (SUCCESS —
  живой стенд синхронизирован с `origin/main`); после `2f2d01f` отдельного редеплоя не было —
  коммит попал в образ `6af873be`.
- Релиз **v1.2.0** опубликован через release-PR #71 (squash `06d4242`); в его changelog —
  фичи #72/#68 и фикс #74.

## Open follow-ups

- **Auto-deploy по push в `main` не срабатывает** — деплой инициируется вручную
  (`connect-service-source` через MCP или `railway up`). Если это не разовое, а ожидаемое
  поведение платформы — оформить runbook'ом (шаг «деплой новой версии»), иначе фиксировать
  в ADR-0005.
- **CLI Railway для IaC** — нужен отдельный установленный CLI ≥ 5.42.1; npm-пакет `railway`
  в `devDependencies` даёт только типы `railway/iac`. Стоит ли вынести требование в
  `mise.toml [tools]` — открытый вопрос (npm не публикует версию ≥ 5).
- **Кастомный домен** — процедура готова, фактическое делегирование — за владельцем релиза.
- **Наблюдаемость** (Sentry/Datadog), backup/restore, multi-region — вне scope v1.
- **Shellcheck в тулчейн репо** — follow-up из прошлой сессии (AC #57 «shell check» остаётся
  пустым условием).
