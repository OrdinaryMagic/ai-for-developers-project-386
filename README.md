# Сценарий: от создания типа встречи до записи в списке владельца

Краткий happy-path через приложение v1: владелец создаёт тип встречи → гость
выбирает свободный слот и записывается → запись появляется в списке владельца.
Архитектурный референс — Cal.com, но названия страниц, URL и данные ниже —
наши собственные. Подробная модель, AC и ограничения —
[GLOSSARY.md](GLOSSARY.md) и [docs/adr/](docs/adr/).

Живой стенд: **https://booking-api-production-b3a4.up.railway.app** — один домен
отдаёт и API, и собранный интерфейс (см. «Production deploy» и «UI на том же
домене»).

## 1. Владелец создаёт тип встречи

1. Открыть `/admin/event-types` и нажать **Создать**.
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
   - **OUTSIDE_WINDOW (422)** — слот уже начался (гость держал страницу
     открытой) или вышел за окно бронирования: выберите другой слот.

> **Слоты, которые уже начались, не предлагаются.** Окно бронирования
> начинается с 00:00 текущего дня, но сетка отдаёт только слоты **в будущем**:
> сегодняшние часы, которые уже прошли, в неё не попадают, а `POST /bookings`
> на такой слот отвечает `422 OUTSIDE_WINDOW`. Иначе запись создавалась бы, но
> не показывалась бы в списке владельца — там только предстоящие бронирования.

## 3. Запись появляется у владельца

1. Открыть `/admin/bookings`.
2. Только что созданная `Booking` видна в списке: тип встречи, имя и email
   гостя, дата и время начала. Список показывает **только предстоящие**
   бронирования (контракт `GET /bookings`), в хронологическом порядке.
3. Клик по строке открывает детали бронирования.

> **Записи не переживают рестарт.** Хранилище — в памяти процесса
> ([ADR-0001](docs/adr/0001-in-memory-store-with-restart-reset.md)): любой
> редеплой на Railway стирает и типы встреч, и записи. Если после деплоя
> список пуст — это не баг интерфейса, а пустое in-memory-хранилище: создайте
> тип встречи и запишитесь заново.

> **Что v1 не делает** (полный список —
> [GLOSSARY → Out of scope для v1](GLOSSARY.md)): подтверждение владельцем
> (запись сразу активна), reschedule/cancel гостем, редактирование и удаление
> типов встреч, просмотр прошедших бронирований, уведомления, интеграции с
> внешними календарями, i18n и переключение TZ на стороне гостя,
> несколько владельцев на одно развёртывание.

---

## Каркас приложения

Стек: **TypeScript + Fastify** (API), React + Vite + shadcn/ui (фронтенд), **oxlint/oxfmt**, **vitest**, **mise**, **hk**, Makefile, Conventional Commits.

### Запуск

```bash
make install                # инструменты mise + root/web npm-зависимости
npm run test:e2e:install    # Chromium + системные зависимости, один раз
make dev                    # dev-сервер API (tsx watch) на http://127.0.0.1:3000
make start                  # сборка tsc + прод-запуск node dist/server.js
make check                  # полный project gate, включая web build и Playwright
```

`web/` — отдельный npm-пакет со своим `package-lock.json`, а не npm workspace:
поэтому чистый checkout требует установки обоих наборов зависимостей (это делает
`make install`). Для Playwright нужен Chromium; `npm run test:e2e:install`
выполняет `playwright install --with-deps chromium` и на Linux может запросить
`sudo` для установки системных библиотек. После этих двух установочных команд
`make check` воспроизводит полный CI-gate локально.

Эндпоинты каркаса: `GET /` → `{"hello":"world"}`, `GET /health` → `{"status":"ok"}`.

### mise

- Инструменты и окружение — `mise.toml`: Node 22.23.4 (минимум `>=22.18.0` для Orval), `PORT=3000`, `HOST=127.0.0.1`.
- Таски: `mise run dev|start|build|test|lint|format|typecheck|check`.
  - **`mise run check`** — единая команда полного project gate: backend typecheck → web typecheck → repo-wide lint → repo-wide format:check → backend unit-тесты → web unit-тесты → production-сборка web → Playwright e2e. Все шаги выполняются последовательно с fail-fast. Используется локально (`make check`) и в CI; отдельный более широкий CI-набор не поддерживается.
- Хуки (события окружения): `postinstall` → `npm install` после установки инструментов mise; `watch_files` на `package.json` → `npm install` при изменении в активированном шелле.
- Демоны (фоновые процессы разработки): фоновый dev-сервер API — `make daemon` / `make daemon-stop` (`mise daemons start api`, `ready_port = 3000`; требуется pitchfork: `mise use -g pitchfork`).

### hk (git-хуки и проверки)

Конфигурация — `hk.pkl` (шаги: gitleaks, oxfmt, oxlint, tsc, mise fmt).

- **pre-commit**: фиксация и стейдж отформатированных staged-файлов (stash незастейженных правок включён), плюс проверка staged-изменений через gitleaks.
- **commit-msg**: проверка Conventional Commits (`hk util check-conventional-commit`) для каждого коммита.
- Команды: `hk check` (проверка изменённых), `hk fix` (исправление), `hk check --all` (весь проект, для CI), `hk run <hook>`.
- `make hooks` — установка хуков (выполняется и хуком mise `postinstall` автоматически). Обход хука разово: `HK=0 git commit ...`.

### Коммиты

Conventional Commits — формат `type(scope): subject` (feat, fix, chore, docs, test, ...). Проверка: хук `commit-msg` через hk; вручную — `npx commitlint --edit` (конфиг `commitlint.config.js`).

### CI

Workflow `.github/workflows/ci.yml` запускается на каждый push (любая ветка и тег). Job `check` использует `jdx/mise-action@v5` для установки инструментов из `mise.toml` (Node 22.23.4, hk и т.д.), отдельно выполняет `npm ci` для root и `web/`, восстанавливает кэш `~/.cache/ms-playwright` и устанавливает Chromium через `npm run test:e2e:install`. После проверок свежести OpenAPI/SDK та же canonical-задача `mise run check` прогоняет весь gate, включая Playwright; отдельного e2e-job нет. При падении `playwright-report/` и `test-results/` загружаются как артефакты. Docker smoke-job имеет `needs: check`, поэтому стартует только после полного gate с браузерными сценариями. Стандартный Hexlet-чекер лежит отдельно в `hexlet-check.yml` и его трогать не нужно.

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

- **Хранилище в памяти процесса.** Типы встреч и записи живут в памяти процесса ([Storage](GLOSSARY.md)). Любой рестарт — `npm start`, `railway redeploy`, `docker restart`, OOM-kill — стирает всё. Дисклеймер по ТЗ и фиксация решения — [ADR-0001](docs/adr/0001-in-memory-store-with-restart-reset.md); переход на персистентное хранилище отложен в отдельную итерацию.
- **Бронируются только будущие слоты; список владельца — только предстоящие записи.** Окно бронирования начинается с 00:00 текущего дня, но сетка отдаёт слоты **в будущем**, а `POST /bookings` на уже начавшийся слот отвечает `422 OUTSIDE_WINDOW`. `GET /bookings` по контракту возвращает только предстоящие бронирования, поэтому просмотр прошедших — вне scope v1 ([GLOSSARY.md](GLOSSARY.md) → «Out of scope для v1»).
- **Один процесс — одна копия состояния.** Multi-instance деплой (`railway scale`, k8s `replicas > 1`) рассинхронизирует типы встреч и записи между репликами. v1 этого не решает: пишите либо за одним процессом, либо готовьте реальное shared-хранилище (см. [ADR-0001](docs/adr/0001-in-memory-store-with-restart-reset.md), расширение — [ADR-0002](docs/adr/0002-single-writer-in-memory-store.md)).
- **Конкурентность через in-process `AsyncLock`.** Снимко-чтения (`/availability`, `/bookings`) и мутации (`POST /bookings`) сериализуются одним мьютексом на `BookingStore`. Это пропускная способность, ограниченная одним ядром; для горизонтального масштабирования требуется DB-уровень изоляции ([ADR-0001](docs/adr/0001-in-memory-store-with-restart-reset.md), детали шва `acquire/release` под будущую транзакцию — [ADR-0002](docs/adr/0002-single-writer-in-memory-store.md)).
- **Один владелец на развёртывание.** Конфигурация владельца читается из env: `OWNER_NAME`, `OWNER_TIMEZONE`, `OWNER_WINDOW_DAYS`, `OWNER_SLOT_STEP_MINUTES`, `OWNER_WORKING_HOURS_START`, `OWNER_WORKING_HOURS_END` (полный контракт — [Secrets](#secrets)). Менять владельца = пересборка и перезапуск. UI владельца отсутствует (см. [GLOSSARY.md](GLOSSARY.md), раздел «Out of scope для v1»).

### Не предоставляется в v1

Полный список — [GLOSSARY.md](GLOSSARY.md) (раздел «Out of scope для v1»); коротко:

- UI владельца и гостя (Vite + shadcn/ui) — реализовано в карте #26 (см. «UI / E2E»).
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

**В образе — и API, и собранный фронтенд.** Dockerfile состоит из трёх стадий:
`web-builder` (сборка SPA из workspace `web/` → `web/dist`), `builder`
(`tsc` → `dist/`) и `runtime` (prod-зависимости + `dist/` + `web/dist`).
Один сервис отдаёт и API, и интерфейс на одном домене — решение
[ADR-0006](docs/adr/0006-single-origin-spa.md). Проверить локально:

```bash
curl -s http://127.0.0.1:3030/                       # {"hello":"world"} — API-клиенту
curl -s -H 'Accept: text/html' http://127.0.0.1:3030/   # оболочка SPA — браузеру
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
(path-allowlist для markdown-документов и test-фикстур, см. тикет #47).

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
ожидает что gitleaks его детектит (exit code `1` — «leaks found» —
и срабатывание правила `aws-access-token`; любой другой exit code
означает поломку скана, а не пойманный секрет), затем `git reset`
всё чистит. Запускайте после правок `.gitleaks.toml`
или `hk.pkl`, чтобы убедиться что новый allowlist не закрыл
настоящие утечки. Smoke-чек никуда не коммитит fake-secret — он
работает только в staging area. Для проверки CI-слоя: push в любую
ветку и `gh run watch <run-id>`.

## Secrets

Production-конфигурация и секреты живут **вне репозитория**. Полный runbook —
[docs/agents/production-secrets.md](docs/agents/production-secrets.md).

- **Шаблон env-контракта** — [`.env.example`](.env.example) в корне репозитория:
  имена переменных + значения по умолчанию (дефолты из кода; для `HOST` и
  `NODE_ENV` — production-значения). Секретов в шаблоне нет: ни одно из этих
  значений секретом не является. Файлов `.env` / `.env.production` с реальными
  значениями в репозитории нет и быть не должно (оба в `.gitignore`).
- **Платформа — Railway.io** ([ADR-0005](docs/adr/0005-hosting-platform-railway.md)):
  несекретное (`HOST`, `NODE_ENV` и публичные `OWNER_*`) — в блоке `env` файла
  [`.railway/railway.ts`](.railway/railway.ts) (тикет #54); `PORT` Railway
  подставляет сам.
- **Секретов в v1 нет.** `OWNER_*` — не секреты: `GET /config` отдаёт их
  анонимно, «секретность» им ничего не даёт. Механизм для будущих секретов —
  `railway variable set` и sealed variables на платформе; значение секрета
  нельзя прочитать обратно.
- **Ротация:** `railway variable set` → редеплой → smoke-проверка (`GET /health`,
  `GET /config`, `GET /meeting-types`). При утечке — смена значения, редеплой и
  инвалидация всего, что выдавалось на старом значении.
- **Учтите:** смена переменных перезапускает реплику, а значит стирает
  in-memory store ([ADR-0001](docs/adr/0001-in-memory-store-with-restart-reset.md)).
  Смена секрета — операция в окне, где записок мало.

## MCP

Проектная конфигурация MCP для агента (OpenCode) лежит в
[`.opencode/opencode.json`](.opencode/opencode.json). Серверы объявлены в
каноническом V2-пути `mcp.servers`: `railway-mcp` (remote, Railway.io) и
`shadcn` (local). Полный runbook — [docs/agents/production-mcp.md](docs/agents/production-mcp.md).

```bash
# Подключить railway-mcp глобально (чтобы работало и в других проектах):
opencode mcp add --global railway-mcp --url https://mcp.railway.com

# Залогиниться через OAuth (откроется браузер, выбрать организацию):
opencode mcp auth railway-mcp

# Проверить статус подключения:
opencode mcp list
```

- **Логин:** либо `opencode mcp auth railway-mcp`, либо в интерфейсе агента
  `/mcps` → `railway-mcp` → sign in. В этом репозитории подключение уже
  объявлено, поэтому достаточно авторизоваться.
- **Секреты:** OAuth-токены и любые секреты хранятся **вне репозитория** — в
  конфиге пользователя (`~/.config/opencode/opencode.jsonc`). В репозиторий
  попадают только публичные URL и команды; токенов в `.opencode/opencode.json`
  нет и быть не должно.
- **Что даёт `railway-mcp`:** управление проектами, сервисами, деплоями,
  переменными окружения, доменами и TLS-сертификатами Railway. Например,
  `set-variables` выставляет переменные окружения, а `domain-status` показывает
  статус сертификата — **значения** секретов при этом не показываются.

## Production deploy

Публичный URL приложения: **https://booking-api-production-b3a4.up.railway.app**

Платформенный домен (`*.up.railway.app`) генерирует сама Railway, и в
IaC-конфиг он **не** попадает: конфиг описывает сервис, а адрес выдаёт
платформа. Поэтому единственный источник канонического адреса в репозитории —
манифест окружения [`.railway/production.json`](.railway/production.json), поле
`publicUrl`. URL выше — не ручная копия, а производная от `publicUrl`: правка
манифеста меняет и канонический URL, и он не расходится с фактическим
деплоем. Расхождение записей ловит drift-тест
[`test/production-url.test.ts`](test/production-url.test.ts).

Конфиг production-размещения — [`.railway/railway.ts`](.railway/railway.ts)
(Railway Infrastructure as Code; решение о платформе —
[ADR-0005](docs/adr/0005-hosting-platform-railway.md)). Он описывает build из
корневого `Dockerfile`, health-check `GET /health`, always-on режим
(`sleepApplication: false`), лимиты 0.5 vCPU / 500 MB и ровно одну реплику в
регионе `us-east4-eqdc4a`.

### Последовательность деплоя

1. `railway login` — авторизация в Railway (OAuth, браузер).
2. `railway link` — привязка каталога к проекту `booking-api` и окружению
   `production`.
3. `railway config plan` — dry-run: какие изменения конфиг внесёт в окружение.
4. `railway config apply` — применение конфига: Railway пересобирает образ из
   `Dockerfile` и перезапускает сервис.
5. `railway variable set KEY=value` — секреты живут вне репозитория, runbook:
   [Secrets](docs/agents/production-secrets.md). Для повторного деплоя текущего
   коммита — `railway redeploy`.
6. `scripts/production-smoke.sh` — post-deploy smoke (тикет #57): скрипт берёт
   тот же канонический URL из `.railway/production.json`.

> **Требование к CLI:** `railway config plan` / `railway config apply`
> (Infrastructure as Code) работают только с Railway CLI **≥ 5.42.1** — движок
> IaC живёт в CLI. npm-пакет `railway` в `devDependencies` даёт **только типы**
> (`railway/iac`) для типизации [`.railway/railway.ts`](.railway/railway.ts);
> его бинарник `railway-iac-ts` без CLI ≥ 5.42.1 не запускается. Если CLI
> недоступен, деплой инициируется через Railway MCP (`connect-service-source`,
> runbook — [docs/agents/production-mcp.md](docs/agents/production-mcp.md)).

> **Auto-deploy по push в `main` может не сработать.** В текущей конфигурации
> редеплой инициируется явно: `railway redeploy`, `connect-service-source` через
> MCP или ручной запуск деплоя в дашборде Railway. После любого деплоя —
> `scripts/production-smoke.sh`.

**Не масштабируйте больше одной реплики:** state живёт в памяти процесса, а
записи сериализуются одним in-process мьютексом — вторая реплика ломает
single-writer-контракт и рассинхронизирует данные
([ADR-0001](docs/adr/0001-in-memory-store-with-restart-reset.md),
[ADR-0002](docs/adr/0002-single-writer-in-memory-store.md)).

DNS-записи, custom domain и TLS-сертификат — runbook
[docs/agents/production-dns-tls.md](docs/agents/production-dns-tls.md) (тикет #56).

### UI на том же домене

Сервис отдаёт **и API, и собранный фронтенд** на одном адресе — решение
[ADR-0006](docs/adr/0006-single-origin-spa.md). Отдельного деплоя под UI нет и не
планируется: второй origin означал бы CORS, второй домен и второй деплой.

| Запрос                                  | Ответ                                            |
| --------------------------------------- | ------------------------------------------------ |
| `GET /` (без `Accept: text/html`)       | `{"hello":"world"}` — контракт API из спеки      |
| `GET /` (браузер, `Accept: text/html`)  | оболочка SPA — открывается интерфейс             |
| `GET /assets/…`                         | статика сборки, `cache-control: immutable`       |
| `GET /admin/event-types` (браузер)      | оболочка SPA — клиентский маршрут (SPA-fallback) |
| `GET /config`, `/meeting-types`, …      | API, канонические пути из `spec/*.tsp`           |
| `GET /api/config`, `/api/meeting-types` | тот же API: алиас-префикс `/api/*`               |

Алиас `/api/*` нужен фронтенду: в dev его снимает Vite-прокси, в production — сам
backend (`src/routes/api.ts`). Канонические пути API при этом не меняются, спека
`spec/*.tsp` и `openapi.yaml` не трогаются.

### Post-deploy smoke

Шаг 6 последовательности деплоя — smoke-проверка живого инстанса
(скрипт [`scripts/production-smoke.sh`](scripts/production-smoke.sh), тикет #57):

```bash
scripts/production-smoke.sh                              # default URL — из .railway/production.json
scripts/production-smoke.sh https://booking-api-production-b3a4.up.railway.app   # явный URL
```

Без аргумента скрипт берёт base URL из поля `publicUrl` манифеста окружения
[`.railway/production.json`](.railway/production.json): канонический адрес не
зашит в скрипт, поэтому пересоздание окружения не оставляет скрипт со старым
URL. Явный аргумент (`http://…` или `https://…`) пригодится для проверки
против локальной копии.

Что проверяется:

| Эндпоинт                                       | Ожидание                                            |
| ---------------------------------------------- | --------------------------------------------------- |
| `GET /`                                        | 200                                                 |
| `GET /health`                                  | 200, тело содержит `"status":"ok"`                  |
| `GET /config`                                  | 200, тело — валидный JSON                           |
| `GET /meeting-types`                           | 200, тело — валидный JSON-массив                    |
| `GET /` (`Accept: text/html`)                  | 200, `content-type: text/html` — оболочка SPA       |
| `GET /admin/event-types` (`Accept: text/html`) | 200, `content-type: text/html` — клиентский маршрут |

Пустой массив `[]` в `/meeting-types` — норма для свежего деплоя. Непустой
массив — только WARNING (инстанс, на котором уже есть типы встречи, —
норма), падением считаются не-массив, невалидный JSON и не-2xx.

Последние две проверки — UI: сервис отдаёт и API, и собранный фронтенд на одном
домене ([ADR-0006](docs/adr/0006-single-origin-spa.md)). Запрос идёт с
`Accept: text/html` — так его отправляет браузер, — поэтому проверка видит
именно оболочку приложения, а не JSON-API.

Коды возврата: `0` — все проверки прошли (`✅ PASS`), non-zero — есть
провалившиеся проверки (`❌ FAIL` со списком упавших эндпоинтов).

Требования к окружению: `bash`, `curl` и `node` — `node` валидирует JSON
(`jq` может отсутствовать). Ставить ничего не нужно.

Retry-loop как safety net: при деплое edge Railway коротко отдаёт 502, пока
старая реплика вытесняется новой, поэтому каждая проверка повторяется до
`SMOKE_RETRIES` раз (по умолчанию 5) с паузой `SMOKE_RETRY_DELAY` секунд
(по умолчанию 3); номер попытки печатается в лог. Скорость повторов
настраивается переменными окружения:

```bash
SMOKE_RETRIES=10 SMOKE_RETRY_DELAY=5 scripts/production-smoke.sh
```

### Если нужно переименовать проект

Имя проекта на Railway не глобально-уникально, но оно входит в платформенный
домен: при переименовании адрес меняется. Владелец релиза правит
[`.railway/production.json`](.railway/production.json) (`publicUrl`) и адрес в
этом же разделе — одна правка, один PR. До синхронизации записей drift-тест
падает: адрес в репозитории и фактический деплой разойдутся.

## DNS / TLS

Публичный домен и HTTPS-сертификат booking-api на Railway.io. Полный runbook
для владельца релиза — [docs/agents/production-dns-tls.md](docs/agents/production-dns-tls.md)
(тикет #56).

Коротко:

1. **Платформенный домен** — Railway выдаёт `*.up.railway.app` с managed TLS
   автоматически: сертификат выпускает и обновляет сама платформа, внешний
   ACME-cron не нужен. Фактический адрес окружения зафиксирован в
   [`.railway/production.json`](.railway/production.json).
2. **Custom domain** (вне scope v1) — CNAME на платформенный домен; Railway
   сам выпускает и обновляет сертификат для custom domain. Делегировать
   `example.com` владелец не может, поэтому в v1 развёрнут платформенный домен.
3. **Проверки** — `https://…/` → 200, `/health` → 200 `{"status":"ok"}`,
   `/config` → 200 Configuration JSON.

Диагностика (pending-сертификат, несошедшийся DNS, 502/health-check) и
процедура отката — в runbook'е.

## UI / E2E

Фронтенд (`web/`) собирается в SPA и обслуживается тем же сервисом, что и API
(«UI на том же домене»). End-to-end тесты (Playwright) гоняют настоящий
Fastify-стек. Этот раздел собирает команды и правила для фронтенд-инженеров.

### Страницы приложения

Маршруты SPA живут в [`web/src/App.tsx`](web/src/App.tsx); все они — клиентские,
сервер отдаёт для них оболочку `index.html` (SPA-fallback):

| Маршрут                          | Страница                     | Роль                           |
| -------------------------------- | ---------------------------- | ------------------------------ |
| `/`                              | список типов встреч (гость)  | выбор meeting type для записи  |
| `/book/:meetingTypeId`           | сетка слотов + форма (гость) | запись на слот                 |
| `/book/:meetingTypeId/confirmed` | подтверждение записи         | UUID и название типа встречи   |
| `/admin/bookings`                | список предстоящих записей   | владелец: что записали         |
| `/admin/event-types`             | CRUD типов встреч            | владелец: настройка расписания |
| `*`                              | «Страница не найдена»        | неизвестный адрес (ADR-0006)   |

**Шапка с навигацией** (`web/src/features/shared/SiteHeader.tsx`) рендерится на
всех маршрутах, включая 404-страницу, и ведёт на страницы с постоянным
адресом: «Запись» (`/`), «Бронирования» (`/admin/bookings`), «Типы встреч»
(`/admin/event-types`). Текущий маршрут помечен `aria-current="page"`. Каркас
задан layout-роутом (`web/src/features/shared/AppLayout.tsx`) — шапку не нужно
дублировать в каждой фиче. Динамический маршрут `/book/:meetingTypeId` в шапку
не попадает: постоянного адреса у него нет, он открывается из списка типов
встреч.

### Команды

- `npm run dev:web` — Vite dev-сервер на `127.0.0.1:5173`. Ожидается запущенный backend на `127.0.0.1:3000` (`make dev`); Vite проксирует `/api/*` на backend, так что из браузера все запросы идут на тот же origin и CORS не нужен.
- `npm run build:web` — Vite-сборка; результат — статические ассеты в `web/dist/`.
- `npm run gen:sdk` — регенерировать `web/src/api/sdk.ts` из `openapi.yaml` через закреплённый в manifest/lockfile **Orval 8.46.0** (тикет #78). Конфиг `orval.config.ts` задаёт `client: "fetch"`, single-file output и `baseUrl: "/api"`; генератор создаёт и API-типы, и endpoint-функции, возвращающие `{ data, status, headers }`. Feature-адаптеры переводят этот result в UI success/domain/network outcome; ручные HTTP wrappers и custom mutators не используются. Задача сначала обновляет OpenAPI из `spec/*.tsp`, не скачивает генератор через `npx -y`, а CI проверяет отсутствие diff после regeneration — см. AGENTS.md rules #9–11.
- `npm run test:e2e` — Playwright end-to-end против реального Fastify-сервера (Wave C, тикет #34). Сам поднимает backend через `playwright.config.ts::webServer` (Fastify на `E2E_API_PORT`, по умолчанию 3030) и Vite dev-сервер на 5173; внешний `make start` не требуется ни локально, ни в CI. По умолчанию уже запущенные серверы **не переиспользуются**: занятый порт является ошибкой, а не разрешением подключиться к чужому процессу. Этот strict-режим входит в `make check`.
- `npm run test:e2e:reuse` — явный ручной быстрый режим, который разрешает reuse уже запущенных backend/Vite на тех же портах. В canonical `make check` он не используется.
- `npm run test:e2e:install` — `playwright install --with-deps chromium`, разовая установка браузера и системных зависимостей для e2e.

### Где живёт фронтенд в production

В production фронтенд **не отдельный деплой**: тот же сервис отдаёт собранный `web/dist`
вместе с API на одном домене ([ADR-0006](docs/adr/0006-single-origin-spa.md), раздел
«UI на том же домене»). Практические следствия для фронтенд-инженера:

- Generated endpoint-функции получают префикс `/api` из `baseUrl` в
  `orval.config.ts` — в dev его срезает Vite-прокси, в production backend-алиас.
  Канонические OpenAPI paths не меняются, ручные клиентские `fetch` не нужны.
- Клиентские маршруты (`/book/:id`, `/admin/event-types`) обслуживает SPA-fallback:
  сервер отдаёт для них `index.html`, а не 404.
- `npm run build:web` нужен только для локальной проверки; в образ фронтенд
  собирается сам (стадия `web-builder` в `Dockerfile`).

### Волны карты #26

- **Wave A — каркас + SDK** (тикеты #28, #29): создать `web/`, привязать к корню репозитория, сгенерировать SDK. Никакого runtime-кода здесь ещё нет.
- **Wave B — UI** (тикеты #30–#33): shadcn/ui + Vite, страницы владельца и гостя, прокси `/api/*` на backend.
- **Wave C — e2e + CI** (тикеты #34–#35, unified gate — #76): `npm run test:e2e` против реального Fastify: `playwright.config.ts::webServer` сам стартует Fastify (порт `E2E_API_PORT`, default 3030) и Vite dev (5173), без ручного `make start`. Тот же e2e-шаг входит в `mise run check`; CI check-job сохраняет cache `~/.cache/ms-playwright` и upload `playwright-report/`/`test-results/` на failure, отдельного e2e-job больше нет.
- **Wave D — гигиена** (тикет #27 и соседи): правила и документация, фиксирующие рамки перед Wave A/B/C. AGENTS.md rule #10 и rule #11, плюс этот раздел — артефакты Wave D.

Корень карты — тикет #26.

### Какие правила `AGENTS.md` продолжают действовать в `web/`

Корневой `AGENTS.md` распространяется на весь репозиторий; ниже — правила, которые легко пропустить фронтенд-инженеру, потому что они сформулированы в backend-терминах. Полный реестр — в `AGENTS.md`.

- **Rule #1** — `make check` остаётся единой командой проверки всего репозитория: backend/web typecheck, repo-wide lint/format:check, backend/web unit-тесты, production-сборка web и Playwright e2e. Правка только `web/` не снимает ответственности за проход backend-шагов, а правка backend не снимает frontend/e2e-шаги.
- **Rule #2** — Conventional Commits (`type(scope): subject`). Для frontend в `scope` обычно указывается `web` (допустимы также `web(api)`, `web(ui)`, `web(e2e)`). Полный список типов и обход хука (`HK=0 git commit ...`) — в rule #2.
- **Rule #5** — backend-правило «импорты в `src/` с `.js`-расширением» обусловлено `NodeNext` + ESM (см. полный текст). В `web/` работает bundler resolution Vite: относительные импорты без расширения (`import x from "./foo"`) Vite резолвит в `./foo.ts`/`.tsx` сам, поэтому дописывать `.js` для `web/src/**` не требуется и некорректно — это TypeScript-код, расширения должны быть `.ts`/`.tsx`.
- **Rule #8** — subject коммита оканчивается `(#NN)`, если коммит реализует конкретный тикет. Исключение для chore/docs без тикета действует и в `web/` (см. полный текст).
- **Rule #9** — не править руками generated артефакты. К frontend это относится вдвойне: `openapi.yaml` (правила те же) и `web/src/api/sdk.ts` (правила те же — никаких ручных правок, только `npm run gen:sdk`). См. полный текст rule #9.
