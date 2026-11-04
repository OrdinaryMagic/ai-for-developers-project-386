/**
 * Дрейф-шит «публичный URL приложения ↔ запись в репозитории» (тикет #62).
 *
 * Смысл: после `fly deploy` у приложения появляется публичный адрес
 * `https://<app>.fly.dev`, где `<app>` — top-level ключ `app` в `fly.toml`.
 * Fly выдаёт этот адрес автоматически, даже без custom domain. Если адрес
 * не зафиксировать в репозитории, он остаётся tribal knowledge; если
 * зафиксировать вручную — расходится с фактическим деплоем (имя на fly.io
 * может быть занято, приложение переименуют).
 *
 * Источник истины — `fly.toml`: имя Fly-приложения. README-раздел
 * «Production deploy» — единственное место, где адрес записан для людей.
 * Тест проверяет, что обе записи совпадают и что в разделе нет секретов.
 *
 * TOML-парсера в зависимостях нет (новые deps не добавляем), поэтому разбор
 * минимальный, построчный: top-level key/value до первой секции (общий
 * помощник — `test/helpers/toml.ts`). Этого хватает, потому что формат
 * `fly.toml` в этом репозитории зафиксирован контрактным тестом
 * `test/fly-toml.test.ts`.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readmeSection } from "./helpers/readme.js";
import { secretValueHits } from "./helpers/secrets.js";
import { readTopLevelStringKey } from "./helpers/toml.js";

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

const FLY_TOML_PATH = join(REPO_ROOT, "fly.toml");
const README_PATH = join(REPO_ROOT, "README.md");

/** Заголовок раздела README — место-источник правды о публичном URL. */
const README_SECTION = "Production deploy";

/**
 * Top-level ключ `app` из `fly.toml` — имя Fly-приложения.
 * `undefined`, если такого ключа нет.
 */
function readFlyApp(): string | undefined {
  return readTopLevelStringKey(readFileSync(FLY_TOML_PATH, "utf8"), "app");
}

const flyApp = readFlyApp();
const readme = readFileSync(README_PATH, "utf8");
const section = readmeSection(readme, README_SECTION);

/** Канонический публичный URL приложения — производная от имени в `fly.toml`. */
const canonicalUrl = flyApp === undefined ? "" : `https://${flyApp}.fly.dev`;

/** Все host'ы вида `<label>.fly.dev`, упомянутые в README. */
function flyDevHosts(text: string): string[] {
  return [...text.matchAll(/https:\/\/([a-z0-9-]+)\.fly\.dev/g)].map((match) => match[1]);
}

describe("drift seam: fly.toml ↔ имя Fly-приложения", () => {
  it("в `fly.toml` есть top-level ключ `app`", () => {
    expect(flyApp, "в `fly.toml` нет top-level ключа `app`").toBeTypeOf("string");
  });

  it("`app` непустое", () => {
    expect((flyApp ?? "").trim()).not.toBe("");
  });

  it("`app` — DNS-валидный label (латиница в нижнем регистре, цифры, дефис)", () => {
    const app = flyApp ?? "";
    // RFC 1123 label: строчные буквы/цифры/дефис, без подчёркиваний, 1–63 символа.
    expect(app).toMatch(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/);
    expect(app.length).toBeGreaterThan(0);
    expect(app.length).toBeLessThanOrEqual(63);
    expect(app).not.toContain("_");
  });

  it("канонический URL собирается из `app` в формате Fly", () => {
    expect(canonicalUrl).toMatch(/^https:\/\/[a-z0-9-]+\.fly\.dev$/);
  });
});

describe("drift seam: README «Production deploy» ↔ fly.toml", () => {
  it("README содержит раздел «Production deploy»", () => {
    expect(readme).toMatch(/^##\s+Production deploy\s*$/m);
    expect(section).not.toBe("");
  });

  it("в разделе дословно записан канонический URL из `fly.toml`", () => {
    expect(section).toContain(canonicalUrl);
  });

  it("в README нет чужих URL этого хоста (только имя из `fly.toml`)", () => {
    const hosts = [...new Set(flyDevHosts(readme))];
    expect(hosts).toEqual([flyApp]);
  });

  it("раздел объясняет, что URL выводится из ключа `app` в `fly.toml`", () => {
    expect(section).toContain("fly.toml");
    expect(section).toContain("`app`");
  });

  it("раздел описывает последовательность деплоя", () => {
    expect(section).toContain("fly apps create");
    expect(section).toContain("fly deploy");
  });

  it("раздел ссылается на runbook'и деплоя", () => {
    expect(section).toContain("docs/agents/production-secrets.md");
    expect(section).toContain("docs/agents/production-dns-tls.md");
    expect(section).toContain("scripts/production-smoke.sh");
  });

  it("раздел объясняет, что делать, если имя приложения на fly.io занято", () => {
    expect(section).toMatch(/уникальн/i);
  });
});

describe("в разделе README нет секретов", () => {
  it("в разделе «Production deploy» нет токенов, ключей и паролей", () => {
    expect(secretValueHits(section)).toEqual([]);
  });
});
