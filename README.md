# Сценарий: от создания типа встречи до записи в списке владельца (референс Cal.com)

Краткий путь пользователя в Cal.com. Регистрация, подключение внешних календарей и уведомления в сценарий не входят.

## 1. Владелец создаёт тип встречи

1. В дашборде открыть страницу **Booking links** (Event Types, `/event-types`).
2. Нажать **New booking link** — откроется диалог создания.
3. Заполнить минимум: **Title** (название встречи), **URL** (слаг, итоговая ссылка `localhost/<username>/<slug>`), **Description**, **Length** (длительность, например 30 минут).
4. Нажать **Continue / Create** — тип встречи создан, слот-расписание строится из расписания доступности владельца по умолчанию.
5. Скопировать ссылку `localhost/<username>/<slug>` и передать её гостю.

## 2. Гость записывается на свободное время

1. Открыть ссылку `localhost/<username>/<slug>` — публичная страница брони: слева описание встречи, длительность, часовой пояс; справа календарь месяца.
2. В календаре дни со свободными слотами подсвечены — выбрать дату.
3. Справа появится список свободных слотов (в часовом поясе гостя) — выбрать время.
4. Заполнить форму: имя, email, при необходимости дополнительные гости и заметки.
5. Нажать **Schedule** — откроется страница успеха с подтверждением и опциями (добавить в календарь, reschedule, cancel).

## 3. Запись появляется у владельца

1. Владелец открывает **Bookings** (`/bookings/upcoming`).
2. Новое бронирование сразу отображается во вкладке **Upcoming**: название встречи, гость, дата и время.
3. Клик по записи открывает детали: время, хост, гость с его часовым поясом, заметки, история.

Если у типа встречи включена опция «requires confirmation», запись сначала попадает во вкладку **Unconfirmed** и появляется в Upcoming после подтверждения владельцем (Confirm).

---

## Каркас приложения

Стек: **TypeScript + Fastify** (API), Vite + shadcn/ui (фронтенд, будет добавлен), **oxlint/oxfmt**, **vitest**, **mise**, **hk**, Makefile, Conventional Commits.

### Запуск

```bash
make install   # инструменты mise + npm-зависимости
make dev       # dev-сервер API (tsx watch) на http://127.0.0.1:3000
make start     # сборка tsc + прод-запуск node dist/server.js
make check     # typecheck + lint + format:check + тесты
```

Эндпоинты каркаса: `GET /` → `{"hello":"world"}`, `GET /health` → `{"status":"ok"}`.

### mise

- Инструменты и окружение — `mise.toml`: Node 22, `PORT=3000`, `HOST=127.0.0.1`.
- Таски: `mise run dev|start|build|test|lint|format|typecheck|check`.
  - **`mise run check`** — единая команда для всех проверок (typecheck → lint → format:check → test), выполняет их последовательно с fail-fast. Используется локально (`make check`) и в CI.
- Хуки (события окружения): `postinstall` → `npm install` после установки инструментов mise; `watch_files` на `package.json` → `npm install` при изменении в активированном шелле.
- Демоны (фоновые процессы разработки): фоновый dev-сервер API — `make daemon` / `make daemon-stop` (`mise daemons start api`, `ready_port = 3000`; требуется pitchfork: `mise use -g pitchfork`).

### hk (git-хуки и проверки)

Конфигурация — `hk.pkl` (шаги: oxfmt, oxlint, tsc, mise fmt).

- **pre-commit**: фиксация и стейдж отформатированных staged-файлов (stash незастейженных правок включён).
- **commit-msg**: проверка Conventional Commits (`hk util check-conventional-commit`); действует только когда в коммите есть файлы из `sdocs/`.
- Команды: `hk check` (проверка изменённых), `hk fix` (исправление), `hk check --all` (весь проект, для CI), `hk run <hook>`.
- `make hooks` — установка хуков (выполняется и хуком mise `postinstall` автоматически). Обход хука разово: `HK=0 git commit ...`.
- Монорепо: git-корень выше каталога проекта, поэтому в `/home/om/nanogitlab/hk.pkl` sdocs подключён как `subprojects` — хуки срабатывают от корня репозитория, шаги скоупятся на `sdocs/` и не затрагивают коммиты соседних проектов.

### Коммиты

Conventional Commits — формат `type(scope): subject` (feat, fix, chore, docs, test, ...). Проверка: хук `commit-msg` через hk; вручную — `npx commitlint --edit` (конфиг `commitlint.config.js`).

### CI

Workflow `.github/workflows/ci.yml` запускается на каждый push (любая ветка и тег). Использует `jdx/mise-action@v5` для установки инструментов из `mise.toml` (Node 22, hk и т.д.) с кэшем, выполняет postinstall-хук mise (`npm install` + `hk install`) и запускает `mise run check`. Стандартный Hexlet-чекер лежит отдельно в `hexlet-check.yml` и его трогать не нужно.

### Релизы

Версия пакета `booking-api` в `package.json` и `CHANGELOG.md` в корне репозитория —
это сгенерированные артефакты, поддерживаемые автоматически.

**Bump-семантика** (Conventional Commits, проверяется хуком `commit-msg`):

- `feat:` → `minor` (`0.1.0` → `0.2.0`);
- `fix:` → `patch` (`0.1.0` → `0.1.1`);
- `BREAKING CHANGE:` в footer или `!` после type/scope → `major`
  (`0.1.0` → `1.0.0`, дальше следующая мажорная).

**Поток релиза** — workflow `.github/workflows/release-please.yml`, конфиг
`release-please-config.json` в корне, manifest
`.github/release-please-manifest.json`:

1. Push в `main` запускает release-please.
2. release-please открывает (или обновляет) PR `chore(main): release X.Y.Z`
   — обновлены `package.json#version` и верх `CHANGELOG.md`
   (раздел со ссылками на PR).
3. Мейнтейнер проверяет diff и мёрджит PR — это и есть релиз:
   release-please ставит git-тег `vX.Y.Z` и создаёт GitHub Release.

Если с прошлого релиза в `main` не появилось ни одного Conventional Commit уровня
`feat` / `fix`, release-PR не открывается.

> ⚠️ **Запрещено править руками** `package.json#version` и `CHANGELOG.md`. Оба
> файла генерируются release-please и перезаписываются следующим релизом. По той
> же логике, что и AGENTS.md rule #9 про generated артефакты.

Подробности решения и альтернативы —
[ADR-0003](docs/adr/0003-release-please-for-automated-releases.md).

## Ограничения

v1 сознательно узок по объёму и по модели хранения; этот раздел — фиксация рамок, требуемая [ADR-0001](docs/adr/0001-in-memory-store-with-restart-reset.md). Расширение любого пункта — через отдельный тикет и ADR.

- **Хранилище в памяти процесса.** Типы встреч и записи живут в памяти процесса ([Storage](GLOSSARY.md)). Любой рестарт — `npm start`, `fly deploy`, `docker restart`, OOM-kill — стирает всё. Дисклеймер по ТЗ и фиксация решения — [ADR-0001](docs/adr/0001-in-memory-store-with-restart-reset.md); переход на персистентное хранилище отложен в отдельную итерацию.
- **Один процесс — одна копия состояния.** Multi-instance деплой (`fly scale`, k8s `replicas > 1`) рассинхронизирует типы встреч и записи между репликами. v1 этого не решает: пишите либо за одним процессом, либо готовьте реальное shared-хранилище (см. ADR-0001).
- **Конкурентность через in-process `AsyncLock`.** Снимко-чтения (`/availability`, `/bookings`) и мутации (`POST /bookings`) сериализуются одним мьютексом на `BookingStore`. Это пропускная способность, ограниченная одним ядром; для горизонтального масштабирования требуется DB-уровень изоляции (ADR-0001).
- **Один владелец на развёртывание.** Конфигурация владельца читается из env: `OWNER_NAME`, `OWNER_EMAIL`, `OWNER_TIMEZONE`, `WORKING_HOURS_*`, `SLOT_STEP_MINUTES`, `WINDOW_DAYS`. Менять владельца = пересборка и перезапуск. UI владельца отсутствует (см. [GLOSSARY.md](GLOSSARY.md), раздел «Out of scope для v1»).

### Не предоставляется в v1

Полный список — [GLOSSARY.md](GLOSSARY.md) (раздел «Out of scope для v1»); коротко:

- UI владельца и гостя (Vite + shadcn/ui) — отдельная карта (#26).
- Аутентификация владельца.
- Уведомления (email/SMS/push).
- Отмена гостем и повторная запись.
- Оплата.
- Редактирование и удаление типов встреч.
- Просмотр прошедших бронирований.
- Множественные владельцы на одно развёртывание.
- Интеграции с внешними календарями.
- i18n и переключение TZ на стороне гостя.
