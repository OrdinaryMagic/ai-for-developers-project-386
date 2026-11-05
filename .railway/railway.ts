/**
 * Railway Infrastructure as Code — production-размещение booking-api v1.
 *
 * Формат — официальный IaC Railway (docs.railway.com/infrastructure-as-code),
 * а не deprecated Config as Code (`railway.toml` / `railway.json` перестают
 * читаться 2026-12-01, а новые сервисы их не поддерживают вовсе).
 *
 * Платформа выбрана в ADR-0005 (docs/adr/0005-hosting-platform-railway.md),
 * этот файл — реализация тикета #54 в новой платформе. Файл коммитится в
 * репозиторий и правится руками (это НЕ generated-артефакт: AGENTS.md rule #9
 * касается openapi.yaml, SDK, CHANGELOG.md и package.json#version).
 *
 * Что описано ниже (acceptance criteria #54, перенесённые на Railway):
 *   - build из корневого Dockerfile (multi-stage image из cart #42);
 *   - health-check `GET /health` (эндпоинт есть в src/routes/health.ts);
 *   - single primary region `us-east4-eqdc4a` (US East, Virginia) — multi-region
 *     вне scope;
 *   - ровно 1 реплика: state живёт в памяти процесса, второй инстанс ломает
 *     single-writer-контракт (ADR-0001, ADR-0002);
 *   - scale-to-zero выключен (`sleepApplication: false`) — по AC #54;
 *   - лимиты 0.5 vCPU / 500 MB RAM (≤ 1GB по AC #54);
 *   - `env` — только несекретные значения, секреты — через `set-variables`
 *     на стороне платформы (#55).
 *
 * Публичный адрес Railway выдаёт сам (`*.up.railway.app`, TLS управляется
 * Railway). Сгенерированные домены в этот файл **не** попадают по правилам
 * Railway — фактический адрес окружения зафиксирован в
 * `.railway/production.json` (манифест окружения) и в README.
 *
 * Применение (владелец релиза, карта #52):
 *   1) npm install                       # в репозитории нужен пакет `railway`
 *   2) railway login && railway link     # привязка каталога к проекту
 *   3) railway config plan               # dry-run: что изменится в окружении
 *   4) railway config apply              # применить конфиг к окружению
 *
 * Те же операции доступны агенту через Railway MCP (см.
 * docs/agents/production-mcp.md): create-deployment / update-service /
 * set-variables / generate-domain.
 */
import { defineRailway, github, project, service } from "railway/iac";

export default defineRailway(() => {
  const api = service("booking-api", {
    // Источник — этот же репозиторий; деплой по коммиту в `main`.
    source: github("OrdinaryMagic/ai-for-developers-project-386", { branch: "main" }),
    build: {
      // Авто-детект Dockerfile в корне репозитория (регистр `D` важен), но
      // путь фиксируем явно — конфиг должен читаться однозначно.
      builder: "DOCKERFILE",
      dockerfilePath: "Dockerfile",
    },
    deploy: {
      // Health-check: Railway не пускает трафик на сервис, пока ответ не 2xx.
      healthcheckPath: "/health",
      healthcheckTimeout: 30,
      // AC #54: scale-to-zero вне scope — сервис всегда онлайн.
      sleepApplication: false,
      // Перезапуск упавшего деплоя (аналог auto-restart Machines у Fly).
      restartPolicyType: "ON_FAILURE",
      restartPolicyMaxRetries: 10,
      limitOverride: {
        containers: {
          cpu: 0.5,
          memoryBytes: 500_000_000,
        },
      },
    },
    // Single primary region + ровно одна реплика: horizontal autoscale
    // структурно исключён (in-memory store, ADR-0001/ADR-0002).
    replicas: { "us-east4-eqdc4a": 1 },
    env: {
      // Несекретное. `PORT` не указываем: Railway подставляет его сам
      // (приложение слушает `process.env.PORT`).
      HOST: "0.0.0.0",
      NODE_ENV: "production",
      // Конфигурация владельца (src/config/owner.ts). Значения публичные —
      // `GET /config` отдаёт их всем, — поэтому секретами они не являются
      // и живут в репозитории (см. docs/agents/production-secrets.md).
      OWNER_NAME: "Demo Owner",
      OWNER_TIMEZONE: "Europe/Moscow",
      OWNER_WINDOW_DAYS: "14",
      OWNER_SLOT_STEP_MINUTES: "30",
      OWNER_WORKING_DAYS: "1,2,3,4,5",
      OWNER_WORKING_HOURS_START: "09:00",
      OWNER_WORKING_HOURS_END: "18:00",
    },
  });

  return project("booking-api", {
    resources: [api],
  });
});
