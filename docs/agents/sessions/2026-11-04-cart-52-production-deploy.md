# 2026-11-04 — Cart #52 «Production deployment» — deploy-конфиг, secrets, DNS/TLS, smoke

`@implement-spec` для карты **#52** «Production deployment for booking-api v1 (post-image)». Ветка интеграции: `chore/cart-52-production-deploy`, PR **#61** (base `main`). Платформа — Fly.io (ADR-0004, research-волна #53).

Карта переводит booking-api из «Docker image собран» (карта #42) в «сервис на managed-платформе». Реализованы шесть листьев; живое provisioning DNS/TLS невозможно в среде (нет домена и Fly-аккаунта) ⇒ **#56 остаётся OPEN**, остальные листья закрываются merge'ом PR.

## Что сделано

| Тикет                | Артефакты                                                                                                                                      | Коммиты в интеграции                                  |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| #53 research         | ADR-0004 (`docs/adr/0004-hosting-platform.md`, status `accepted`)                                                                              | `88f01c7`, `5f02e85`                                  |
| #54 deploy-конфиг    | `fly.toml`, `test/fly-toml.test.ts`                                                                                                            | `90ee0a0`                                             |
| #55 secrets          | `docs/agents/production-secrets.md`, `.env.example`, `test/production-secrets.test.ts`, README «Secrets»                                       | `d87ce82`                                             |
| #56 DNS/TLS          | `docs/agents/production-dns-tls.md`, `force_https = true` в `fly.toml`, README «DNS / TLS»                                                     | `52f358a`, `a93e26e`                                  |
| #57 smoke            | `scripts/production-smoke.sh` (100755), `test/production-smoke.test.ts`, README «Post-deploy smoke»                                            | `d66b54d`                                             |
| #62 публичный URL    | README «Production deploy», `test/production-url.test.ts`                                                                                      | `66a69b8`                                             |
| #63 MCP-конфигурация | `.opencode/opencode.json`, `docs/agents/production-mcp.md`, `test/project-mcp-config.test.ts`, README «MCP»                                    | `ab799c4`                                             |
| правки ведущего      | ADR-0004 (region `iad`, MCP-паритет, runtime-граница инстансов), `GLOSSARY.md`, README «Ограничения», `.gitignore`, cross-ref runbook → README | `d1b862d`, `baee62f`, `ec2889c`, `d2d0c8f`            |
| fix-волна ревью      | region-проверка, runtime-граница инстансов, валидация env в smoke, общие хелперы тестов, формулировки `.env.example`                           | `07a3c3d`, `edd2e77`, `2fe0a45`, `926d8c9`, `f024695` |

Листья #54, #55, #56, #57, #62, #63 реализованы отдельными implementer-субагентами в worktree'ах `.worktrees/tk-*`, перенесены в интеграцию cherry-pick'ом (см. «Trace»).

## Non-obvious drift

1. **`[[services.checks]]` и `[[services.tls]]` — несуществующие ключи fly.toml.** Они были в первоначальной редакции ADR-0004 и в теле карты #52. Реальная схема: `[http_service]` + `[[http_service.checks]]` (TLS — `[http_service.tls_options]`), для TCP-сервиса — `[[services]]` + `[[services.http_checks]]`. Проверено по исходникам flyctl (`internal/appconfig/service.go`). Исправлено в ADR, в карте и в `fly.toml`.
2. **`internal_port` по умолчанию 8080**, а приложение слушает `process.env.PORT` (3000) ⇒ без `internal_port = 3000` Fly Proxy получает connection refused. Неочевидно, потому что 8080 — стандарт для платформ, а здесь порт из env.
3. **В `fly.toml` нет ключа max-instances.** Максимум = число созданных Machines; верхняя граница 1/1 задаётся runtime-командой `fly scale count 1 --max-per-region 1` (флаг `--max-per-region` подтверждён по docs.fly.io/docs/flyctl/scale-count). Никакой версии конфига это не фиксирует ⇒ масштабирование >1 ломает single-writer из ADR-0002, и ловить это может только ревью. Команда записана в `fly.toml`, README и runbook'е — согласованность трёх мест проверяет drift-тест.
4. **Scale-to-zero выключен по AC #54** (min/max 1/1), хотя ADR-0004 описывал v1 как scale-to-zero (`min_machines_running = 0`, cold-start ~2s). Итог: always-on **$2.19/мес** вместо ~$0.33, и warm-up-retry в smoke больше не обязателен (оставлен как safety net на рестарт машины при rolling-деплое).
5. **Дефолт Fly для `auto_stop_machines` — `"off"`**, а в ADR было `"stop"` ⇒ в `fly.toml` значение выставлено явно.
6. **#56 — runbook, а не живой provisioning.** В среде нет домена и Fly-аккаунта ⇒ реализованы процедура + `force_https` в конфиге; фактическое provision'ирование — за владельцем релиза, тикет остаётся OPEN.
7. **MCP-паритет.** Официальный MCP есть у всех трёх кандидатов (Fly `https://mcp.fly.io`, Render `render-oss/render-mcp-server` + OpenCode-плагин и 21 скилл, Railway — `railway mcp install --remote`), то есть наличие MCP **не различает** платформы. Решение владельца — оставить Fly.io; факт зафиксирован в ADR-0004.
8. **`.env.example` содержит дефолты из кода**, а не «форму без значений», как сформулировано в AC #55. Интерпретация: AC запрещало класть в репо реальные значения/секреты; дефолты (`PORT=3000`, `OWNER_NAME=Demo Owner`) публичны и выведены из кода. Файл не менялся — исправлены формулировки в README и runbook («шаблон: имена + дефолты из кода; секретов нет») и добавлены drift-тесты на совпадение значений с контрактом #55.
9. **Имя Fly-приложения глобально-уникально** ⇒ канонический URL выводится из ключа `app` в `fly.toml`, а не хранится ручной копией; drift ловит `test/production-url.test.ts`.
10. **`.opencode/` был в `.gitignore`** ⇒ проектная MCP-конфигурация (#63) не попадала в индекс. Правило сужено до `.opencode/*` + `!.opencode/opencode.json`.
11. **Agent-worktree'ы живут внутри репозитория** (`.worktrees/`) ⇒ их содержимое попадало и в `git status`, и в прогоны oxlint/oxfmt. Исключено в `.gitignore`, `.oxfmtrc.json`, `.oxlintrc.json`.
12. **Парсер `app` в `scripts/production-smoke.sh` остался отдельной реализацией** — общий TS-хелпер в bash не переносится (языковая граница), поэтому дублирование «top-level key из TOML» осталось в двух языках.

## Code review findings

Прогон skill `code-review` по осям Standards и Spec от `origin/main` (240 тестов / 18 файлов). Фиксы влиты в интеграцию одной волной из 5 коммитов (`07a3c3d`…`f024695`).

**Standards**

- **Вакуумная проверка региона в `test/fly-toml.test.ts`** (реальный баг): `allValues` возвращал значения с кавычками (`"iad"`), а список кодов — без, ⇒ `includes` не срабатывал и кейс «single primary region» был всегда зелёным. Исправлено (`unquoted()` вместо `str()`); проверено мутацией — до фикса `region = "fra"` в `fly.toml` давал зелёный тест, после — красный.
- **Противоречие README ↔ `fly.toml`** про верхнюю границу инстансов («верхняя граница — в `fly.toml`» vs «в схеме fly.toml такого ключа нет»). Исправлено в README, `fly.toml`, runbook и ADR-0004; тест «`max_machines_running` отсутствует» заменён на проверку **согласованной документированной процедуры** `fly scale count 1 --max-per-region 1` во всех трёх местах + предупреждение про single-writer.
- **Противоречие «без значений» ↔ значения дефолтов** в `.env.example` — исправлены формулировки (см. drift #8).
- **Shell-скрипт не валидировал `SMOKE_RETRY_DELAY`/`SMOKE_CURL_TIMEOUT`** ⇒ `sleep abc` ронял скрипт на `set -e` без итогового `PASS`/`FAIL`. Исправлено: единая `validate_uint` для всех трёх числовых env + понятная ошибка в stderr + non-zero exit со сводкой.
- **shellcheck 0.11 по `scripts/production-smoke.sh`**: одно info-замечание `SC2016` на блоке `node -e '…'` (ложное — JS намеренно в одинарных кавычках) ⇒ добавлена директива `# shellcheck disable=SC2016` с пояснением; прогон теперь чистый.
- **Дублирование в тестах** (`stripComment`, `readmeSection`, чтение top-level `app`, сканер секретов — по 2–3 копии) ⇒ общее вынесено в `test/helpers/` (`toml.ts`, `readme.ts`, `secrets.ts`); `str()` переименован в `unquoted()`. Число тестовых файлов не изменилось (vitest берёт только `*.test.ts`).
- **Нет `Closes #NN` в телах коммитов** (rule #8: reference сам по себе тикет не закрывает) ⇒ закрытие листьев сделано на уровне PR-description.
- **Отклонено (ложное срабатывание):** «тавтология» в `test/production-secrets.test.ts` — `EXPECTED_ENV_VARS` и `CODE_ENV_VARS` два независимых литерала (первый — из AC #55, второй — из скана исходников), а не производные друг от друга; тавтологии нет.
- **Отклонено (осознанно):** subjects коммитов research-волны (`88f01c7`, `5f02e85`) не в шаблоне `type(scope): subject` и содержат литеральный escape `\u2014`. Переписывание потребовало бы force-push интеграционной ветки и изменило бы SHA всех 19 коммитов; те же сообщения есть на `origin/research/52-hosting`, поэтому переписывание одной копии породило бы расхождение между ветками. Зафиксировано как известный косметический дефект.
- **Заголовок README «Production deploy»** — единственный со словом в нижнем регистре среди англоязычных заголовков; оставлен, потому что название задано AC тикета #57.

**Spec**

- **AC #54 «min/max 1/1» закрыт наполовину:** максимум невыразим в `fly.toml` ⇒ зафиксировано как runtime-процедура (см. drift #3) и теперь проверяется тестом на согласованность документации.
- **AC #57 «shell check, если есть»** — условие пустое: shellcheck не в тулчейне репо (`mise.toml`/`hk.pkl` его не ставят, oxlint shell не линтит). Скрипт проверен shellcheck 0.11 вручную, замечания устранены; добавление shellcheck в тулчейн — follow-up.
- **Отсутствовал манифест implementation-волны** (AGENTS.md, раздел «История implement-spec сессий») — этот файл.
- **Отклонено:** `.worktrees/`-исключения и правка имён `OWNER_*` в README — формально вне AC семи тикетов, но это исправление неверных env-имён и сломанной гигиены линтера; оставлено с фиксацией здесь.
- **Отклонено:** «4 из 5 новых test-файлов не запрошены AC» — drift-тесты здесь практика репозитория (AGENTS.md rule #4: типы тестов — зона vitest; проектные drift-тесты уже есть в `test/contract/`), а AC #62 прямо требует drift-тест. Каждая проверка привязана к конкретному AC (env-контракт #55, health-check #54, MCP #63, smoke #57).

## Trace

- PR #61 — base `main`, head `chore/cart-52-production-deploy`; в теле PR `Closes #54 #55 #57 #62 #63`. **Смержен squash'ем: `268ef9a`** (`chore(deploy): production deployment для booking-api v1 — config, secrets, DNS/TLS, smoke (#52) (#61)`).
- SHA в таблице «Что сделано» — **pre-squash**, коммиты интеграционной ветки `chore/cart-52-production-deploy` (ветка осталась на origin ⇒ SHA достижимы). Squash-коммит на `main` — `268ef9a`.
- Коммиты интеграции линейные, merge-коммитов нет (`git log --merges` пуст). Листья переносились cherry-pick'ом с проверкой patch-id (#54 — `7772b24d`, #63 — `53e6e78a`; для #56/#57 сверено содержимое деревьев, т.к. README-патчи переносились с разрешёнными конфликтами).
- Листья закрыты merge'ом PR: **#54, #55, #57, #62, #63** (canonical-комментарий в каждом тикете). Карта **#52** остаётся OPEN по конвенции wayfinder (карты не закрываются авто-merge'ом), **#56** — по факту живого provisioning.
- CI на интеграционной ветке и на `main` (`268ef9a`): `CI` (typecheck → lint → format → test → регенерация OpenAPI/SDK) и `hexlet-check` — success. `release-please` отработал без релиза: squash-коммит — `chore(deploy)`, релиз не триггерится (как и в cart #42, PR #60).
- `make check` на финальном коммите: **251 тест / 18 файлов**, зелёные (было 165 / 13 на `origin/main`).

## Open follow-ups

- **Graceful shutdown.** В `src/server.ts` нет hook'а на SIGTERM ⇒ при rolling-деплое in-flight запросы могут оборваться. Вне scope карты #52 (рантайм-код не трогали).
- **256MB RAM тесновато** для Node + `swagger-ui`; escape hatch — `fly scale vm`/`memory` до 512MB (~$3.69/мес).
- **Shellcheck в тулчейн репо** (`mise.toml` [tools] + шаг в `hk.pkl`) — тогда AC #57 «shell check» станет непустым условием.
- **Живое provisioning DNS/TLS** (домен + Fly-аккаунт) — за владельцем релиза, процедура в `docs/agents/production-dns-tls.md`.
- **Имя `booking-api` может быть занято** на fly.io ⇒ при `fly apps create` владелец правит `app` в `fly.toml` и URL в README в том же PR (drift-тест поймает расхождение).
- **Сканер credential-значений применим пока к `.env.example`**: на прозе runbook'а (`credential:`, пример `TOKEN="a#b"`) он даёт ложные срабатывания ⇒ для markdown-документов нужен отдельный режим.
- **Использование smoke-скрипта в CI** — сейчас docker-job в `.github/workflows/ci.yml` дублирует curl'ы руками; замена на `scripts/production-smoke.sh` — кандидат в следующую итерацию (AC #57 выносит CI-интеграцию в v2).
