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

## Команды

- `make install` — установка инструментов и зависимостей (mise postinstall-хук сам прогоняет `npm install` + `hk install`).
- `make dev` — watch-сервер на `127.0.0.1:3000`. `make start` — прод (`build` → `node dist/server.js`).
- Отдельная проверка: `mise run typecheck|lint|format|test`. Watch тестов: `npm run test:watch`. Один тест-файл: `npx vitest run test/path/file.test.ts`.
- По всему репо как CI: `hk check --all` / `hk fix --all`. Очистка: `make clean`.

## Контекст

- Вход: `src/server.ts` → `buildApp()` из `src/app.ts`, маршруты в `src/routes/*.ts`. Сейчас только `GET /` и `GET /health`.
- Тесты через `app.inject({ method, url })` — Fastify прогоняет запросы in-process, порт биндить не надо.
- `[env]` в `mise.toml` (`HOST`, `PORT`, `NODE_ENV`) подхватывается автоматически — отдельный `.env` под эти переменные не нужен.
