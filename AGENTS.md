# AGENTS.md

Каркас API бронирования — TypeScript + Fastify + vitest + mise + hk + oxlint/oxfmt. ESM. Один пакет.

## Правила

1. **Все проверки одной командой — `make check`** (= `mise run check`): backend typecheck → web typecheck → repo-wide lint → repo-wide format:check → backend unit-тесты → web unit-тесты → production-сборка web → Playwright e2e. Шаги выполняются последовательно с fail-fast; e2e поднимает собственные backend/Vite-серверы без reuse. CI гоняет ту же canonical-задачу на каждый push (`.github/workflows/ci.yml`). Не подменять отдельными npm-скриптами.
2. **Формат коммитов — Conventional Commits.** Допустимые типы (по `@commitlint/config-conventional`): `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`. Шаблон: `type(scope): subject`. Хук `commit-msg` (commitlint, `commitlint.config.js`) блокирует коммит при нарушении. Пропустить разово: `HK=0 git commit ...`.
3. **Не править `.github/workflows/hexlet-check.yml`** — это Hexlet-платформа; баннер в файле запрещает. Свой CI в `.github/workflows/ci.yml`.
4. **`tsc` не проверяет тесты.** `tsconfig.json` исключает `test/`; типы тестов — зона ответственности vitest.
5. **Импорты в `src/` всегда с `.js`** (`import x from "./foo.js"`). `NodeNext` + ESM.
6. **Демон `make daemon` требует один раз `mise use -g pitchfork`** — без этого шаг падает.
7. **Не «причёсывать» массивы в `mise.toml`.** `oxfmt` и `mise fmt` (шаги hk по `*.toml`) расходятся для массивов > 2 элементов: один сворачивает в одну строку, другой разворачивает в мультилайн. Для > 2 шагов использовать одну строку `run = "a && b && c"` (см. `[tasks.check]`).
8. **Коммит реализации ссылается на тикет, который он делает.** В subject после описания — `#NN` в скобках, например `feat: запись на свободный слот (#12)`. GitHub рендерит номер как ссылку на задачу; по `git log` видно, какой коммит какую задачу делал. Связь работает в обе стороны — в карточке тикета виден обратный линк на коммит. Reference `#NN` сам по себе тикет не закрывает: для авто-закрытия при merge PR добавляйте `Closes #NN` (или `Fixes #NN`) в body коммита или в PR description. Ссылка обязательна, если коммит реализует конкретный тикет; для chore/docs без тикета правило не применяется.
9. **Generated артефакты не редактировать вручную:** `openapi.yaml` и `web/src/api/sdk.ts` обновляются только из `spec/*.tsp` командами `mise run spec` / `mise run gen:sdk`; CI проверяет их воспроизводимость. `CHANGELOG.md` и `package.json#version` меняются только через merge release-PR от `release-please[bot]`. Правьте источник (TypeSpec или Conventional Commits), а не результат генерации.
10. **Frontend живёт в `web/`** — отдельном npm-пакете со своими конфигами; он не заменяет backend в `src/`, и все правила репозитория действуют там тоже. Доменные и API-типы вручную не дублируются (см. README → «UI / E2E»).
11. **`web/src/api/sdk.ts` — единственный клиентский API-контракт и HTTP-runtime.** Закреплённый Orval генерирует типы и endpoint-функции (`fetch`, single-file, `baseUrl: "/api"`); все запросы идут через них. В production-коде вне SDK запрещены ручные API-типы, endpoint URL, `fetch`/`JSON.stringify`, HTTP/JSON helpers и custom mutators. Контракт меняется через `spec/*.tsp` и `npm run gen:sdk` (см. rule #9).

## Команды

- `make install` — установка инструментов и root/web npm-зависимостей (mise postinstall-хук также прогоняет root `npm install` + `hk install`). Перед первым `make check` установить Chromium и его системные зависимости: `npm run test:e2e:install` (на Linux может запросить sudo).
- `make dev` — watch-сервер на `127.0.0.1:3000`. `make start` — прод (`build` → `node dist/server.js`).
- Отдельная проверка: `mise run typecheck|lint|format|test`. Watch тестов: `npm run test:watch`. Один тест-файл: `npx vitest run test/path/file.test.ts`.
- По всему репо как CI: `hk check --all` / `hk fix --all`. Очистка: `make clean`.

## Контекст

- Вход: `src/server.ts` → `buildApp()` из `src/app.ts`, маршруты регистрируются из `src/routes/*.ts`. Канонические paths, операции и схемы задаются в `spec/*.tsp`; их актуальный список здесь не дублируется.
- Тесты через `app.inject({ method, url })` — Fastify прогоняет запросы in-process, порт биндить не надо.
- `[env]` в `mise.toml` (`HOST`, `PORT`, `NODE_ENV`) подхватывается автоматически — отдельный `.env` под эти переменные не нужен.

## Скиллы агента

### Трекер задач

Задачи живут в GitHub Issues; чтение/запись через CLI `gh`. Подробности — в `docs/agents/issue-tracker.md`.

### Лейблы триажа

Стандартный пятиролевой словарь (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). Подробности — в `docs/agents/triage-labels.md`.

### Доменная документация

Single-context: `GLOSSARY.md` в корне репозитория, `docs/adr/` для ADR. Подробности — в `docs/agents/domain.md`.

### Историю implement-spec сессий вести в `docs/agents/sessions/`

Каждая сессия `@implement-spec` оставляет manifest в `docs/agents/sessions/YYYY-MM-DD-<cart-id>-<short>.md` (индекс в `README.md`). В манифесте — какие sub-tickets закрыты, non-obvious drift (отклонения от спецификации с reasons), code-review findings и post-merge fixups с SHA. Это помогает следующему агенту в новой session бегло понять, что выкатили, без чтения всего `git log`. Cart-closed комментарий в GitHub issue остаётся canonical short-trace; манифест в `docs/` — это длинная версия с drift и reasoning.

### Docker

После wave-1 карты #42 backend живёт как Docker image: `docker build -t booking-api .` и `docker run --env PORT=…`. Базовые команды и ENV contract (`PORT` из env, `HOST=0.0.0.0` внутри контейнера, `GET /` и `GET /health` как smoke-эндпоинты) — в [README.md → ## Docker](./README.md#docker). Реализует тикеты #43 (Dockerfile + .dockerignore) и #45 (документация) карты #42.
