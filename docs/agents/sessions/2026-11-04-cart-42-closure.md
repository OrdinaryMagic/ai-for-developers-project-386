# 2026-11-04 — Cart #42 «Dockerize booking-api v1 backend» — closure-сессия

`@implement-spec` для карты **#42** «Dockerize booking-api v1 backend». Implementation-волна уже была выполнена ранее (PR #60, squash `3c54921`); эта сессия — **close-out**: аудит поставки против AC карты, перенос research-отчёта в `main`, исправление найденных дыр, закрытие карты и её последнего research-тикета.

Ветка интеграции: `chore/cart-42-closure` (base `origin/main` @ `5e05e6f`), PR **#65**.

## Что сделано

| Коммит    | Subject                                                                                 | Зачем                                                                                                                                                                                                                                              |
| --------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `957cac4` | `docs(security): отчёт аудита секретов перенесён из research-ветки в main (#44)`        | Research-отчёт #44 из throwaway-ветки `research/secret-audit` → `docs/agents/security/secret-audit-2026-11-04.md` в `main`; §8 «Status» переписан, добавлен §9 «Как это реализовано» (таблица отклонений реализации от сниппетов research-отчёта). |
| `b90ed77` | `fix(docker): запускать контейнер от непривилегированного пользователя (#42)`           | `USER node` в runtime-stage `Dockerfile` — контейнер больше не работает от root.                                                                                                                                                                   |
| `3b8fe3c` | `fix(security): строгий ассерт в smoke-скрипте gitleaks и честный .gitleaks.toml (#42)` | `scripts/gitleaks-smoke.sh`: exit ≠ 0 больше не значит PASS; сканирование привязано к корню репо; мёртвые allowlist-регексы удалены, комментарии переписаны.                                                                                       |
| `f1eb824` | `docs(readme): синхронизировать список hk-шагов и убрать monorepo-leftover (#42)`       | README: в список hk-шагов добавлен gitleaks; убраны bullet'ы про `sdocs/` и `/home/om/nanogitlab/hk.pkl` (leftover другого проекта).                                                                                                               |
| `9ad852d` | `docs(sessions): исправить squash-SHA PR #60 в манифесте карты #42 (#42)`               | Канонический squash-коммит PR #60 — `3c54921`, а не `55a747c` (коммит пересоздан; дерево то же — `ebc1cf1`).                                                                                                                                       |
| `—`       | `docs(sessions): манифест closure-сессии карты #42 (#42)`                               | Этот файл + строка в `docs/agents/sessions/README.md`.                                                                                                                                                                                             |

Runtime-код приложения не менялся: implementation карты #42 была delivered и проверена; правки — Dockerfile (контейнер), скан-контур секретов и документация.

SHA в таблице — **pre-squash** (коммиты ветки `chore/cart-42-closure`, удалённой после merge). Squash-коммит на `main` — `ffd9617`, см. «Trace».

## Аудит поставки против AC карты

Цель аудита — проверить, что **листья закрыты, а AC реально выполнены**, а не просто «тикеты зелёные». Аудит шёл втроём: отдельный explore-субагент (статика по AC #42–#50), живой прогон образа в этой сессии и эмпирические проверки поведения gitleaks.

### Runtime-контракт (живой прогон, не разбор кода)

```
docker build -t booking-api:audit .
docker run -d --name booking-api-audit --env PORT=3999 -p 127.0.0.1:3999:3999 booking-api:audit
```

| Проверка                  | Ожидание (AC карты)                                           | Факт                                                                        |
| ------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------- |
| PID 1 в контейнере        | `node dist/server.js`, без шелла                              | `node dist/server.js` (`docker top`, `/proc/1/cmdline`) ✅                  |
| `PORT` из env             | слушает заданный порт                                         | `--env PORT=3999` ⇒ `GET /` → 200, `GET /health` → 200 `{"status":"ok"}` ✅ |
| Порт по умолчанию         | 3000 (`process.env.PORT ?? 3000`)                             | без `--env PORT` ⇒ 3000 отвечает 200 ✅                                     |
| `HOST` внутри контейнера  | `0.0.0.0` (dev-дефолт `127.0.0.1` из `mise.toml` не подходит) | `ENV HOST=0.0.0.0` в runtime-stage ✅                                       |
| Пользователь в контейнере | не root (hardening)                                           | было root ⇒ **исправлено** (`USER node`, uid 1000) ✅                       |
| Секреты в образе          | нет                                                           | только prod-зависимости (`npm ci --omit=dev`), ни одного env с секретами ✅ |

Контейнеры и образы после прогонов удалены (`docker rm -f`, `docker rmi`).

### Статический аудит (по коду)

| AC                                  | Где реализовано                                                                                                                                                                                                      | Вердикт                      |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| Multi-stage image, только prod-deps | `Dockerfile`: `builder` (`npm ci` + `npm run build`) → `runtime` (`npm ci --omit=dev`, `COPY --from=builder /app/dist ./dist`)                                                                                       | ✅                           |
| Автостарт без шелла                 | `CMD ["node", "dist/server.js"]` (exec form ⇒ PID 1 = node, `docker stop` шлёт SIGTERM процессу)                                                                                                                     | ✅                           |
| `PORT` управляемый извне            | `ENV PORT=3000` в Dockerfile — только fallback; `--env PORT=…` перебивает; `EXPOSE $PORT`                                                                                                                            | ✅                           |
| `.dockerignore`                     | `Dockerfile` не тянет `web/`, `.git/`, тесты в образ; `npm ci` не ломается (в `package.json` нет `workspaces`)                                                                                                       | ✅                           |
| gitleaks-контур                     | `.gitleaks.toml` + `hk.pkl` (pre-commit, `protect --staged`) + `gitleaks-action@v2` в CI + `scripts/gitleaks-smoke.sh` + `mise.toml [tools] gitleaks = "8.18.4"`                                                     | ✅ (после правок — см. ниже) |
| CI image-build + smoke              | job `docker` в `.github/workflows/ci.yml`: buildx build (`booking-api:ci`, GHA layer-cache) → `docker run --env PORT=3030` → poll `/health` до 30 с → curl `/health`, `/`, `/meeting-types` → cleanup `if: always()` | ✅                           |
| Документация                        | README «Docker», README «Security», AGENTS.md «Docker»                                                                                                                                                               | ✅ (после правок — см. ниже) |
| `make check`-совместимость          | Dockerfile/CI не трогают `mise run check`; `scripts/gitleaks-smoke.sh` чистит индекс и рабочее дерево                                                                                                                | ✅                           |

Прогон `gitleaks detect --source . --log-opts="--all"` по **всей** доступной истории — clean (gitleaks: 77 commits scanned на момент финальной проверки; счётчик растёт от merge'ей, поэтому в разных прогонах отличается).

## Найденные дыры и что с ними сделано

Аудит нашёл пять реальных расхождений — все исправлены в этой ветке.

1. **Контейнер работал от root** (`Dockerfile` без `USER`). Не AC карты, но явный hardening-пробел. **Фикс** (`b90ed77`): `USER node` в runtime-stage. Проверено вживую: `docker exec … id` → `uid=1000(node)`, PID 1 по-прежнему `node dist/server.js`, `/` и `/health` → 200. App ничего не пишет на диск (store — в памяти), поэтому root-owned файлы остаются читаемыми без `chown`.
2. **`scripts/gitleaks-smoke.sh` давал false PASS.** Ассерт был «любой exit ≠ 0 ⇒ PASS», поэтому exit 127 (`gitleaks` не в PATH) или ошибка конфига выглядели как «секрет пойман». **Фикс** (`3b8fe3c`): PASS только при exit `1` (код gitleaks «leaks found») **и** наличии в выводе правила `aws-access-token`; любой другой код — FAIL с объяснением. Проверено: при `PATH=/usr/bin:/bin` скрипт теперь даёт `❌ FAIL: gitleaks exited with 127` и exit 1 (раньше — PASS).
3. **Smoke-скрипт зависел от текущего каталога.** `gitleaks protect --staged` вызывался без указания корня ⇒ из подкаталога скан шёл не по тому репо. **Фикс** (`3b8fe3c`): скрипт делает `cd "${ROOT}"` и передаёт `--source "${ROOT}"`. Проверено: запуск из `docs/agents/` → PASS.
4. **`.gitleaks.toml` содержал мёртвые allowlist-регексы.** Проверено эмпирически: gitleaks применяет `[allowlist].regexes` к **значению секрета** (`fragment.Secret`), а не к строке. Поэтому `` `[0-9a-f]{7,40}` `` и `integrity": "sha512-…"` не могли сработать никогда — комментарии обещали несуществующую защиту. **Фикс** (`3b8fe3c`): мёртвые регексы удалены, комментарии переписаны с реальной семантикой. Заодно зафиксировано, почему path-allowlist нужен: markdown-доки цитируют AWS-docs ключ `AKIAIOSFODNN7EXAMPLE` (документация smoke-фикстуры), а `aws-access-token`-rule его флажит — full-history скан без doc-путей даёт ровно 3 находки, все про этот ключ. Blanket-allowlist чистого hex **намеренно не добавлен**: 40-hex секрет рядом с `api_key =` — реальная форма credential'а, и такой allowlist замаскировал бы настоящую утечку (SHA без credential-ключевого слова и так не флаятся).
5. **README расходился с кодом.** В списке hk-шагов не было gitleaks; два bullet'а (`sdocs/`, `/home/om/nanogitlab/hk.pkl`) остались от другого проекта, а `hk.pkl` вообще не фильтрует commit-msg по `sdocs/`. **Фикс** (`f1eb824`): список шагов дополнен, leftovers убраны, описание smoke-чека приведено в соответствие с новым строгим ассертом.

## Non-obvious drift

1. **Research-отчёт #44 жил только на throwaway-ветке.** Тикет «Audit repo history + pick tool» был закрыт как research, но его deliverable (`docs/agents/security/secret-audit-2026-11-04.md`) существовал лишь в `origin/research/secret-audit` — вне `main`, вне `git log` обычного разработчика. Реализация (#47–#50, #59) в `main` была, а обоснование выбора инструмента — нет. Место под отчёт было запланировано с самого начала: allowlist-путь `^docs/agents/security/.*\.md$` появился в `.gitleaks.toml` ещё в #47. **Фикс**: отчёт перенесён в `main` (путь allowlist'а сработал как задумано), §8 переписан (было «Issue NOT closed»), добавлен §9 «Как это реализовано» — таблица отклонений реализации от сниппетов research-отчёта (npx→mise, `fetch-depth: 0`, `results.sarif` в `ignorePatterns`, глобальный path-allowlist вместо `[[rules]]`, `scripts/gitleaks-smoke.sh`). Отчёт **не** дублируется в README — канон по конвенции трекера лежит в Decisions so-far карты.
2. **Squash-коммит PR #60 был пересоздан.** `55a747c` и `3c54921` — одно дерево (`ebc1cf1`), но в `main` лежит `3c54921`; `55a747c` не является предком `main`. Манифест implementation-сессии ссылался на `55a747c` ⇒ «битая» ссылка на историю. **Фикс** (`9ad852d`): SHA исправлен в манифесте карты #42 и в индексе сессий (тот же класс, что был починен для карты #52 в PR #64).
3. **Карта #42 не закрывается авто-merge'ом.** По конвенции wayfinder (`docs/agents/issue-tracker.md`) карта — index, а не leaf: PR #60 закрыл 8 листьев через `Closes #NN`, а сама карта осталась OPEN. **Фикс**: закрытие вручную по конвенции трекера — комментарий с trace ⇒ `gh issue close 42`; тело карты обновлено (Decisions so far + Итог + пустой Frontier).
4. **Счётчик коммитов в отчёте не сходится с `main`.** В исходном research-отчёте фигурировали 37 reachable коммитов на момент scan'а; после squash-мержей история сжимается, и в `main` на момент closure — 32 коммита (77 по всем refs на момент финальной проверки). В §9 отчёта это зафиксировано явно, чтобы следующий аудит не считал расхождение утечкой.
5. **Отчёт переформатирован `oxfmt`** (CI-gating): `_italic_` вместо `*italic*`, блоки кода без лишнего отступа. Содержательно не изменено — только форма, требуемая `oxfmt --check`.

## Code review findings

Отдельный `@code-review` не запускался: изменения — Dockerfile (одна строка), скан-контур секретов, конфиг allowlist'а и документация; runtime-код приложения не трогался и ревьюился в implementation-сессии (PR #60). Проверено вместо этого:

- `make check` (typecheck → lint → format:check → test) — зелёный на финальном коммите: **251 тест / 18 файлов**; единственное предупреждение lint'а — pre-existing `web/vite.config.ts:33 no-shadow 'path'` (не чинится, вне scope).
- `gitleaks protect --staged` на каждом коммите (pre-commit-хук) и `gitleaks detect --log-opts="--all"` по всей истории — clean.
- Живой прогон образа: PID 1, uid, порты и smoke-эндпоинты — см. таблицу выше.

## Trace

- **PR #65** — base `main`, head `chore/cart-42-closure`, **смержен squash'ем: `ffd9617`** (`chore(cart-42): closure карты #42 — аудит поставки, отчёт #44 в main, исправление дыр (#42)`). В теле PR — `Refs #42`, **не** `Closes #42`: по конвенции wayfinder карта не закрывается auto-merge'ом (см. следующий пункт).
- SHA в таблице «Что сделано» — **pre-squash**, коммиты ветки `chore/cart-42-closure` (ветка удалена на merge ⇒ SHA достижимы только через ref PR — `refs/pull/65/head`, GitHub их показывает). Squash-коммит на `main` — `ffd9617`.
- **#44** — закрыт раньше в этой же сессии: комментарий-резолюция ([`issuecomment-6629640400`](https://github.com/OrdinaryMagic/ai-for-developers-project-386/issues/44#issuecomment-6629640400)) ⇒ `gh issue close 44`. Комментарий несёт trace «отчёт перенесён в `main` + рекомендации приняты в #47–#50/#59».
- **#42** — закрыт вручную: комментарий-резолюция ⇒ `gh issue close 42`; тело обновлено (Decisions so-far дополнен, граф тикетов переведён в «delivered», Frontier — пусто, добавлен блок «Итог» со ссылкой на этот манифест).
- Листья #43, #45, #46, #47, #48, #49, #50, #59 — CLOSED (авто-merge PR #60). **#44** — CLOSED (эта сессия). **#42** — CLOSED (эта сессия).
- **release-please**: squash-коммиты — `chore(cart-42)` (PR #65) и `docs(sessions)` (PR #66) ⇒ релиз не триггерится (те же классы, что в картах #42 и #52: только `feat:` тянет minor).
- **CI**: `CI` (typecheck → lint → format → test → регенерация OpenAPI/SDK), `docker`-job (build + smoke) и `hexlet-check` — success на PR #65 и на `main`.

## Open follow-ups

- **CI-скан gitleaks покрывает только последний коммит.** `gitleaks/gitleaks-action@v2` по умолчанию сканирует диапазон `HEAD~1..HEAD` ⇒ коммит, обойдённый локальным хуком, ловится в том же PR, но **полная история** пересканируется только ручным прогоном. Стоит добавить отдельный full-history шаг (`gitleaks detect --log-opts="--all"`) — history маленькая (77 коммитов, ~50 мс).
- **Path-allowlist в `.gitleaks.toml` — all-or-nothing per file.** Найденный секрет, вставленный в `README.md`/`AGENTS.md`/`CHANGELOG.md`/`docs/agents/{sessions,security,adr}/*.md`, не будет найден. Осознанный компромисс (иначе CI падает на AWS-docs ключе в документации); задокументирован в самом `.gitleaks.toml`.
- **`HEALTHCHECK` в Dockerfile** отсутствует — health-poll делает CI-job (цикл до 30 с). Для оркестраторов (Fly, k8s) нужен probe в самом образе.
- **Non-root** закрыт в этой сессии; read-only root filesystem (`--read-only`) — кандидат в hardening-карту.
- **Multi-platform / image signing / secrets vault** — явно out of scope карты #42, остаются на будущие карты.
- **Версия gitleaks продублирована в 4 местах** (`.gitleaks.toml` comment, `mise.toml`, `hk.pkl` comment, action cache) — синхронизация при бампе ручная; отдельный ADR не писался.
- **Code Scanning / SARIF upload** — `upload: false` в gitleaks-action (research-рекомендация §5.8); включение — отдельная карта «Observability / SARIF». Плюс: v2 action помечен как deprecated по Node 20 (runner форсит Node 24) и требует `GITLEAKS_LICENSE` при переезде репозитория в организацию.
- **Имя Fly-приложения / smoke в CI** — из карты #52, здесь не дублируется.
