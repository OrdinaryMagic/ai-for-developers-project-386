# 2026-11-04 — Cart #42 «Dockerize booking-api v1 backend»

`@implement-spec` для карты #42 — Shopify-style Docker image + секрет-скан pipeline. Cart чартована в прошлой `docker-chart-and-tickets` session (manifest оттуда же). Эта session — implementation + code-review + fix-ups + close-out.

## Что сделано

10 коммитов на integration `chore/cart-42-dockerize` (последовательно FF-merge'нуты из wave-1/2/3 feature branches, потом cherry-picked fix-ups).

| #   | Subject                                                                                   | SHA       | Зачем                                                                                      |
| --- | ----------------------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------ |
| 1   | `feat(ci): Dockerfile + .dockerignore for booking-api v1 backend (#43)`                   | `53fc005` | Multi-stage Node 22 image + exclude `.git`, `web/`, `tests/`, и т.д.                       |
| 2   | `chore(security): add .gitleaks.toml with allowlist for doc SHAs and test fixtures (#47)` | `02a4d41` | Базовая конфиг с `useDefault` + 5 path allowlist'ов + 1 JWT rule (последующая правка ниже) |
| 3   | `docs(docker): add Docker section to README and AGENTS (#45)`                             | `0d1f270` | Документация ENV-контракта для пользователей и для следующих агентов                       |
| 4   | `ci(docker): add image-build+smoke job to ci.yml (#46)`                                   | `ef263c8` | Новый `docker:` job в workflow                                                             |
| 5   | `chore(security): wire gitleaks into hk pre-commit (#48)`                                 | `24d23a7` | Local pre-commit step. Изначально нерабочий (см. drift)                                    |
| 6   | `ci(security): add gitleaks scan step to check job (#49)`                                 | `ad831e9` | CI scan через `gitleaks/gitleaks-action@v2`                                                |
| 7   | `fix(security): install gitleaks via mise and drop npx wrapper (#59)`                     | `5975fdc` | Fix-up «npx --yes gitleaks@8.18.4» нерезолвится (см. drift)                                |
| 8   | `docs(security): document gitleaks end-to-end smoke test (#44)`                           | `fa1c743` | `scripts/gitleaks-smoke.sh` + README Security                                              |
| 9   | `ci(docker): extend smoke with /meeting-types endpoint check (#46)`                       | `3ae0c91` | Fix-up code-review Spec #46                                                                |
| 10  | `fix(security): consolidate gitleaks test-fixture paths into global allowlist (#47)`      | `8ed68a2` | Fix-up code-review Standards                                                               |

После squash-merge в PR #60 (`3c54921` на `origin/main`) — 8 leaf tickets авто-закрылись: **#43, #45, #46, #47, #48, #49, #50, #59**. Parent **#42** остаётся OPEN (wayfinder-map index; не закрывается).

## Non-obvious drift

### 1. Баг в спецификации #48 — `npx --yes gitleaks@8.18.4` нерезолвится

Оригинальная спецификация #48 предписывала: `npx --yes gitleaks@8.18.4 protect --staged --redact=20 --verbose --no-banner` в `hk.pkl`. Реализация #48 была AC-верной, но **на runtime упадёт** с `npm error code ETARGET / npm error notarget No matching version found for gitleaks@8.18.4`. Причина: upstream `gitleaks` (от `zricethezav`) дистрибутируется только через GitHub releases; npm не публикует этот пакет.

**Resolution**: открыт ticket **#59** «Fix gitleaks wiring: install via mise [tools], strip npx from hk.pkl». Implementer добавил `gitleaks = "8.18.4"` в `[tools]` секцию `mise.toml` (mise умеет забирать gitleaks из GitHub releases), и `hk.pkl` стал использовать bare `gitleaks` команду. AC-литерал в #48 был неверным; #59 его отменяет.

### 2. Spec gap в #46 — `/meeting-types` smoke-check пропущен

Implementer #46 добавил smoke-curl на `/health` и `/`, но **забыл `/meeting-types`** — а в спеке это было явно: «smoke-чек: `curl /health` → 200, плюс `curl /meeting-types` → 200 (или 404)». Стандартная регрессия в AC compliance. Code-review (Spec ось) поймал, fix-up `3ae0c91` добавил curl.

### 3. Мёртвая `[[rules]]` блокировка в `.gitleaks.toml` (№47)

Implementer #47 ввёл блок `[[rules]] id = "jwt-via-test-fixtures"` с **пустым** rule body (только `allowlists` по path). gitleaks парсит это как rule, который **ничего не матчит** — соответственно к `allowlists` ни один regex не приходит и они unreachable. Code-review (Standards ось) поймал: «either rename to allowlist-test-fixtures and move paths to the global allowlist, or document the indirection». Fix-up `8ed68a2` объединил path'ы в global `[allowlist]` block.

### 4. CI-gate #49 — два runtime-сюрприза после squash-merge

a. **Fetch depth.** `gitleaks/gitleaks-action@v2` использует `git log --no-merges --first-parent HEAD~1..HEAD`. Default `actions/checkout@v7` имеет `fetch-depth: 1` → `HEAD~1` не в локальном clone → action error: `fatal: ambiguous argument '3ae0c91^..HEAD'`. Fix-up `8a13241`: `with: fetch-depth: 0`.

b. **`results.sarif` в oxfmt scope.** Action пишет SARIF report в `$GITHUB_WORKSPACE/results.sarif`. После этого `mise run check` запускает `oxfmt --check .` и жалуется, что SARIF-файл не отформатирован. Fix-up `e0c1b83` (`fix(fmt): exclude results.sarif from oxfmt check (#49)`): добавил `"results.sarif"` в `.oxfmtrc.json#ignorePatterns`.

Оба fix-up'а — это «know-how», которого не было в спеках; CI показал их на первом push.

### 5. #50 — split фикстуры на runtime-construction

В `scripts/gitleaks-smoke.sh` строка-фикстура `AKIAIOSFODNN7EXAMPLE` была бы задетектирована самой собой при `gitleaks detect --source .` (запускается локально разработчиком и при `hk check`). Implementer разделил literal на `PREFIX="AKIA"` + `SUFFIX="IOSFODNN7EXAMPLE"`, конкатенируя в shell. Staged reconstructed file триггерит detection; script file on-disk — clean.

## Code-review findings

Запущены **Standards** и **Spec** axes параллельно (через `@code-review` skill). Результаты:

### Standards axis (ces_e5c24cbc5ffe2P1CRLExo3LgLu)

- ✅ Никаких hard rule violations против AGENTS.md (#1, #2, #3, #5, #7, #8, #9, #10, #11).
- ⚠️ **Judgement call (FINDING 2)**: `.gitleaks.toml#[[rules]] jwt-via-test-fixtures` — empty rule body, dead code. **Fix-up landed** как `8ed68a2`.
- ⚠️ **Judgement call (FINDING 3)**: `hk.pkl#["gitleaks"]` byte-identical `check` и `fix` строки. **Accept as-is** — задокументировано comment в `.pkl`; structural consistency.
- ⚠️ **Judgement call (FINDING 4)**: commit `feat(ci)` scope для Dockerfile. **Accept as-is** — convention only.

### Spec axis (ces_e5c24cbc4ffeAEQuQU0DzsV7HC)

- ❌ **Hard miss (FINDING 6)**: ticket #46 required `/meeting-types` curl, отсутствовал. **Fix-up landed** как `3ae0c91`.
- ⚠️ **Soft miss (FINDING 7)**: subjects #47/#48/#49 не заканчиваются на `(#44)`. Per AGENTS.md rule #8 — implementation commit references the ticket it makes. **Accept as-is** — согласуется с rule #8.
- ⚠️ **Soft miss (FINDING 8)**: #50 smoke script invokes `gitleaks protect` directly, не через `hk check`. **Accept as-is** — narrower-but-pragmatic.
- ⚠️ **Soft miss (FINDING 9)**: literal AC #48 `npx --yes gitleaks@8.18.4` superseded by #59. Documented.
- ⚠️ **Soft (FINDING 1–5)**: scope creep additive in `.dockerignore` patterns, `.gitleaks.toml` extra allowlist path `^docs/agents/security/.*\.md$`, use of `docker/setup-buildx-action@v3`, and `[[rules]]` shape — все additive; защищены в #47 aliasing log.

## Post-merge CI fix-ups

После первого push в PR #60 CI показал два runtime-сюрприза, которых spec'ы не покрывали:

| SHA       | Subject                                                                   | Source-finding                                     |
| --------- | ------------------------------------------------------------------------- | -------------------------------------------------- |
| `8a13241` | `fix(ci): checkout full git history so gitleaks-action@v2 can scan (#49)` | `git rev-parse HEAD~1` fails with `fetch-depth: 1` |
| `e0c1b83` | `fix(fmt): exclude results.sarif from oxfmt check (#49)`                  | `oxfmt --check .` complains on SARIF artifact      |

Эти два выкатились через **force-push** в integration branch до merge (а не отдельным PR), потому что это были gating bugs — без них PR не прошёл бы CI.

## Trace

- **Squash-merge PR #60** → `3c54921` на `origin/main`. Squash-коммит был пересоздан через 3 минуты после первого merge'а: `55a747c` и `3c54921` — одно и то же дерево (`ebc1cf1`), но в `main` лежит `3c54921`; `55a747c` не является предком `main` (историю переписали). Канонический SHA — `3c54921` (исправлено в closure-сессии 2026-11-04, PR #65).
- **Auto-closed** через PR body `Closes #43 #45 #46 #47 #48 #49 #50 #59`: все 8 листьев.
- **#42 (parent wayfinder:map)** остаётся OPEN — индексная карта, не leaf.
- **#44 (research)** остаётся OPEN — research deliverable на `origin/research/secret-audit` уже закоммичен и referenced через manifest of `docker-chart-and-tickets` session; **можно закрыть** через `gh issue close #44` в cart-closer cleanup (параллельно с #42).
- **release-please**: поведение на этом push ещё не rendered (next push триггерит manifest на squash commit `3c54921`). Это chore-коммит (тэг по карте не feat) **minor будет skip'нут**, не увидим нового релиза.
- **CI на main**: Project checks + Build Docker image + E2E Playwright + hexlet-check — все 4 green.

## Open follow-ups

- **`#52` Production deployment for booking-api v1 (post-image)** уже charterед в deploy-to-tickets session. Это продолжение cart #42, не зависит прямо от merge — research-frontier сейчас `#53`. Делать когда пользователь даст `@implement-spec / 53` или эквивалент.
- **`#42` index close-out**: можно опционально пометить как решенный archival через `gh issue close 42 --comment "Delivered: PR #60 squash as 3c54921. 8 leaves auto-closed."` — это manual arch-комментарий, не removal. Делать если пользователь просит.
- **`#44` research** можно параллельно закрыть.
- **Code Scanning / SARIF upload** — research notes §5 рекомендует opt-in позже. Ticket ещё не открыт. Когда устоится pipeline — отдельная карта «Observability / SARIF».
- **`gitleaks` version pin** — 8.18.4 фигурирует в 4 местах (.gitleaks.toml comment, mise.toml, hk.pkl comment, и action cache). При бампе версии синхронизация — manual или отдельный ADR.

## Cleanup done

Все wave-1/2/3 worktree's + `cart-42-dockerize` integration tip + `cart-42-fixup` worktree удалены. Удалены branches `feat/cart-42-4{3,5,6,7,8,9,50,9}` + `fix/cart-42-review` + `chore/cart-42-dockerize` (ни одна не была push'нута на origin, кроме самой integration — удалена после merge). `research/secret-audit` оставлена как data layer для будущих gitleaks-сессий.
