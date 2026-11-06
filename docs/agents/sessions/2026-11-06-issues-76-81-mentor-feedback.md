# 2026-11-06 — mentor feedback, issues #76–#81

## Что сделано

Integration branch `feat/review-fixes-check-sdk-ui`, PR #82. Реализованы все шесть тикетов:

- #76 — canonical `make check` / `mise run check` для backend, web, production build и Playwright; CI использует тот же gate (`4d39d6e`, merge `a7f5d5d`).
- #77 — status-specific OpenAPI responses и contract-тесты реальных Fastify/доменных ответов (`2147d9f`, merge `850fc9e`).
- #78 — Orval 8.46.0, single-file fetch SDK с `baseUrl: /api`; feature-адаптеры переводят generated result в UI outcomes (`ba9227f`, merge `9baf00f`).
- #79 — `OWNER_WORKING_DAYS` (ISO 1–7, default Пн–Пт), 14 календарных дней availability и 422 для прямой записи в нерабочий день (`a000ef6`, merge `0789d71`).
- #80 — общий Luxon formatter с ru-локалью и TZ владельца, summary записи и exclusive `windowEnd` (`e3edc5a`, merge `16abcc1`).
- #81 — последовательный выбор день → время, keyboard/ARIA, сброс скрытого слота и честный conflict E2E (`db0068f`, merge `78bfb11`).

## Non-obvious decisions / drift

Drift от acceptance criteria не обнаружен. Рабочие дни остаются env-based: `PATCH /config`, admin UI и durable store намеренно не добавлялись. Нерабочие дни сохраняются в availability с `slots: []`. Для summary форма использует существующий `GET /meeting-types/:id`. Сохранение введённых данных при смене слота не добавлялось, поскольку исходный сценарий его не поддерживал; retry после конфликта сохраняет данные.

Push после #80 дважды отклонялся GitHub с `remote: fatal error in commit_refs` по SSH и HTTPS; локальный `git fsck` был чист. Повторный push после следующего merge прошёл без изменения истории.

## Code review findings

Spec review: findings нет. Standards: три judgement-call замечания о дублировании — runtime guards, разбор create-result statuses и E2E day/slot selection. Все исправлены в `d638197` (merge `3ee3165`): общие guards используют SDK types, `translateCreateResult` только транслирует generated results без HTTP-runtime, общий E2E-helper сохраняет реальный `SLOT_TAKEN` во втором browser context.

## Проверка и trace

Финальный `make check`: backend 333 теста, web 106 тестов, production build и 2 Playwright E2E — зелёные. `mise run spec && mise run gen:sdk` воспроизводит `openapi.yaml` и `web/src/api/sdk.ts` без diff. PR #82 содержит `Closes #76`…`Closes #81`; тикеты закроются при merge. Release-please до merge изменений не создаёт, далее обработает Conventional Commits штатно.

## Open follow-ups

Только прежние non-blocking warnings: `no-shadow` в `web/vite.config.ts`, React Router/`act()` в тестах и размер основного Vite chunk. Новых функциональных follow-ups в scope #76–#81 нет.
