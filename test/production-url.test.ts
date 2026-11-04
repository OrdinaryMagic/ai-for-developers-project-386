/**
 * Дрейф-шит «публичный URL приложения ↔ запись в репозитории» (тикет #62).
 *
 * Смысл: после деплоя на Railway у сервиса есть публичный адрес
 * `https://<project>-<env>-<suffix>.up.railway.app`. Адрес генерирует сама
 * платформа, и в IaC-конфиг он **не** попадает (так же и при
 * `railway config pull` — импортёр выкидывает сгенерированные домены).
 * Поэтому единственным источником истины в репозитории стал манифест
 * окружения — `.railway/production.json` (поле `publicUrl`).
 *
 * Если адрес не зафиксировать, он остаётся tribal knowledge; если
 * зафиксировать в двух местах вручную — разъедется с фактическим деплоем.
 * README-раздел «Production deploy» — единственное место, где адрес записан
 * для людей. Тест проверяет, что обе записи совпадают и что в разделе нет
 * секретов.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readmeSection } from "./helpers/readme.js";
import { secretValueHits } from "./helpers/secrets.js";

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

const MANIFEST_PATH = join(REPO_ROOT, ".railway/production.json");
const README_PATH = join(REPO_ROOT, "README.md");

/** Заголовок раздела README — место-источник правды о публичном URL. */
const README_SECTION = "Production deploy";

const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as { publicUrl?: string };
const canonicalUrl = manifest.publicUrl ?? "";

const readme = readFileSync(README_PATH, "utf8");
const section = readmeSection(readme, README_SECTION);

/**
 * Все host'ы вида `*.up.railway.app`, упомянутые в тексте. Ищем и с
 * протоколом, и без — чтобы «голый» хост в README тоже попал в выборку.
 */
function railwayHosts(text: string): string[] {
  const matches = [
    ...text.matchAll(/(?:https:\/\/)?([a-z0-9-]+(?:\.[a-z0-9-]+)*\.up\.railway\.app)/g),
  ];
  return matches.map((match) => match[1] as string);
}

/** Хост канонического URL — без протокола и с путём. */
function hostOf(url: string): string {
  return url.replace(/^https?:\/\//, "").split("/")[0] ?? "";
}

describe("drift seam: манифест окружения ↔ канонический URL", () => {
  it("манифест `.railway/production.json` существует", () => {
    expect(existsSync(MANIFEST_PATH)).toBe(true);
  });

  it("в манифесте есть непустой `publicUrl`", () => {
    expect(canonicalUrl.trim()).not.toBe("");
  });

  it("`publicUrl` — HTTPS-адрес платформенного домена Railway", () => {
    expect(canonicalUrl).toMatch(/^https:\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)*\.up\.railway\.app$/);
  });
});

describe("drift seam: README «Production deploy» ↔ манифест окружения", () => {
  it("README содержит раздел «Production deploy»", () => {
    expect(readme).toMatch(/^##\s+Production deploy\s*$/m);
    expect(section).not.toBe("");
  });

  it("в разделе дословно записан канонический URL из манифеста", () => {
    expect(section).toContain(canonicalUrl);
  });

  it("в README нет чужих адресов Railway (только канонический host)", () => {
    const hosts = [...new Set(railwayHosts(readme))];
    expect(hosts).toEqual([hostOf(canonicalUrl)]);
  });

  it("раздел объясняет, что адрес берётся из манифеста окружения", () => {
    expect(section).toContain(".railway/production.json");
    expect(section).toContain("`publicUrl`");
  });

  it("раздел описывает последовательность деплоя на Railway", () => {
    expect(section).toContain("railway login");
    expect(section).toContain("railway link");
    expect(section).toContain("railway config apply");
  });

  it("раздел ссылается на runbook'и деплоя", () => {
    expect(section).toContain("docs/agents/production-secrets.md");
    expect(section).toContain("docs/agents/production-dns-tls.md");
    expect(section).toContain("scripts/production-smoke.sh");
  });

  it("раздел ссылается на ADR-0005 — решение о платформе", () => {
    expect(section).toContain("docs/adr/0005-hosting-platform-railway.md");
  });

  it("раздел отсылает к манифесту, а не к удалённому `fly.toml`", () => {
    expect(section).not.toContain("fly.toml");
  });
});

describe("в разделе README нет секретов", () => {
  it("в разделе «Production deploy» нет токенов, ключей и паролей", () => {
    expect(secretValueHits(section)).toEqual([]);
  });
});
