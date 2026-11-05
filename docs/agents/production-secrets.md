# Production secrets — booking-api v1 (Railway.io)

Runbook для владельца релиза: где задаются переменные окружения production-контура,
что из них секрет, а что нет, и что делать при ротации или утечке.

- **Платформа:** Railway.io — решение принято в
  [ADR-0005](../adr/0005-hosting-platform-railway.md) (ADR-0004 про Fly.io
  помечен как superseded).
- **Конфиг приложения:** [`.railway/railway.ts`](../../.railway/railway.ts) —
  блок `env` (несекретные значения, тикет #54).
- **Манифест окружения:** [`.railway/production.json`](../../.railway/production.json) —
  IDs окружения и канонический публичный URL.
- **Секреты** — только на платформе: `railway variable set` / sealed variables.
  Значение секрета нельзя прочитать обратно, и в репозиторий оно не возвращается.

Соседние тикеты карты #52: #54 — deploy-конфиг, #56 — домен и TLS, #57 — post-deploy smoke.

## Модель: секретов в v1 нет

Ключевое решение (находка F1 аудита карты #52): **`OWNER_*` — не секреты.**
`GET /config` отдаёт их анонимно любому посетителю, поэтому «секретность» им
ничего не даёт. Значит, они живут в репозитории — в блоке `env` файла
`.railway/railway.ts` и в `.env.example` — и меняются как обычный конфиг.

Настоящих секретов (credential'ов) в v1 нет: приложение не ходит во внешние
сервисы и не хранит пароли. Механизм для будущих секретов на платформе есть —
**sealed variables**: значение шифруется на стороне Railway, его нельзя
прочитать обратно даже через API, а в выводе `railway config plan` значения
редактируются (`«hidden»`).

## Переменные production-контура

Полный контракт — имена переменных и их значения по умолчанию. Ни одно из этих
значений секретом не является.

| Переменная                  | Кто задаёт                           | Значение (дефолт кода / production) | Тип       | Где живёт                                   |
| --------------------------- | ------------------------------------ | ----------------------------------- | --------- | ------------------------------------------- |
| `PORT`                      | Платформа (Railway инжектит сама)    | `3000`                              | не секрет | не задаётся в конфиге: Railway подставляет  |
| `HOST`                      | Платформа                            | `127.0.0.1` / `0.0.0.0`             | не секрет | `env` в `.railway/railway.ts`, `Dockerfile` |
| `NODE_ENV`                  | Платформа                            | `production`                        | не секрет | `env` в `.railway/railway.ts`, `Dockerfile` |
| `OWNER_NAME`                | Владелец релиза (публичное значение) | `Demo Owner`                        | не секрет | `env` в `.railway/railway.ts`               |
| `OWNER_TIMEZONE`            | Владелец релиза (публичное значение) | `Europe/Moscow`                     | не секрет | `env` в `.railway/railway.ts`               |
| `OWNER_WINDOW_DAYS`         | Владелец релиза (публичное значение) | `14`                                | не секрет | `env` в `.railway/railway.ts`               |
| `OWNER_SLOT_STEP_MINUTES`   | Владелец релиза (публичное значение) | `30`                                | не секрет | `env` в `.railway/railway.ts`               |
| `OWNER_WORKING_DAYS`        | Владелец релиза (публичное значение) | `1,2,3,4,5`                         | не секрет | `env` в `.railway/railway.ts`               |
| `OWNER_WORKING_HOURS_START` | Владелец релиза (публичное значение) | `09:00`                             | не секрет | `env` в `.railway/railway.ts`               |
| `OWNER_WORKING_HOURS_END`   | Владелец релиза (публичное значение) | `18:00`                             | не секрет | `env` в `.railway/railway.ts`               |

`PORT` в таблице — единственное исключение из правила «переменная описана в
`.env.example`»: Railway **инжектит порт сам** (приложение слушает
`process.env.PORT`), поэтому в `env` IaC-конфига его нет — задавать его вручную
не нужно.

`OWNER_WORKING_DAYS` — непустой список уникальных ISO-дней недели через запятую
(`1` — понедельник, `7` — воскресенье). Пробелы вокруг элементов допустимы;
пустые элементы, значения вне `1–7` и дубликаты запрещены. День недели
вычисляется в `OWNER_TIMEZONE`. Значение применяется при запуске сервиса и,
как остальные `OWNER_*`, публично видно в `GET /config`.

Дрейф-шит «код ↔ `.env.example` ↔ `env` IaC-конфига» — `test/production-secrets.test.ts`:
он ловит рассинхрон между `src/`, шаблоном env-контракта и production-конфигом.

## Где настраиваются переменные на платформе (Railway.io)

Railway хранит переменные в своём зашифрованном хранилище и подставляет их в
сборку и в работающий сервис. Изменение переменной — это **staged change**:
Railway показывает его как pending и применяет после деплоя (или сразу, если
выставлен `staged: false`).

Источник: [Using Variables](https://docs.railway.com/variables),
[Managing secrets on Railway](https://docs.railway.com/guides/managing-secrets-on-railway).

### `railway variable set` — обычный способ

```bash
# Одна переменная:
railway variable set MY_SECRET='<value>'

# Несколько сразу:
railway variable set MY_SECRET='<value>' OTHER_SECRET='<value>'

# Значение из stdin (чтобы не светилось в истории shell):
echo '<value>' | railway variable set MY_SECRET --stdin

# Список переменных сервиса:
railway variable list

# Удаление:
railway variable delete MY_SECRET
```

- Значение передаётся как пара `NAME=VALUE`; интерактивного ввода CLI не делает.
- `--stdin` читает значение из stdin — так секрет не попадает в history shell.
- `railway variable list` показывает **имена** переменных (и значения, если они не
  sealed) — сам список не является секретом.
- Флаг `--skip-deploys` откладывает деплой: удобно, когда набор переменных
  меняется пачкой.

### `railway config plan` — сухой прогон IaC

```bash
railway config plan              # что изменится в окружении
railway config plan --show-values  # показать значения (для несекретных)
railway config plan --detailed-exit-code  # 0 — расхождений нет, 2 — есть
```

Значения переменных в выводе plan **редактируются** (`«hidden»`) по умолчанию —
секреты не попадают в терминал и в CI-логи.

### Dashboard Railway

В [dashboard Railway](https://railway.com/dashboard) → проект → сервис → вкладка
**Variables**: тот же набор операций, что и через CLI, плюс переключатель
**sealed** для переменных, значение которых не должно читаться обратно.

### Несекретный `env` в `.railway/railway.ts`

Блок `env` в [`.railway/railway.ts`](../../.railway/railway.ts) — для
**несекретных** значений: `HOST`, `NODE_ENV` и публичные `OWNER_*`. Файл лежит в
репозитории и версионируется вместе с кодом — это одна из единых точек
PR-review (тикет #54).

Правила, которые стоит помнить:

- `PORT` в `env` **не задаётся** — Railway инжектит порт сам.
- Значения `OWNER_*` публичны (их отдаёт `GET /config`), поэтому «закрывать» их
  секретом бессмысленно: они и так лежат в репозитории.
- Настоящий секрет в `env` попадать **не должен**: значения из репозитория
  видны всем, кто его клонировал.

### Railway MCP — те же операции из агента

Через Railway MCP доступны `set-variables` (выставить переменные), `list-variables`
(показать имена), `update-service` (конфиг сервиса: health-check, лимиты,
реплики), `generate-domain` / `domain-status` (домен и сертификат),
`redeploy`, `get-logs`, `environment-status`. Подробности — в
[production-mcp.md](production-mcp.md).

## Правило: секреты в репозиторий не возвращаются

- `.env.example` в корне — шаблон env-контракта: имена переменных и значения по
  умолчанию из кода. Реальных секретов там нет и быть не должно.
- Файлов `.env` / `.env.production` с реальными значениями в репозитории нет;
  оба в `.gitignore` (плюс `!.env.example` — шаблон отслеживается).
- `Dockerfile`, `.railway/railway.ts`, CI-конфиги и runbook'и не содержат
  credential-значений. Скан репозитория — `gitleaks` (pre-commit + CI,
  тикеты #44–#49).

## Rotation policy

### Плановая ротация

1. **Подготовить новое значение** вне репозитория (менеджер паролей, секрет в
   CI, ручная копия в защищённом месте).
2. **Выставить переменную на платформе:**
   ```bash
   echo '<new-value>' | railway variable set MY_SECRET --stdin
   ```
   (или через MCP `set-variables`, или в dashboard с флагом **sealed**).
3. **Дождаться деплоя** — Railway пересоберёт и перезапустит реплику; статус —
   `railway status` / MCP `environment-status`.
4. **Проверить новое окружение:**
   ```bash
   railway variable list        # имя переменной на месте
   scripts/production-smoke.sh  # GET /health, GET /config, GET /meeting-types
   ```
5. **Отозвать старое значение** там, где оно ещё живо (CI-секреты, сторонние
   сервисы), и записать факт ротации в журнал владельца релиза.

### Эксренная ротация (утечка)

1. **Сменить значение немедленно** — тем же `railway variable set --stdin`.
2. **Передеплоить** — новое значение действует только после перезапуска реплики.
3. **Проверить**, что старое значение больше не выдаётся (`railway variable list`).
4. **Инвалидировать всё, что выдавалось на старом значении**: если утечка
   затронула credential'ы внешних сервисов — сменить и их, отозвать выданные
   токены/сессии.
5. **Разобрать источник утечки**: `gitleaks` в CI должен был поймать файл в
   репозитории; если утечка не из git — проверить логи доступа и history shell.
6. **Пост-мортем** — короткая запись: что утекло, где, что изменено, что
   закрывает повторение.

### Окно работ

Смена переменной **перезапускает реплику**, а значит стирает in-memory store
([ADR-0001](../adr/0001-in-memory-store-with-restart-reset.md)): типы встреч и
записи пропадают. Смена секрета — операция в окне, где записей мало.

## Диагностика

- **Приложение не стартует после смены переменных** — смотрите логи деплоя:
  `railway logs --build` (сборка) и `railway logs` (рантайм), либо MCP
  `get-logs` с `types: ["build"]` / `["deploy"]`.
- **Переменная не применилась** — Railway применяет изменения переменных через
  staged changes: проверьте, что деплой после изменения прошёл успешно
  (`railway status`, `railway deployment list`).
- **`OWNER_TIMEZONE` роняет процесс** — значение обязано быть валидным
  IANA-идентификатором, иначе `loadOwnerConfig` бросает исключение на старте
  (см. `src/config/owner.ts`).
- **`OWNER_WORKING_DAYS` роняет процесс** — проверьте непустой список через
  запятую, отсутствие дубликатов и что каждый элемент ровно один ISO-день `1–7`.
- **Порт не тот** — `PORT` задаёт платформа; если приложение слушает не на
  нём, проверьте `HOST` (`0.0.0.0`) и `process.env.PORT` в
  [`src/server.ts`](../../src/server.ts).

## Ссылки

- [ADR-0005 — Размещение Booking API v1 на Railway.io](../adr/0005-hosting-platform-railway.md):
  платформа выбрана, формат конфига — Infrastructure as Code, `env` — только
  несекретное.
- [.railway/railway.ts](../../.railway/railway.ts) — deploy-конфиг, блок `env`
  (тикет #54).
- [production-mcp.md](production-mcp.md) — Railway MCP из агента.
- [production-dns-tls.md](production-dns-tls.md) — домен и TLS.
- Документация Railway (сверено **2026-11-04**):
  [Using Variables](https://docs.railway.com/variables),
  [Managing secrets on Railway](https://docs.railway.com/guides/managing-secrets-on-railway),
  [`railway variable`](https://docs.railway.com/cli/variable),
  [Infrastructure as Code](https://docs.railway.com/infrastructure-as-code).
