# Sessions — agent run history

Хронологический манифест OpenCode-сессий `implement-spec`, по `wayfinder:map`-cart'ам. Каждый манифест — короткая справка для следующего агента, открывшего проект в новой session: что было реализовано, какие non-obvious решения принимались, на какие SHA и PR ссылаться.

## Зачем отдельная папка (а не closing-comment в GitHub issue)

Closing-comment на cart issue содержит похожую информацию, но **discovery из `docs/`** удобнее для cold-start'а: новый агент обходит `docs/` на старте сессии, ему не придёт в голову искать историю предыдущих sessions в GitHub issue-комментариях. Plus — сюда выносятся **drift, пойманный в code-review или в CI**, и **post-merge fixup'ы**, которые часто не попадают в final summary коммита.

## Конвенция файла

Имя: `YYYY-MM-DD-<cart-id>-<short-title>.md` (kebab-case ASCII, без пробелов).

Внутри манифеста:

- **Что сделано** — sub-tickets + ключевые SHA коммитов (можно через pre-squash, если integration branch ещё не удалён, или post-squash из `git log --grep="#NN"`).
- **Non-obvious drift** — отклонения от тикетных спецификаций с reasons; неожиданные совместные fallback'и; баги, которые проявились в code-review или в CI e2e.
- **Code review findings** — что Standards и Spec осям не понравилось; какие фиксы вошли в final PR.
- **Trace** — squash-merge PR, авто-закрытые тикеты, поведение release-please на этом push (no-op / новая версия).
- **Open follow-ups** — что осталось вне scope этой карты.

Каждый манифест — **короткий** (1–2 экрана), не копия всего git log. Главный критерий: новый агент читает файл 5 минут и понимает, что произошло.

## Текущие sessions

- [2026-11-04-cart-1-housekeeping.md](2026-11-04-cart-1-housekeeping.md) — закрытие cart #1 «Booking API v1: карта пути от текущего каркаса к готовой v1 API». Squash в PR #37 (`efea86c`), release 1.0.0 опубликован через PR #36.
- [2026-11-04-cart-26-ui-and-e2e.md](2026-11-04-cart-26-ui-and-e2e.md) — закрытие cart #26 «Booking API v1 — UI & E2E: карта пути к браузерному сценарию». Squash в PR #38 (`81cfabf`), release 1.1.0 опубликован через PR #39 (release-please minor bump из `feat:`-коммитов cart #26).
