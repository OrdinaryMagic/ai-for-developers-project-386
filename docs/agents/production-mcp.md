# Production MCP: runbook

Как агент (OpenCode) в этом репозитории подключается к MCP-серверам, что
лежит в репозитории, а что — вне его, и что делать, если подключение не
работает.

- **Агент:** OpenCode V2. Конфигурация проекта —
  [`.opencode/opencode.json`](../../.opencode/opencode.json).
- **Платформа:** Fly.io — решение принято в
  [ADR-0004](../adr/0004-hosting-platform.md).
- **Главное правило:** OAuth-токены и любые другие секреты хранятся **вне
  репозитория** — в конфигурации пользователя. В репозиторий попадают только
  публичные URL и команды запуска.

Тикет: #63 «Проектная MCP-конфигурация агента в репозитории».
Соседние тикеты карты #52: #54 — `fly.toml`, #55 — secrets, #57 — post-deploy
smoke.

## Коротко

```bash
# Подключить fly-mcp (глобально — чтобы работало и в других проектах):
opencode mcp add --global fly-mcp --url https://mcp.fly.io

# Залогиниться через OAuth: откроется браузер, выбрать организацию:
opencode mcp auth fly-mcp

# Проверить статус подключения:
opencode mcp list
```

## Что лежит в репозитории

Ровно один файл — [`.opencode/opencode.json`](../../.opencode/opencode.json).
Серверы объявлены в каноническом V2-пути `mcp.servers` (устаревшая V1-форма
`mcp.<name>` в OpenCode V2 deprecated и не используется):

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "servers": {
      "fly-mcp": {
        "type": "remote",
        "url": "https://mcp.fly.io"
      },
      "shadcn": {
        "type": "local",
        "command": ["npx", "-y", "shadcn@latest", "mcp"],
        "disabled": false
      }
    }
  }
}
```

- **`fly-mcp`** — remote-сервер Fly.io (Streamable HTTP). OAuth включён по
  умолчанию, поэтому в конфиге нет ни токена, ни заголовков авторизации:
  достаточно только URL.
- **`shadcn`** — local-сервер (stdio), запускается через `npx`. В V1 он был
  объявлен в `mcp.shadcn`; в V2 переехал в `mcp.servers.shadcn`, поведение не
  изменилось (`enabled: true` → `disabled: false`, то есть сервер подключается).

Конфиг валиден по опубликованной схеме
(<https://opencode.ai/config.json>) и проверяется тестом
[`test/project-mcp-config.test.ts`](../../test/project-mcp-config.test.ts):
форма пути, состав серверов и отсутствие секретов.

## Как подключить

Внутри этого репозитория подключение уже объявлено — достаточно авторизоваться
(см. ниже). Команда `opencode mcp add` нужна, чтобы использовать `fly-mcp` в
других проектах:

```bash
opencode mcp add --global fly-mcp --url https://mcp.fly.io
```

- `--global` — записать сервер в конфиг пользователя
  (`~/.config/opencode/opencode.jsonc`), чтобы он был доступен во всех
  проектах. Без флага сервер добавится в конфиг текущего проекта.
- Порядок аргументов не важен: `opencode mcp add fly-mcp --global --url …` —
  то же самое.
- Команда пишет в конфиг пользователя, а не в репозиторий, и не добавляет
  токенов: remote-серверы авторизуются через OAuth.

Проверить, что сервер виден:

```bash
opencode mcp list
```

## Как залогиниться

Вход — OAuth в браузере, без API-токена:

```bash
opencode mcp auth fly-mcp
```

Либо прямо в интерфейсе агента: `/mcps` → выбрать `fly-mcp` → sign in. В
браузере выбирается организация (для нескольких — одна из них) и подтверждаются
запрашиваемые права. Выданный доступ виден в TUI как `connected` (а до
авторизации — `needs authentication`).

Серверы, которым нужен локальный секрет (например, GitHub MCP через
`docker run -e GITHUB_PERSONAL_ACCESS_TOKEN`), в репозиторий не попадают: их
описывают в **глобальном** конфиге пользователя.

## Что даёт `fly-mcp`

Fly MCP — один MCP-сервер на все продукты Fly.io
(<https://fly.io/mcp/>). Через него агент управляет ресурсами выбранной
организации:

| Область          | Примеры инструментов                                                         |
| ---------------- | ---------------------------------------------------------------------------- |
| Apps             | `list_apps`, `get_app`, `delete_app`                                         |
| Machines         | `list_machines`, `create_machine`, `restart_machine`, `exec_machine_command` |
| Volumes          | `list_volumes`, `create_volume`, `create_volume_snapshot`                    |
| App secrets      | `list_app_secrets`, `get_app_secret`, `set_app_secret`, `delete_app_secret`  |
| IP и TLS         | `list_app_ips`, `list_app_certificates`, `get_app_certificate`               |
| Managed Postgres | `list_postgres_clusters`, `create_postgres_database`                         |
| Sprites          | `list_sprites`, `exec`, `file_read`, `service_logs`                          |

Про секреты — важно: `list_app_secrets` показывает **имена** секретов, их
**digest** и таймстемпы, но **никогда** не значения. Значение секрета не
отдаётся и через `get_app_secret`. Записать или удалить секрет можно
(`set_app_secret` / `delete_app_secret`), но это отдельное осознанное действие
агента, а не чтение.

Ограничения сервера: workflow деплоя и создание приложений не входят в
каталог инструментов; IP-адреса и сертификаты — только на чтение; инструменты
Managed Postgres ничего не удаляют, не меняют пользователей и пароли и не
возвращают пароли.

## Где хранятся OAuth-токены

**Вне репозитория.** OpenCode хранит OAuth-креды в своём хранилище
пользователя, отдельно от конфигурации проекта: в репозитории нет ни
`access_token`, ни `client_secret`, ни заголовков вида
`Authorization: Bearer …`.

Правила:

- в `.opencode/opencode.json` попадают только публичные URL (`https://mcp.fly.io`)
  и команды запуска local-серверов;
- если серверу всё же нужен API-ключ, в конфиг пишут **не значение**, а
  подстановку окружения (`"{env:MCP_API_KEY}"`), и сам ключ задают в окружении
  или в глобальном конфиге пользователя;
- отозвать выданный доступ: `opencode mcp logout fly-mcp` — и на стороне Fly
  (отзыв consent в настройках организации).

## Если подключение не работает

- **`needs authentication`** — не пройден OAuth: `opencode mcp auth fly-mcp`
  либо `/mcps` → `fly-mcp` → sign in.
- **Не подключается** — проверьте URL: он должен быть `https://mcp.fly.io`
  (без `/mcp` на конце). Также проверьте, что аккаунт имеет доступ к нужной
  организации.
- **`permission denied`** — выбранная организация или ресурс не входят в
  выданный grant: переподключитесь и согласуйте нужные права. Повторные
  попытки доступ не расширяют.
- **Конфиг не подхватился** — OpenCode перечитывает конфигурацию сам после
  сохранения; если сомневаетесь — `/reload`.

## Что никогда не попадает в репозиторий

- OAuth-токены, access/refresh-токены, `client_secret` — только в хранилище
  пользователя.
- Значения секретов Fly, `fly.toml` c заполненными секретами, `.env*` с
  значениями — см. runbook по секретам
  ([production-secrets.md](production-secrets.md)).
- API-ключи в заголовках MCP-конфига.

Сканы на утечку настроены: `gitleaks` в pre-commit-хуке и в CI (см.
README → [Security](../../README.md#security)), конфиг — `.gitleaks.toml`.

## Связи

- [`.opencode/opencode.json`](../../.opencode/opencode.json) — проектная
  конфигурация MCP (V2-путь `mcp.servers`).
- [README → MCP](../../README.md#mcp) — короткая версия инструкции.
- [ADR-0004 — Размещение Booking API v1 на managed-платформе (Fly.io)](../adr/0004-hosting-platform.md):
  платформа выбрана, `fly-mcp` — её официальный MCP-сервер.
- [production-secrets.md](production-secrets.md) — секреты приложения и Fly.
- Документация OpenCode V2: [MCP servers](https://opencode.ai/v2/docs/mcp-servers).
- Документация Fly: [Fly MCP](https://fly.io/mcp/),
  [подключение клиентов](https://mcp.fly.io/guide.md).
