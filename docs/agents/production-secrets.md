# Production secrets: runbook

Как production-конфигурация booking-api v1 попадает в окружение, где
настраивается и что делать, если значение утекло.

- **Платформа:** Fly.io — решение принято в
  [ADR-0004](../adr/0004-hosting-platform.md).
- **Форма production-контракта:** [`.env.example`](../../.env.example) в корне
  репозитория — шаблон (shape): имена переменных + значения по умолчанию
  (дефолты из кода; для `HOST` и `NODE_ENV` — production-значения). Секретов
  в шаблоне нет.
- **Главное правило:** значения секретов не появляются в репозитории. Только
  `fly secrets set` или dashboard Fly, только на стороне платформы.

Тикет: #55 «Production secrets management documentation».
Соседние тикеты карты #52: #54 — `fly.toml`, #56 — домен и TLS, #57 — post-deploy smoke.

## Коротко

```bash
# Несекретное (порт, хост, NODE_ENV) — в fly.toml [env], он в репозитории.
# Секрет (будущее: DATABASE_URL, ключ сессии) — только так:
fly secrets set MY_SECRET='<value>'

# Проверить, что секрет на месте (значение не показывается — только digest):
fly secrets list

# Снять секрет:
fly secrets unset MY_SECRET
```

## Production env-vars

Backend читает переменные окружения в двух местах: `PORT`/`HOST` — напрямую из
`process.env` в [`src/server.ts`](../../src/server.ts), `OWNER_*` — через
`EnvSource` в [`src/config/owner.ts`](../../src/config/owner.ts). `NODE_ENV`
кодом не читается: его выставляет платформа (`Dockerfile` / `fly.toml [env]`).

| Переменная                  | Дефолт в коде        | В production             | Формат              | Секрет?   | Где читается                   |
| --------------------------- | -------------------- | ------------------------ | ------------------- | --------- | ------------------------------ |
| `PORT`                      | `3000`               | `3000`                   | целое 1–65535       | не секрет | `src/server.ts`                |
| `HOST`                      | `127.0.0.1`          | `0.0.0.0`                | IP или hostname     | не секрет | `src/server.ts`                |
| `NODE_ENV`                  | — (задаёт платформа) | `production`             | строка              | не секрет | `Dockerfile`, `fly.toml [env]` |
| `OWNER_NAME`                | `Demo Owner`         | имя владельца            | строка              | не секрет | `src/config/owner.ts`          |
| `OWNER_TIMEZONE`            | `Europe/Moscow`      | TZ владельца             | IANA-идентификатор  | не секрет | `src/config/owner.ts`          |
| `OWNER_WINDOW_DAYS`         | `14`                 | `14` (или сколько нужно) | положительное целое | не секрет | `src/config/owner.ts`          |
| `OWNER_SLOT_STEP_MINUTES`   | `30`                 | `30` (или сколько нужно) | положительное целое | не секрет | `src/config/owner.ts`          |
| `OWNER_WORKING_HOURS_START` | `09:00`              | `09:00` (или своё)       | `HH:MM`             | не секрет | `src/config/owner.ts`          |
| `OWNER_WORKING_HOURS_END`   | `18:00`              | `18:00` (или своё)       | `HH:MM`             | не секрет | `src/config/owner.ts`          |

Валидация значений (всё проверяется на старте, в
[`loadOwnerConfig`](../../src/config/owner.ts)):

- `PORT` — `Number(process.env.PORT ?? 3000)`; нечисловое значение даёт `NaN`
  и роняет `listen`;
- `HOST` — внутри контейнера / Fly Machine обязателен `0.0.0.0`, иначе
  опубликованный порт недостижим снаружи;
- `OWNER_NAME` — обрезается по краям, пустое значение даёт дефолт; значение
  публично отдаётся в `GET /config`;
- `OWNER_TIMEZONE` — невалидный TZ роняет процесс на старте;
- `OWNER_WINDOW_DAYS`, `OWNER_SLOT_STEP_MINUTES` — только положительные целые,
  иначе ошибка на старте;
- `OWNER_WORKING_HOURS_START` / `OWNER_WORKING_HOURS_END` — формат `HH:MM`,
  причём `END` строго больше `START`, иначе ошибка на старте.

**Секретов в v1 нет.** Ни одна из переменных выше не содержит credential:
`OWNER_NAME` и `OWNER_TIMEZONE` вообще отдаются публично в `GET /config`,
`PORT`/`HOST`/`NODE_ENV` — технические. Таблица существует, чтобы место для
будущего секрета (например, `DATABASE_URL`, когда появится БД) было определено
заранее: такой переменной место в таблице — «секрет», а в `.env.example` —
пустой слот (значения секрета в шаблоне не бывает). Значение секрета живёт
только в `fly secrets`.

Ещё одна переменная окружения есть во фронтенде — `VITE_OWNER_TIMEZONE`
(`web/src/features/owner/bookings/OwnerTimezoneContext.tsx`). Это **build-time**
переменная Vite, а не секрет рантайма: она вшивается в статические ассеты на
сборке и в секретах Fly ей не место.

## Где настраиваются на платформе (Fly.io)

Секреты Fly хранит в зашифрованном хранилище (vault) и подставляет их в
каждую Machine как переменные окружения **на старте**. Значение секрета
невозможно прочитать обратно — ни через CLI, ни через API, ни через dashboard.
Источник: [Secrets and Fly Apps](https://docs.fly.io/apps/secrets).

### `fly secrets set` — обычный способ

```bash
fly secrets set MY_SECRET='<value>'
fly secrets set MY_SECRET='<value>' OTHER_SECRET='<value>'
```

- Команда **не интерактивна**: значение передаётся аргументом, требуется минимум
  одна пара `NAME=VALUE`. Своего интерактивного ввода значения flyctl не делает.
- Чтобы значение не осталось в истории shell, передайте его через stdin:

  ```bash
  fly secrets set MY_SECRET=- < /secure/path/secret.txt
  ```

- `fly secrets set` **перезапускает Machines** приложения (и сбрасывает их
  эфемерную файловую систему). У booking-api это значит, что in-memory
  `BookingStore` очищается — см. [ADR-0001](../adr/0001-in-memory-store-with-restart-reset.md).
  Планируйте смену секрета на окно, где записей мало.
- `--stage` кладёт значение в vault, но **не трогает Machines**: секрет
  доедет только до машин, запущенных или обновлённых после этого. Флаг имеет
  смысл для machine-app.
- `--detach` возвращает управление сразу, не дожидаясь завершения деплоя.
- `-a <app>` / `-c <config>` — указать приложение или другой `fly.toml`, если
  текущий каталог не тот.

### `fly secrets import` — batch из файла

Для набора секретов удобнее dotenv-файл:

```bash
fly secrets import < production.env
```

Парсер `fly secrets import` (см. [исходник flyctl](https://github.com/superfly/flyctl/blob/master/internal/command/secrets/parser.go)):

- одна строка — одна пара `NAME=VALUE`; строка без `=` — ошибка;
- пустые строки и строки, начинающиеся с `#`, пропускаются;
- значение в двойных или одинарных кавычках — кавычки снимаются;
- значение в тройных кавычках `"""…"""` — многострочное;
- символ `#` внутри значения считается комментарием, **если** значение не
  заключено в кавычки. Значение с `#` пишите в кавычках: `TOKEN="a#b"`.

Файл с секретами живёт **вне репозитория** (см. «Что никогда не попадает в
репозиторий»).

### `fly secrets list` / `unset` / `deploy` / `sync`

```bash
fly secrets list          # имена, digest и статус деплоя; значения не показываются
fly secrets list --json   # то же самое машиночитаемо
fly secrets unset MY_SECRET
fly secrets deploy        # передеплоить текущий релиз с отложенными (staged) секретами
fly secrets sync          # синхронизировать локальный кэш flyctl с последним состоянием секретов
```

`fly secrets list` показывает колонку `DIGEST` — по ней видно, что значение
сменилось, не раскрывая его.

### Dashboard Fly

В [dashboard Fly](https://fly.io/apps/) → выбрать приложение → вкладка
**Secrets**:

1. добавить секрет (имя и значение) — значения попадают в тот же vault;
2. нажать **Deploy Secrets** — приложение перезапускается с новыми значениями.

Dashboard-путь интерактивен и подходит, если под рукой нет CLI. Он равнозначен
`fly secrets set`: те же vault, те же права, тот же рестарт машин.

### `fly.toml [env]` — только несекретное

```toml
[env]
PORT = "3000"
HOST = "0.0.0.0"
NODE_ENV = "production"
```

Секция `[env]` в `fly.toml` — для **несекретных** значений: по
[документации Fly](https://docs.fly.io/reference/configuration) она «allows
setting non-sensitive information as environment variables». Файл `fly.toml`
лежит в репозитории и проходит ревью — секретов в нём быть не должно.

Правила Fly, которые стоит помнить:

- **Secrets take precedence over env variables with the same name** — если
  секрет и `[env]` содержат одно имя, победит секрет;
- имена переменных регистрозависимы и не могут начинаться с `FLY_`;
- секреты доступны **только в рантайме**, на этапе сборки образа их нет (наш
  `Dockerfile` секретов и не требует);
- если секрет нужен приложению как файл — `[[files]]` в `fly.toml` пишет
  значение (в base64) в файл на машине.

`fly.toml` заводит тикет #54; он в этом же репозитории и тоже не содержит
секретов.

### Что никогда не попадает в репозиторий

- Никаких `.env`, `.env.production`, `.env.local` с **значениями**. Все они
  в `.gitignore`; в репозитории лежит только `.env.example` — шаблон с именами
  переменных и значениями по умолчанию (дефолты из кода; секретов там нет).
- Никаких значений секретов в `fly.toml`, в `Dockerfile`, в CI-конфигах и в
  документации.
- Никаких секретов в сообщениях коммитов, в issue и в PR-описаниях.
- Локальные файлы с секретами — только на машине владельца и в зашифрованном
  хранилище; в git они не попадают.

Сканы на утечку уже настроены: `gitleaks` в pre-commit-хуке и в CI
(см. README → [Security](../../README.md#security)), конфиг — `.gitleaks.toml`.

## Rotation policy

### Плановая ротация

- **Периодичность:** раз в 90 дней — для любого credential, который появится
  в приложении; для `OWNER_*` ротация не нужна (это не секреты, а конфигурация
  владельца) — их меняют только при смене владельца или его расписания.
- **Порядок действий:**

  1. выпустить новое значение у провайдера (сгенерировать токен заново, а не
     переиспользовать старый);
  2. записать его на платформу:

     ```bash
     fly secrets set MY_SECRET='<new-value>'
     ```

     либо, если секретов несколько и они лежат в файле вне репозитория:

     ```bash
     fly secrets import < /secure/path/production.env
     ```

  3. дождаться завершения деплоя (или `fly secrets deploy`, если значения
     были положены через `--stage`);
  4. **проверить**: `fly secrets list` показывает новый `DIGEST` и статус
     `Deployed`, а smoke-эндпоинты отвечают — `GET /health`, `GET /config`,
     `GET /meeting-types` (контракт smoke — карта #52, тикет #57);
  5. отозвать старое значение у провайдера и в его панели;
  6. зафиксировать ротацию (дата, что меняли, кто) — в issue карты #52.

- **Окно работ:** `fly secrets set` перезапускает Machines, а значит очищает
  in-memory `BookingStore` ([ADR-0001](../adr/0001-in-memory-store-with-restart-reset.md)).
  Ротацию назначают на время, когда записи не идут.

### Утечка: экстренная ротация

Если значение просочилось (лог, скриншот, чужая машина, коммит, который
уже ушёл в историю) — порядок жёстче:

1. **Оценить, эксплуатируется ли значение** злоумышленником прямо сейчас.
   Если да — сначала отозвать старое значение у провайдера (это может оборвать
   доступ), затем выпустить новое. Если активного злоупотребления нет — сначала
   выдать новое (меньше простоя), потом отозвать старое.
2. **Сменить значение на платформе** и дождаться редеплоя:

   ```bash
   fly secrets unset STALE_SECRET
   fly secrets set STALE_SECRET='<new-value>'
   ```

   Либо одной командой `fly secrets set STALE_SECRET='<new-value>'` — старое
   значение перезаписывается, отдельный `unset` не нужен, если имя осталось
   тем же.

3. **Инвалидировать** всё, что выдавалось на основе старого значения:
   активные сессии, выпущенные токены, подключённые клиенты. Для `OWNER_*`
   инвалидация не нужна — эти значения не идентифицируют и не авторизуют.
4. **Проверить** новое окружение: `fly secrets list` (digest и статус
   `Deployed`) + smoke `GET /health`, `GET /config`, `GET /meeting-types`.
5. **Проверить репозиторий**: `gitleaks detect` / `hk check --all` по рабочей
   копии и по всей истории (`gitleaks detect --log-opts="--all"`). Если значение
   попало в коммит — да, оно в истории навсегда, и этого достаточно для
   ротации; чистить историю (`filter-repo`) нужно только если течёт не
   ротируемый credential.
6. **Пост-мортем**: записать в issue карты #52, что утекло, когда, как
   обнаружили, что сделали. Если утечка шла через наш код — это баг на
   отдельный тикет.

### Что не покрыто этой политикой

- Автоматическая ротация сертификатов TLS — тикет #56.
- Интеграция с внешним secret manager (Vault и т.п.) — вне объёма карты #52.

## Связи

- [ADR-0004 — Размещение Booking API v1 на managed-платформе (Fly.io)](../adr/0004-hosting-platform.md):
  платформа выбрана, `fly secrets set` зафиксирован как способ выставления
  секретов, `fly.toml [env]` — только несекретное.
- Тикет #54 — `fly.toml` (сервис, health-checks, `[env]`, регион).
- Тикет #56 — домен и TLS.
- Тикет #57 — post-deploy smoke против реального URL.
- [ADR-0001 — In-memory store with restart reset](../adr/0001-in-memory-store-with-restart-reset.md):
  любой рестарт Machines стирает записи — учитывать при ротации.
- [README → Security](../../README.md#security) — `gitleaks` в хуке и в CI.
- Источник поведения Fly: [Secrets and Fly Apps](https://docs.fly.io/apps/secrets),
  [`fly secrets set`](https://docs.fly.io/flyctl/cmd/fly_secrets_set),
  [`fly secrets import`](https://docs.fly.io/flyctl/cmd/fly_secrets_import),
  [`fly secrets list`](https://docs.fly.io/flyctl/cmd/fly_secrets_list),
  [`fly.toml reference`](https://docs.fly.io/reference/configuration).
