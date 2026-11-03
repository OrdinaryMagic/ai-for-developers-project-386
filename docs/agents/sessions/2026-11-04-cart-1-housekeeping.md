# 2026-11-04 — cart #1 housekeeping

`@implement-spec` против cart #1 «Booking API v1: карта пути от текущего каркаса к готовой v1 API». Закрытие карты — финальный housekeeping ADR + Q-номера cleanup + README «Ограничения» поверх уже зарелизенного backend (squash PR #23 = `f42c955 feat: Booking API v1 (slice 01 of N)`).

## Что сделано

9 sub-tickets карты #1:

| #   | Тикет                                                                  | Коммит                        | Что                                                                                                                                                                              |
| --- | ---------------------------------------------------------------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #6  | ADR-0002: Single-writer in-memory store                                | `5a49fdd`                     | новый файл `docs/adr/0002-single-writer-in-memory-store.md`                                                                                                                      |
| #7  | Q-номера cleanup в `src/`                                              | `698384b` (cherry-pick)       | 6 файлов: `src/{types,time/align,time/window,time/working-hours,store/booking-store,config/owner}.ts`. Устаревшие Q1.1/Q1.2/Q2/Q18/Q21/Q26 заменены на term-ссылки `GLOSSARY.md` |
| #9  | README «Ограничения» section                                           | `887d13d` (cherry-pick)       | новый блок после `## Релизы`: in-memory restart caveat, single-process, AsyncLock concurrency, single owner config, "не предоставляется в v1" список                             |
| #8  | Валидация `durationMinutes`                                            | —                             | уже в коде (`4a639ae fix(...)` + `9b249f3 feat(...)`); close через комментарий + ссылку на коммит                                                                                |
| #18 | release-please setup                                                   | —                             | PR #36 = доказательство; close через комментарий                                                                                                                                 |
| --  | `.oxfmtrc.json` + AGENTS.md rule #9 expand + ADR-0002 template cleanup | `158a3f9`                     | code-review fixup commit                                                                                                                                                         |
| --  | `.oxfmtrc.json` ignorePatterns (CHANGELOG.md)                          | `114441d`                     | infra fix to unblock `make check`                                                                                                                                                |
| --  | Cart path integration                                                  | squash `efea86c` через PR #37 | full close-out                                                                                                                                                                   |
| #1  | сам cart                                                               | trace-close                   | closing comment с полным trace                                                                                                                                                   |

Squash: PR #37 → `efea86c chore: завершить housekeeping карты #1`. Tag `v1.0.0` уже был создан ранее через PR #36.

## Non-obvious drift

### `make check` падает на `CHANGELOG.md` формат

Release-please (post-PR-#23) записал `CHANGELOG.md` с `*`-bullets; oxfmt хочет `-`. **Pre-existing** в момент интеграции первого тикета (#6).

Решено добавлением `"CHANGELOG.md"` в `.oxfmtrc.json` `ignorePatterns` рядом с `openapi.yaml` (тот же precedent в `AGENTS.md` rule #9: "не правьте generated-артефакты; пусть их пишет их инструмент"). Закоммичено в `114441d` как `chore(fmt): exempt release-please CHANGELOG.md from oxfmt`.

### `Closes #NN` в commit body НЕ закрывает при squash

GitHub `Closes` keyword для auto-close работает от **merge-commit message** или **PR description**, не от merged commits. Поэтому:

- В PR #37 description ставились `Closes #6 #7 #9`.
- Внутри integration branch commit body НЕ ставилось `Closes` (коммит `5a49fdd` имеет `Closes #6`, но это не работает при squash; коммит закрылся только через PR).
- #8 / #18 закрывались **вручную комментарием + `gh issue close`**, так как merge этих тикетов не было.

### Fork-protection workaround через `git reset --hard origin/main`

Cherry-pick `e9fa122` (A2) сначала упал в конфликт из-за локального main отставания от origin/main при `merge --ff-only`. Решено:

1. `git cherry-pick --abort`.
2. `git fetch origin && git reset --hard origin/main` (синхронизация с remote).
3. Повторный cherry-pick.

Воспроизводится при рассинхроне, но в orchestrator с этим надо жить осторожно (`--force-with-lease` на push, никогда `--force`).

## Code review findings

**Standards axis** нашёл 2 issues:

1. **ADR-0002 вне existing template:**

   - (a) YAML frontmatter (lines 1–7); у ADR-0001/0003 frontmatter отсутствует — у новой ADR его быть не должно.
   - (b) `## Статус` (Russian) → должен быть `## Status` (English) — оба существующих ADR используют English.
   - (c) Section order нестандартный: ADR-0001 имеет `Status → Контекст → Альтернативы → Следствия`; ADR-0003 — `Status → Контекст → Решение → Альтернативы → Следствия`. Новая ADR имела `Контекст → Решение → Следствия → Альтернативы → Статус`.

   Все 3 фикса в коммите `158a3f9`.

2. **`AGENTS.md` rule #9 слишком узкий:** называл только `openapi.yaml` и generated SDK. ADR-0003 commit body обещал расширить на `CHANGELOG.md` и `package.json#version`, но в `AGENTS.md` не внёс. Fix: rule #9 в `158a3f9` переписан, чтобы покрыть все 4 generated artifacts.

**Spec axis** нашёл 1 issue:

- README «Ограничения» bullets «Один процесс» и «Конкурентность» линковались только на ADR-0001; spec #9 явно просил «расширение ADR-0002». Fix в `158a3f9`: оба bullets получили link на ADR-0002 рядом с ADR-0001.

## Trace

- Squash PR #37 → `efea86c`. 16 wayfinder tickets cart #1 CLOSED: #1, #2 #3 #4 #5 #6 #7 #8 #9 #13 #18 #19 #20 #21 #22 #24.
- Tag `v1.0.0` создан ранее через release-please + PR #36 (`1383906`).
- Release-please post-PR-#37 run `41733342966` — completed **success**, **no new release PR** (post-1.0.0 + non-feat commits → no bump). Поведение release-please после fix'ов `.github/workflows/release-please.yml` (убран `workflow_run` self-trigger; выставлены `default_workflow_permissions=write` через API).

## Open follow-ups

- Видимых нет — карта #1 полностью закрыта. Следующий фронт — карта #26 UI & E2E (см. манифест ниже).
