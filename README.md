# Сценарий: от создания типа встречи до записи в списке владельца

Краткий happy-path через приложение v1: владелец создаёт тип встречи → гость
выбирает свободный слот и записывается → запись появляется в списке владельца.
Архитектурный референс — Cal.com, но названия страниц, URL и данные ниже —
наши собственные. Подробная модель, AC и ограничения —
[GLOSSARY.md](GLOSSARY.md) и [docs/adr/](docs/adr/).

## 1. Владелец создаёт тип встречи

1. Открыть `/owner/event-types` и нажать **Создать**.
2. Заполнить минимум: **название**, **длительность** (мин); опционально —
   **описание**. Часовой пояс и рабочие часы владельца приходят из
   `OwnerConfig` (`GET /config`) — см.
   [GLOSSARY → Configuration](GLOSSARY.md).
3. Сохранить — тип встречи опубликован. Слот-расписание считается
   автоматически из `WorkingHours × SlotStep` внутри [Window](GLOSSARY.md)
   (по умолчанию — катящиеся 14 календарных дней от сегодня, TZ владельца).
4. Публичной ссылки «с человекочитаемым URL» нет — единственная гостевая
   страница это `/`, без `username/slug`. Владелец ровно один на развёртывание.

## 2. Гость записывается на свободный слот

1. Открыть `/` — главная страница без регистрации.
2. В списке карточек выбрать подходящую `MeetingType` → переход на
   `/book/{id}`.
3. На сетке видны свободные слоты на ближайшие 14 дней, времена в TZ
   владельца; выбрать удобный.
4. Заполнить форму: **имя**, **email** — единственные обязательные поля.
5. **Submit**. Возможные результаты:
   - **Success** — страница с UUID бронирования (формат UUID v4) и
     названием выбранной `MeetingType`.
   - **SLOT_TAKEN (409)** — баннер в форме: слот уже занят параллельной
     записью. Параллелизм сериализуется одной `AsyncLock` на `BookingStore`,
     см.
     [ADR-0002](docs/adr/0002-single-writer-in-memory-store.md).

## 3. Запись появляется у владельца

1. Открыть `/owner/bookings/upcoming`.
2. Только что созданная `Booking` видна во вкладке «Предстоящие»: тип
   встречи, имя и email гостя, дата и время начала.
3. Клик по строке открывает детали бронирования.

> **Что v1 не делает** (полный список —
> [GLOSSARY → Out of scope для v1](GLOSSARY.md)): подтверждение владельцем
> (запись сразу активна), reschedule/cancel гостем, редактирование и удаление
> типов встреч, просмотр прошедших бронирований, уведомления, интеграции с
> внешними календарями, i18n и переключение TZ на стороне гостя,
> несколько владельцев на одно развёртывание.

---

## Каркас приложения

Стек: **TypeScript + Fastify** (API), Vite + shadcn/ui (фронтенд, будет добавлен), **oxlint/oxfmt**, **vitest**, **mise**, **hk**, Makefile, Conventional Commits.

### Запуск

```bash
make install   # инструменты mise + npm-зависимости
make dev       # dev-сервер API (tsx watch) на http://127.0.0.1:3000
make start     # сборка tsc + прод-запуск node dist/server.js
make check     # typecheck + lint + format:check + тесты
```

Эндпоинты каркаса: `GET /` → `{"hello":"world"}`, `GET /health` → `{"status":"ok"}`.

### mise

- Инструменты и окружение — `mise.toml`: Node 22, `PORT=3000`, `HOST=127.0.0.1`.
- Таски: `mise run dev|start|build|test|lint|format|typecheck|check`.
  - **`mise run check`** — единая команда для всех проверок (typecheck → lint → format:check → test), выполняет их последовательно с fail-fast. Используется локально (`make check`) и в CI.
- Хуки (события окружения): `postinstall` → `npm install` после установки инструментов mise; `watch_files` на `package.json` → `npm install` при изменении в активированном шелле.
- Демоны (фоновые процессы разработки): фоновый dev-сервер API — `make daemon` / `make daemon-stop` (`mise daemons start api`, `ready_port = 3000`; требуется pitchfork: `mise use -g pitchfork`).

### hk (git-хуки и проверки)

Конфигурация — `hk.pkl` (шаги: oxfmt, oxlint, tsc, mise fmt).

- **pre-commit**: фиксация и стейдж отформатированных staged-файлов (stash незастейженных правок включён).
- **commit-msg**: проверка Conventional Commits (`hk util check-conventional-commit`); действует только когда в коммите есть файлы из `sdocs/`.
- Команды: `hk check` (проверка изменённых), `hk fix` (исправление), `hk check --all` (весь проект, для CI), `hk run <hook>`.
- `make hooks` — установка хуков (выполняется и хуком mise `postinstall` автоматически). Обход хука разово: `HK=0 git commit ...`.
- Монорепо: git-корень выше каталога проекта, поэтому в `/home/om/nanogitlab/hk.pkl` sdocs подключён как `subprojects` — хуки срабатывают от корня репозитория, шаги скоупятся на `sdocs/` и не затрагивают коммиты соседних проектов.

### Коммиты

Conventional Commits — формат `type(scope): subject` (feat, fix, chore, docs, test, ...). Проверка: хук `commit-msg` через hk; вручную — `npx commitlint --edit` (конфиг `commitlint.config.js`).

### CI

Workflow `.github/workflows/ci.yml` запускается на каждый push (любая ветка и тег). Использует `jdx/mise-action@v5` для установки инструментов из `mise.toml` (Node 22, hk и т.д.) с кэшем, выполняет postinstall-хук mise (`npm install` + `hk install`) и запускает `mise run check`. Стандартный Hexlet-чекер лежит отдельно в `hexlet-check.yml` и его трогать не нужно.

### Релизы

Версия пакета `booking-api` в `package.json` и `CHANGELOG.md` в корне репозитория —
это сгенерированные артефакты, поддерживаемые автоматически.

**Bump-семантика** (Conventional Commits, проверяется хуком `commit-msg`):

- `feat:` → `minor` (`0.1.0` → `0.2.0`);
- `fix:` → `patch` (`0.1.0` → `0.1.1`);
- `BREAKING CHANGE:` в footer или `!` после type/scope → `major`
  (`0.1.0` → `1.0.0`, дальше следующая мажорная).

**Поток релиза** — workflow `.github/workflows/release-please.yml`, конфиг
`release-please-config.json` в корне, manifest
`.github/release-please-manifest.json`:

1. Push в `main` запускает release-please.
2. release-please открывает (или обновляет) PR `chore(main): release X.Y.Z`
   — обновлены `package.json#version` и верх `CHANGELOG.md`
   (раздел со ссылками на PR).
3. Мейнтейнер проверяет diff и мёрджит PR — это и есть релиз:
   release-please ставит git-тег `vX.Y.Z` и создаёт GitHub Release.

Если с прошлого релиза в `main` не появилось ни одного Conventional Commit уровня
`feat` / `fix`, release-PR не открывается.

> ⚠️ **Запрещено править руками** `package.json#version` и `CHANGELOG.md`. Оба
> файла генерируются release-please и перезаписываются следующим релизом. По той
> же логике, что и AGENTS.md rule #9 про generated артефакты.

Подробности решения и альтернативы —
[ADR-0003](docs/adr/0003-release-please-for-automated-releases.md).

## Ограничения

v1 сознательно узок по объёму и по модели хранения; этот раздел — фиксация рамок, требуемая [ADR-0001](docs/adr/0001-in-memory-store-with-restart-reset.md). Расширение любого пункта — через отдельный тикет и ADR.

- **Хранилище в памяти процесса.** Типы встреч и записи живут в памяти процесса ([Storage](GLOSSARY.md)). Любой рестарт — `npm start`, `fly deploy`, `docker restart`, OOM-kill — стирает всё. Дисклеймер по ТЗ и фиксация решения — [ADR-0001](docs/adr/0001-in-memory-store-with-restart-reset.md); переход на персистентное хранилище отложен в отдельную итерацию.
- **Один процесс — одна копия состояния.** Multi-instance деплой (`fly scale`, k8s `replicas > 1`) рассинхронизирует типы встреч и записи между репликами. v1 этого не решает: пишите либо за одним процессом, либо готовьте реальное shared-хранилище (см. [ADR-0001](docs/adr/0001-in-memory-store-with-restart-reset.md), расширение — [ADR-0002](docs/adr/0002-single-writer-in-memory-store.md)).
- **Конкурентность через in-process `AsyncLock`.** Снимко-чтения (`/availability`, `/bookings`) и мутации (`POST /bookings`) сериализуются одним мьютексом на `BookingStore`. Это пропускная способность, ограниченная одним ядром; для горизонтального масштабирования требуется DB-уровень изоляции ([ADR-0001](docs/adr/0001-in-memory-store-with-restart-reset.md), детали шва `acquire/release` под будущую транзакцию — [ADR-0002](docs/adr/0002-single-writer-in-memory-store.md)).
- **Один владелец на развёртывание.** Конфигурация владельца читается из env: `OWNER_NAME`, `OWNER_TIMEZONE`, `OWNER_WINDOW_DAYS`, `OWNER_SLOT_STEP_MINUTES`, `OWNER_WORKING_HOURS_START`, `OWNER_WORKING_HOURS_END` (полный контракт — [Secrets](#secrets)). Менять владельца = пересборка и перезапуск. UI владельца отсутствует (см. [GLOSSARY.md](GLOSSARY.md), раздел «Out of scope для v1»).

### Не предоставляется в v1

Полный список — [GLOSSARY.md](GLOSSARY.md) (раздел «Out of scope для v1»); коротко:

- UI владельца и гостя (Vite + shadcn/ui) — отдельная карта (#26).
- Аутентификация владельца.
- Уведомления (email/SMS/push).
- Отмена гостем и повторная запись.
- Оплата.
- Редактирование и удаление типов встреч.
- Просмотр прошедших бронирований.
- Множественные владельцы на одно развёртывание.
- Интеграции с внешними календарями.
- i18n и переключение TZ на стороне гостя.

## Docker

Backend поставляется как Docker image для прод-деплоя (карта #42
«Dockerize booking-api v1 backend»). Сборка и локальный запуск:

```bash
docker build -t booking-api .
docker run --env PORT=3030 --publish 3030:3030 booking-api
```

**Почему нет `docker` в Makefile.** В этом репозитории `make` —
dev-инструмент (`make dev` / `make start`); Docker image — это
продуктовый артефакт для деплоя, и собирают его напрямую через
`docker build`, без отдельной алиасы.

**ENV contract — `src/server.ts` читает `process.env`, не хардкод.**

- `PORT` берётся из `process.env.PORT` в
  [`src/server.ts`](src/server.ts:7) (default `3000`). Значение
  `ENV PORT=3000` в Dockerfile — только fallback: прод-деплой и
  внешняя автоматическая проверка после старта контейнера передают
  свой порт через `docker run --env PORT=…`, и этот аргумент имеет
  приоритет над env из образа.
- `HOST` внутри контейнера всегда `0.0.0.0` (оверрайд dev-дефолта
  `127.0.0.1` из `mise.toml`) — иначе опубликованный порт
  недостижим снаружи контейнера, поэтому в Dockerfile выставлен
  именно `HOST=0.0.0.0`.

**Smoke-эндпоинты для внешней автоматической проверки.** После старта
контейнера автоматика бьёт в [`src/routes/root.ts`](src/routes/root.ts)
(`GET /`) и [`src/routes/health.ts`](src/routes/health.ts)
(`GET /health`) — те же эндпоинты покрывает и `make check` через
Fastify `app.inject`, без поднятия порта.

CMD в образе в exec-форме (`node dist/server.js`): PID 1 — это
процесс node, поэтому `docker stop` доставляет SIGTERM напрямую в
node и Fastify-хуки успевают отработать graceful shutdown.

Multi-arch (`linux/arm64`), image-signing и push в remote registry
в этой карте
**не делаются** — см. «Out of scope» карты #42 (production
manifests, supply-chain security, remote-vault — тоже out of scope).

## Security

Карта #42 добавляет defense-in-depth скан репо на leaked credentials
через [`gitleaks`](https://github.com/gitleaks/gitleaks) (тикет #44):
pre-commit hook ловит утечку до `git push`, CI ловит то, что проскочило
мимо локального хука. Конфиг — `.gitleaks.toml` в корне репозитория
(allowlist для commit-SHA и test-fixtures, см. тикет #47).

- **Локально**: pre-commit step в `hk.pkl` запускает
  `gitleaks protect --staged --redact=20 --verbose --no-banner` против
  staged-изменений (тикет #48). Стандартный flow: правите файлы → `git
  add` → `git commit`; `hk` step сам прогонит gitleaks на stage. Для
  ручной проверки всего репо: `hk check --all`.
- **CI**: workflow `.github/workflows/ci.yml` → джоб `check` → шаг
  «Scan repo for secrets (gitleaks)» через
  `gitleaks/gitleaks-action@v2` (тикет #49). Бежит **до** Regenerate
  OpenAPI и `mise run check`, чтобы утечка токенов не маскировалась
  fail-fast по regeneration-скриптам.

**Smoke-чек end-to-end** (тикет #50): `./scripts/gitleaks-smoke.sh`.
Создаёт фейковый AWS-docs ключ в временном файле, стейджит его,
ожидает что gitleaks его детектит (exit ≠ 0), затем
`git reset` всё чистит. Запускайте после правок `.gitleaks.toml`
или `hk.pkl`, чтобы убедиться что новый allowlist не закрыл
настоящие утечки. Smoke-чек никуда не коммитит fake-secret — он
работает только в staging area. Для проверки CI-слоя: push в любую
ветку и `gh run watch <run-id>`.

## Secrets

Production-конфигурация и секреты живут **вне репозитория**. Полный runbook —
[docs/agents/production-secrets.md](docs/agents/production-secrets.md).

- **Шаблон env-контракта** — [`.env.example`](.env.example) в корне репозитория:
  форма без значений. Файлов `.env` / `.env.production` с реальными значениями
  в репозитории нет и быть не должно (оба в `.gitignore`).
- **Платформа — Fly.io** ([ADR-0004](docs/adr/0004-hosting-platform.md)):
  несекретное (`PORT`, `HOST`, `NODE_ENV`) — в `fly.toml [env]` (тикет #54);
  секреты — только через `fly secrets set` или dashboard Fly, значение секрета
  нельзя прочитать обратно.
- **Ротация:** `fly secrets set` → редеплой → smoke-проверка (`GET /health`,
  `GET /config`, `GET /meeting-types`). При утечке — смена значения, редеплой и
  инвалидация всего, что выдавалось на старом значении.
- **Учтите:** `fly secrets set` перезапускает Machines, а значит стирает
  in-memory store ([ADR-0001](docs/adr/0001-in-memory-store-with-restart-reset.md)).
  Смена секрета — операция в окне, где записок мало.

## MCP

Проектная конфигурация MCP для агента (OpenCode) лежит в
[`.opencode/opencode.json`](.opencode/opencode.json). Серверы объявлены в
каноническом V2-пути `mcp.servers`: `fly-mcp` (remote, Fly.io) и `shadcn`
(local). Полный runbook — [docs/agents/production-mcp.md](docs/agents/production-mcp.md).

```bash
# Подключить fly-mcp глобально (чтобы работало и в других проектах):
opencode mcp add --global fly-mcp --url https://mcp.fly.io

# Залогиниться через OAuth (откроется браузер, выбрать организацию):
opencode mcp auth fly-mcp

# Проверить статус подключения:
opencode mcp list
```

- **Логин:** либо `opencode mcp auth fly-mcp`, либо в интерфейсе агента
  `/mcps` → `fly-mcp` → sign in. В этом репозитории подключение уже
  объявлено, поэтому достаточно авторизоваться.
- **Секреты:** OAuth-токены и любые секреты хранятся **вне репозитория** — в
  конфиге пользователя (`~/.config/opencode/opencode.jsonc`). В репозиторий
  попадают только публичные URL и команды; токенов в `.opencode/opencode.json`
  нет и быть не должно.
- **Что даёт `fly-mcp`:** управление Fly Apps, Machines, volumes, app-secrets и
  TLS-сертификатами (плюс Managed Postgres и Sprites). Например,
  `list_app_secrets` показывает имена секретов и их digest'ы, но **не
  значения**.

## Production deploy

Публичный URL приложения: **https://booking-api.fly.dev**

Имя Fly-приложения — ключ `app` в [`fly.toml`](fly.toml). Fly.io выдаёт адрес
`https://<app>.fly.dev` автоматически, даже без custom domain, поэтому URL
выше — не ручная копия, а производная от `app`: правка `app` в `fly.toml`
меняет и канонический URL, и он не расходится с фактическим деплоем. Расхождение
записей ловит drift-тест [`test/production-url.test.ts`](test/production-url.test.ts).

### Последовательность деплоя

1. `fly apps create booking-api` — имя глобально уникально на fly.io.
2. `fly secrets set OWNER_NAME=… …` — секреты живут вне репозитория, runbook:
   [Secrets](docs/agents/production-secrets.md).
3. `fly deploy` — build из корневого `Dockerfile`, конфиг — `fly.toml`.
4. `fly scale count 1` — ровно один инстанс (верхняя граница — в `fly.toml`).
5. `scripts/production-smoke.sh https://booking-api.fly.dev` — post-deploy
   smoke (тикет #57): скрипт выводит тот же канонический URL из `fly.toml`.

DNS-записи, custom domain и TLS-сертификат — runbook
[docs/agents/production-dns-tls.md](docs/agents/production-dns-tls.md) (тикет #56).

### Если имя `booking-api` на fly.io занято

Имя Fly-приложения глобально-уникально: если `booking-api` уже занят, владелец
релиза правит ключ `app` в [`fly.toml`](fly.toml) и обновляет URL в этом же
разделе — одна правка, один PR. До синхронизации записей drift-тест падает:
адрес в репозитории и фактический деплой разойдутся.

## UI / E2E

Frontend и end-to-end тесты — отдельная итерация карты #26 («Booking API v1 — UI & E2E»). Этот раздел собирает команды и правила для фронтенд-инженеров; сам код появится в последующих тикетах той же карты.

### Команды

- `npm run dev:web` — Vite dev-сервер на `127.0.0.1:5173`. Ожидается запущенный backend на `127.0.0.1:3000` (`make dev`); Vite проксирует `/api/*` на backend, так что из браузера все запросы идут на тот же origin и CORS не нужен.
- `npm run build:web` — Vite-сборка; результат — статические ассеты в `web/dist/`.
- `npm run gen:sdk` — регенерировать `web/src/api/sdk.ts` из `openapi.yaml` (генератор `openapi-typescript@7.13.0`, тикет #29). Прогон обязателен после любой правки `spec/*.tsp` и после изменения `openapi.yaml` релизом — см. AGENTS.md rule #9.
- `npm run test:e2e` — Playwright end-to-end против реального Fastify-сервера (Wave C, тикет #34). Сам поднимает backend через `playwright.config.ts::webServer` (Fastify на `E2E_API_PORT`, по умолчанию 3030) и Vite dev-сервер на 5173; внешний `make start` не требуется ни локально, ни в CI.
- `npm run test:e2e:install` — `npx playwright install --with-deps chromium`, разовая установка браузера для e2e.

### Волны карты #26

- **Wave A — каркас + SDK** (тикеты #28, #29): создать `web/`, привязать к корню репозитория, сгенерировать SDK. Никакого runtime-кода здесь ещё нет.
- **Wave B — UI** (тикеты #30–#33): shadcn/ui + Vite, страницы владельца и гостя, прокси `/api/*` на backend.
- **Wave C — e2e + CI** (тикеты #34–#35): `npm run test:e2e` против реального Fastify: `playwright.config.ts::webServer` сам стартует Fastify (порт `E2E_API_PORT`, default 3030) и Vite dev (5173), без ручного `make start`. Отдельный CI-джоб в `.github/workflows/ci.yml` (caches `~/.cache/ms-playwright`, upload `playwright-report/` на failure).
- **Wave D — гигиена** (тикет #27 и соседи): правила и документация, фиксирующие рамки перед Wave A/B/C. AGENTS.md rule #10 и rule #11, плюс этот раздел — артефакты Wave D.

Корень карты — тикет #26.

### Какие правила `AGENTS.md` продолжают действовать в `web/`

Корневой `AGENTS.md` распространяется на весь репозиторий; ниже — правила, которые легко пропустить фронтенд-инженеру, потому что они сформулированы в backend-терминах. Полный реестр — в `AGENTS.md`.

- **Rule #1** — `make check` остаётся единой командой проверки всего репозитория. В неё входят и backend-таски (typecheck/lint/format:check/test), и frontend-таски; правка только `web/` не снимает ответственности за проход backend-шагов.
- **Rule #2** — Conventional Commits (`type(scope): subject`). Для frontend в `scope` обычно указывается `web` (допустимы также `web(api)`, `web(ui)`, `web(e2e)`). Полный список типов и обход хука (`HK=0 git commit ...`) — в rule #2.
- **Rule #5** — backend-правило «импорты в `src/` с `.js`-расширением» обусловлено `NodeNext` + ESM (см. полный текст). В `web/` работает bundler resolution Vite: относительные импорты без расширения (`import x from "./foo"`) Vite резолвит в `./foo.ts`/`.tsx` сам, поэтому дописывать `.js` для `web/src/**` не требуется и некорректно — это TypeScript-код, расширения должны быть `.ts`/`.tsx`.
- **Rule #8** — subject коммита оканчивается `(#NN)`, если коммит реализует конкретный тикет. Исключение для chore/docs без тикета действует и в `web/` (см. полный текст).
- **Rule #9** — не править руками generated артефакты. К frontend это относится вдвойне: `openapi.yaml` (правила те же) и `web/src/api/sdk.ts` (правила те же — никаких ручных правок, только `npm run gen:sdk`). См. полный текст rule #9.
