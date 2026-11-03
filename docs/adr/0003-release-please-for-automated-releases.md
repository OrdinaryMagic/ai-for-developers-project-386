# 0003 — release-please для автоматических релизов

В репозитории один пакет `booking-api` и один владелец — релизный процесс должен быть
детерминированным и не требовать ручных шагов. Conventional Commits уже валидируются
на pre-push, значит семантика бампа уже есть и остаётся направить её в версионирование и
changelog. Выбираем `googleapis/release-please-action` (инфраструктура R1, #20) и
закрепляем правило: `package.json#version` и `CHANGELOG.md` — продукция бота, а не рук.

## Status

accepted

## Контекст

- В репозитории один пакет (`name: "booking-api"`, `package.json`), один владелец релиза.
- Conventional Commits уже валидируются: `@commitlint/config-conventional` через
  `commitlint.config.js` и хук `commit-msg` из `hk.pkl` (см. AGENTS.md правило 2).
  Семантика бампа (`feat` → minor, `fix` → patch, `BREAKING CHANGE` → major) уже определена
  на уровне коммитов.
- CI прогоняет `make check` (typecheck → lint → format:check → test, fail-fast) на каждый
  push в `.github/workflows/ci.yml` — это даёт зелёный сигнал перед формированием релиза.
- Текущая версия — `0.1.0` (`package.json#version`); файл `CHANGELOG.md` отсутствует,
  git-теги не нарезаны. Любой тег сегодня — ручное действие.

## Решение

Принять `googleapis/release-please-action` как единственный путь к версии, `CHANGELOG.md`
и GitHub Release. Инфраструктура R1 (тикет #20) уже развёрнута в `feat/booking-api-v1`:
workflow `.github/workflows/release-please.yml` запускается по push в `main` и (для
повторной обработки) по завершении собственного `workflow_run`. Конфигурация размещена
в `release-please-config.json` (один пакет `.` с `package-name: "booking-api"`,
`release-type: "node"`, `bump-minor-pre-major: true`, `bump-patch-for-minor-pre-major: true`),
стартовая версия — в `.github/release-please-manifest.json` (`".": "0.1.0"`).

## Альтернативы

- **`semantic-release`**: конфигурация и плагины живут в `package.json` или `.releaserc`,
  выполняются как Node.js на каждом коммите в CI. Семантически совместим с Conventional
  Commits, но дублирует ответственность с уже существующим `commitlint`-ом (правила
  тип→бамп уже описаны в `commitlint.config.js`), а явный `release-please-config.json`
  (R1) — отдельная, единая точка описания релизной политики. Отвергнут: single-source
  of truth уже зафиксирован на стороне GitHub.
- **Ручные теги + ручная правка `CHANGELOG.md`**: работает, не требует инфраструктуры.
  Не масштабируется, легко рассинхронизируется (тег без changelog, changelog без тега,
  edited-после-тега). Отвергнут как норма работы: ручные правки `package.json#version`
  и `CHANGELOG.md` запрещены — единственный путь к ним — merge release-PR от
  `release-please[bot]`. Это симметрично AGENTS.md правилу 9 для сгенерированных
  артефактов (`openapi.yaml`, SDK).

## Следствия

- `package.json#version` и `CHANGELOG.md` НЕ правятся руками. Они — продукция
  release-please, появляются при merge release-PR. Правило фиксируется явно в AGENTS.md
  (по аналогии с правилом 9 для `openapi.yaml` и SDK — сгенерированные артефакты не
  редактируются вручную).
- Conventional Commits остаются единственным источником семантики бампа. Хук `commit-msg`
  в `hk.pkl` блокирует нарушения формата ещё до того, как они дойдут до релизного PR;
  повторная валидация в release-please не нужна.
- Процесс выпуска полностью PR-driven: push в `main` → release-please открывает
  или обновляет release-PR; merge release-PR → создаётся git-тег и GitHub Release. Теги
  как отдельное действие отсутствуют.
- Workflow требует `permissions: contents: write, pull-requests: write` — нужно для
  создания тегов, GitHub Release и комментариев/лейблов на release-PR. Уже выставлено
  в `.github/workflows/release-please.yml` (R1, #20); отдельный секрет не нужен, хватает
  стандартного `GITHUB_TOKEN`.
- До выхода из pre-major (`bump-minor-pre-major: true`): `feat:` бампает minor, остальные
  типы — patch (`bump-patch-for-minor-pre-major: true`). Переход на `1.0.0` — отдельное
  решение и фиксируется поднятием версии в `.github/release-please-manifest.json`.
