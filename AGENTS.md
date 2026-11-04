# AGENTS.md

Каркас API бронирования — TypeScript + Fastify + vitest + mise + hk + oxlint/oxfmt. ESM. Один пакет.

## Правила

1. **Все проверки одной командой — `make check`** (= `mise run check`): typecheck → lint → format:check → test, fail-fast. CI гоняет это на каждый push (`.github/workflows/ci.yml`). Не подменять отдельными npm-скриптами.
2. **Формат коммитов — Conventional Commits.** Допустимые типы (по `@commitlint/config-conventional`): `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`. Шаблон: `type(scope): subject`. Хук `commit-msg` (commitlint, `commitlint.config.js`) блокирует коммит при нарушении. Пропустить разово: `HK=0 git commit ...`.
3. **Не править `.github/workflows/hexlet-check.yml`** — это Hexlet-платформа; баннер в файле запрещает. Свой CI в `.github/workflows/ci.yml`.
4. **`tsc` не проверяет тесты.** `tsconfig.json` исключает `test/`; типы тестов — зона ответственности vitest.
5. **Импорты в `src/` всегда с `.js`** (`import x from "./foo.js"`). `NodeNext` + ESM.
6. **Демон `make daemon` требует один раз `mise use -g pitchfork`** — без этого шаг падает.
7. **Не «причёсывать» массивы в `mise.toml`.** `oxfmt` и `mise fmt` (шаги hk по `*.toml`) расходятся для массивов > 2 элементов: один сворачивает в одну строку, другой разворачивает в мультилайн. Для > 2 шагов использовать одну строку `run = "a && b && c"` (см. `[tasks.check]`).
8. **Коммит реализации ссылается на тикет, который он делает.** В subject после описания — `#NN` в скобках, например `feat: запись на свободный слот (#12)`. GitHub рендерит номер как ссылку на задачу; по `git log` видно, какой коммит какую задачу делал. Связь работает в обе стороны — в карточке тикета виден обратный линк на коммит. Reference `#NN` сам по себе тикет не закрывает: для авто-закрытия при merge PR добавляйте `Closes #NN` (или `Fixes #NN`) в body коммита или в PR description. Ссылка обязательна, если коммит реализует конкретный тикет; для chore/docs без тикета правило не применяется.
9. **Не править руками четыре generated артефакта: `openapi.yaml`, сгенерированный SDK, `CHANGELOG.md` и `package.json#version`.** Каждый из них — продукция своего инструмента:
   - `openapi.yaml` регенерируется из `spec/*.tsp` через `mise run spec`; CI шаг «Regenerate OpenAPI» в `.github/workflows/ci.yml` падает, если закоммиченный файл отличается от свежесгенерированного.
   - SDK — это `web/src/api/sdk.ts`, регенерируется из `openapi.yaml` через `mise run gen:sdk` (зависит от `spec`); CI шаг «Regenerate SDK and verify» в `.github/workflows/ci.yml` падает, если коммитированный `web/src/api/sdk.ts` отличается от свежесгенерированного. Источник истины — `spec/*.tsp` (через `openapi.yaml`); править руками типы в SDK запрещено так же, как для `openapi.yaml` — следующий прогон `gen:sdk` всё сотрёт.
   - `CHANGELOG.md` и `package.json#version` — продукция `release-please` (см. ADR-0003 и `.github/workflows/release-please.yml`); единственный путь к ним — merge release-PR от `release-please[bot]`. `CHANGELOG.md` дополнительно внесён в `ignorePatterns` `.oxfmtrc.json`, чтобы oxfmt не пытался его переформатировать.

   Для всех четырёх правило одно: меняйте источник (спектр OpenAPI, `spec/*.tsp` для SDK, Conventional Commits в истории), а файл-продукцию не трогайте — следующий прогон соответствующего инструмента или CI-чек перепишет его сам.

10. **Web-фронтенд живёт в поддиректории `web/`, не дублирует доменные/API типы вручную.** Запрещает любое ручное дублирование API-типов и runtime-обвязок в коде вне `web/src/api/sdk.ts`. `web/` — отдельный workspace со своим `package.json` / `tsconfig.json` / `vite.config.ts`; он не подменяет существующий backend в `src/` и не противопоставляется корневому окружению — правила выше этого документа продолжают действовать и для фронтенд-инженеров (перекрёстная сводка — в `README.md`, раздел «UI / E2E»).
11. **Сгенерированный SDK в `web/src/api/sdk.ts` — единственный источник API-типов на клиенте; ручные типы API и ручные fetch-обёртки запрещены.** SDK генерируется из `openapi.yaml` через `npm run gen:sdk` (генератор — `openapi-typescript@7.13.0`, тикет #29); следующая регенерация и CI-чек перепишут ручные правки (см. rule #9). Запрещены любые ручные `interface Foo extends Omit<Domain, "id">` в `web/src/**`, ручные `fetch(url)`-обёртки и любое другое дублирование контракта в обход SDK.

## Команды

- `make install` — установка инструментов и зависимостей (mise postinstall-хук сам прогоняет `npm install` + `hk install`).
- `make dev` — watch-сервер на `127.0.0.1:3000`. `make start` — прод (`build` → `node dist/server.js`).
- Отдельная проверка: `mise run typecheck|lint|format|test`. Watch тестов: `npm run test:watch`. Один тест-файл: `npx vitest run test/path/file.test.ts`.
- По всему репо как CI: `hk check --all` / `hk fix --all`. Очистка: `make clean`.

## Контекст

- Вход: `src/server.ts` → `buildApp()` из `src/app.ts`, маршруты в `src/routes/*.ts`. Сейчас только `GET /` и `GET /health`.
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
