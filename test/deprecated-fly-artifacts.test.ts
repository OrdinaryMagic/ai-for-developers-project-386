/**
 * Контракт удаления deprecated-форматов размещения (тикет #54, платформа —
 * ADR-0005).
 *
 * Fly.io заменён на Railway.io, а Config as Code (`railway.toml` /
 * `railway.json`) deprecated самой платформой: сервисы, уже управляемые
 * таким файлом, перестанут его читать 2026-12-01, а новые сервисы не
 * поддерживают его вовсе. Держать такой файл в репозитории — значит оставить
 * конфиг, который молча не применится.
 *
 * Тест проверяет именно **отсутствие** файлов: пока в репозитории лежит
 * `fly.toml`, часть скриптов и документации продолжает считать его
 * источником истины для канонического адреса — и адрес в репозитории
 * расходится с фактическим деплоем.
 */
import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

describe("deprecated-конфиги размещения удалены из репозитория (#54)", () => {
  it("`fly.toml` (Config as Code Fly.io) удалён", () => {
    expect(existsSync(join(REPO_ROOT, "fly.toml"))).toBe(false);
  });

  it("Config as Code Railway (`railway.toml` / `railway.json`) не используется", () => {
    expect(existsSync(join(REPO_ROOT, "railway.toml"))).toBe(false);
    expect(existsSync(join(REPO_ROOT, "railway.json"))).toBe(false);
  });

  it("TOML-хелпер для разбора Fly-конфига удалён вместе с ним", () => {
    expect(existsSync(join(REPO_ROOT, "test/helpers/toml.ts"))).toBe(false);
  });

  it("актуальные IaC-артефакты на месте", () => {
    expect(existsSync(join(REPO_ROOT, ".railway/railway.ts"))).toBe(true);
    expect(existsSync(join(REPO_ROOT, ".railway/production.json"))).toBe(true);
  });
});
