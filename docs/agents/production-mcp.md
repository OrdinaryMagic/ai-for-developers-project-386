# Production MCP — booking-api v1 (Railway.io)

Runbook: как агент (OpenCode) подключается к Railway через MCP, какие операции
доступны и где хранятся токены.

- **Платформа:** Railway.io — решение принято в
  [ADR-0005](../adr/0005-hosting-platform-railway.md) (ADR-0004 про Fly.io
  помечен как superseded).
- **Проектная конфигурация:** [`.opencode/opencode.json`](../../.opencode/opencode.json) —
  канонический V2-путь `mcp.servers` (тикет #63).

Соседние тикеты карты #52: #54 — deploy-конфиг, #55 — секреты, #57 — post-deploy smoke.

## Подключение

```bash
# Подключить railway-mcp глобально (чтобы работало и в других проектах):
opencode mcp add --global railway-mcp --url https://mcp.railway.com

# Залогиниться через OAuth (откроется браузер, выбрать организацию):
opencode mcp auth railway-mcp

# Проверить статус подключения:
opencode mcp list
```

- Порядок аргументов не важен: `opencode mcp add railway-mcp --global --url …` —
  то же самое.
- `--global` пишет конфиг пользователя (`~/.config/opencode/opencode.jsonc`),
  а не репозиторий. Без `--global` подключение живёт в локальном
  `.opencode/opencode.json` проекта.
- В репозитории объявлено **только** имя сервера и публичный URL — OAuth-токенов
  в `.opencode/opencode.json` нет и быть не должно (drift-тест
  [`test/project-mcp-config.test.ts`](../../test/project-mcp-config.test.ts)).

## Проектная конфигурация

[`.opencode/opencode.json`](../../.opencode/opencode.json):

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "servers": {
      "railway-mcp": {
        "type": "remote",
        "url": "https://mcp.railway.com"
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

- `mcp.servers` — канонический V2-путь. V1-путь (`mcp.<name>`) deprecated:
  сервер, объявленный прямо в `mcp`, считался бы устаревшей формой.
- `railway-mcp` — remote-сервер (Streamable HTTP), OAuth включён на стороне
  Railway; `headers`/`oauth` в конфиге не задаются — авторизация идёт через
  `opencode mcp auth`.
- `shadcn` — local-сервер, команда запуска не менялась.

## Что даёт `railway-mcp`

Официальный MCP-сервер Railway — 71 инструмент. Для карты #52 полезны:

| Инструмент               | Что делает                                                          |
| ------------------------ | ------------------------------------------------------------------- |
| `list-workspaces`        | рабочие пространства пользователя                                   |
| `list-projects`          | проекты, доступные авторизованному пользователю                     |
| `create-project`         | создать проект (и окружение по умолчанию)                           |
| `create-deployment`      | создать сервис из GitHub-репозитория и запустить первый деплой      |
| `connect-service-source` | подключить источник (GitHub-репо или образ) к существующему сервису |
| `update-service`         | конфиг сервиса: health-check, лимиты, реплики, restart policy       |
| `get-service-config`     | текущая конфигурация сервиса (со staged-изменениями)                |
| `describe-service`       | всё о сервисе: конфиг, домены, последний деплой, трейсинг           |
| `set-variables`          | выставить переменные окружения                                      |
| `list-variables`         | список имён переменных                                              |
| `generate-domain`        | выпустить платформенный домен `*.up.railway.app`                    |
| `domain-status`          | статус домена: сертификат, DNS-детали                               |
| `redeploy`               | передеплоить последний деплой                                       |
| `get-logs`               | логи сборки/деплоя (с фильтром по типам)                            |
| `environment-status`     | состояние сервисов окружения, число реплик, активные деплои         |
| `railway-agent`          | составные операции, когда сценарий многошаговый                     |

Значения **секретов** эти инструменты не показывают: `list-variables`
возвращает имена, а sealed-переменные читать обратно нельзя в принципе.

## Альтернатива: CLI Railway

Те же операции доступны из CLI (`railway login`, `railway link`,
`railway config plan|apply`, `railway variable list|set|delete`,
`railway domain`, `railway logs`, `railway status`). MCP удобен тем, что агент
работает с теми же примитивами, что и человек, — но логика остаётся за
репозиторием: `.railway/railway.ts` (конфиг) и `.railway/production.json`
(манифест окружения).

## Где хранятся токены

OAuth-токены и любые секреты хранятся **вне репозитория** — в конфиге
пользователя (`~/.config/opencode/opencode.jsonc`) и в хранилище Railway.
В репозиторий попадают только публичные URL и команды; токенов в
`.opencode/opencode.json` нет и быть не должно. Скан репозитория — `gitleaks`
(pre-commit + CI).

Отозвать выданный доступ: `opencode mcp logout railway-mcp` — и на стороне
Railway (настройки подключённых приложений).

## Диагностика

- **`needs authentication`** — не пройден OAuth: `opencode mcp auth railway-mcp`
  либо в интерфейсе агента `/mcps` → `railway-mcp` → sign in.
- **Не подключается** — проверьте URL: он должен быть `https://mcp.railway.com`.
- **Инструменты есть, но вызовы падают** — проверьте, что выбран нужный
  workspace (у пользователя их может быть несколько): `list-workspaces`,
  `list-projects`.
- **Переменные применились, но не подействовали** — Railway применяет изменения
  переменных через staged changes: дождитесь деплоя и проверьте
  `environment-status` / `get-logs`.

## Ссылки

- [ADR-0005 — Размещение Booking API v1 на Railway.io](../adr/0005-hosting-platform-railway.md):
  платформа выбрана, `railway-mcp` — её официальный MCP-сервер.
- [production-secrets.md](production-secrets.md) — секреты приложения и Railway.
- [production-dns-tls.md](production-dns-tls.md) — домен и TLS.
- Документация Railway (сверено **2026-11-04**):
  [Railway MCP](https://docs.railway.com/guides/mcp),
  [`railway mcp install`](https://docs.railway.com/cli/mcp).
