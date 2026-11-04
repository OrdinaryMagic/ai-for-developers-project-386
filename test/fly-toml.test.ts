/**
 * Контракт production-размещения, зафиксированный в `fly.toml` (тикет #54).
 *
 * Тест читает `fly.toml` из корня репозитория и проверяет acceptance criteria
 * тикета #54: build из корневого Dockerfile, PORT=3000 через env, health-check
 * `GET /health`, single primary region, min/max инстансов 1/1, RAM ≤ 1GB.
 * Плюс — что ADR-0004 ссылается на этот файл (второй AC тикета).
 *
 * Тикет #56 добавляет сюда два кейса: HTTP→HTTPS redirect (`force_https` в
 * `[http_service]`) и наличие runbook'а DNS/TLS со ссылками на смежные
 * артефакты карты #52.
 *
 * TOML-парсера в зависимостях нет (новые deps не добавляем), поэтому разбор
 * минимальный, построчный: секции + key/value. Этого хватает, потому что
 * формат `fly.toml` в этом репозитории фиксирован этим же тестом.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const repoRoot = new URL("../", import.meta.url);

function readRepoFile(relativePath: string): string {
  return readFileSync(new URL(relativePath, repoRoot), "utf8");
}

interface TomlTable {
  [key: string]: string;
}

interface TomlDoc {
  root: TomlTable;
  tables: Record<string, TomlTable[]>;
}

/** Убирает `#`-комментарий, не задевая `#` внутри строковых значений. */
function stripComment(line: string): string {
  let inString = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') inString = !inString;
    if (ch === "#" && !inString) return line.slice(0, i);
  }
  return line;
}

/** Минимальный TOML-разбор: top-level ключи + секции (`[x]` и `[[x]]`). */
function parseToml(source: string): TomlDoc {
  const root: TomlTable = {};
  const tables: Record<string, TomlTable[]> = {};
  let current: TomlTable | null = null;

  for (const rawLine of source.split("\n")) {
    const line = stripComment(rawLine).trim();
    if (line === "") continue;

    if (line.startsWith("[")) {
      const isArray = line.startsWith("[[");
      const name = line.slice(isArray ? 2 : 1, isArray ? -2 : -1).trim();
      const table: TomlTable = {};
      tables[name] = isArray ? [...(tables[name] ?? []), table] : [table];
      current = table;
      continue;
    }

    const separator = line.indexOf("=");
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (current === null) {
      root[key] = value;
    } else {
      current[key] = value;
    }
  }

  return { root, tables };
}

/** Значение без кавычек (`"3000"` → `3000`). */
function str(value: string | undefined): string {
  if (value === undefined) return "";
  return value.replace(/^"(.*)"$/, "$1");
}

/** Все значения конфига (top-level + секции) — для проверки «single region». */
function allValues(doc: TomlDoc): string[] {
  const values = Object.values(doc.root);
  for (const entries of Object.values(doc.tables)) {
    for (const entry of entries) {
      values.push(...Object.values(entry));
    }
  }
  return values;
}

/** `"256mb"` / `"1gb"` → мегабайты. */
function memoryToMb(raw: string): number {
  const match = /^(\d+)\s*(mb|gb)?$/i.exec(raw.trim());
  if (!match) return Number.NaN;
  const value = Number(match[1]);
  return (match[2] ?? "mb").toLowerCase() === "gb" ? value * 1024 : value;
}

/** Регионы Fly.io — по ним ищем «лишний» регион в конфиге. */
const FLY_REGION_CODES = [
  "ams",
  "bom",
  "cdg",
  "ewr",
  "fra",
  "gru",
  "hkg",
  "iad",
  "jnb",
  "lhr",
  "nrt",
  "nyc",
  "ord",
  "sea",
  "sfo",
  "sin",
  "syd",
  "yyz",
  "yul",
];

describe("fly.toml — production deploy config (#54)", () => {
  it("собирает image из корневого Dockerfile", () => {
    const doc = parseToml(readRepoFile("fly.toml"));

    expect(str(doc.tables["build"]?.[0]?.dockerfile)).toBe("Dockerfile");
    // Dockerfile в корне — тот самый multi-stage image (cart #42).
    expect(readRepoFile("Dockerfile")).toContain('CMD ["node", "dist/server.js"]');
  });

  it("выставляет PORT=3000 через env и не расходится с Dockerfile", () => {
    const doc = parseToml(readRepoFile("fly.toml"));
    const env = doc.tables["env"]?.[0] ?? {};
    const httpService = doc.tables["http_service"]?.[0] ?? {};

    expect(str(env.PORT)).toBe("3000");
    expect(str(env.HOST)).toBe("0.0.0.0");
    expect(str(env.NODE_ENV)).toBe("production");
    // Fly Proxy роутит трафик на internal_port — он обязан совпадать с PORT.
    expect(Number(str(httpService.internal_port))).toBe(3000);
    // Контракт Dockerfile: PORT=3000 внутри image (fallback для docker run).
    expect(readRepoFile("Dockerfile")).toMatch(/^ENV PORT=3000$/m);
  });

  it("в [env] только несекретные значения", () => {
    const doc = parseToml(readRepoFile("fly.toml"));
    const env = doc.tables["env"]?.[0] ?? {};

    // Секреты — через `fly secrets set` (#55), в репо им не место.
    expect(Object.keys(env).toSorted()).toEqual(["HOST", "NODE_ENV", "PORT"]);
  });

  it("health-check: GET /health", () => {
    const doc = parseToml(readRepoFile("fly.toml"));
    const checks = doc.tables["http_service.checks"] ?? [];

    expect(checks).toHaveLength(1);
    expect(str(checks[0].method)).toBe("GET");
    expect(str(checks[0].path)).toBe("/health");
    // Путь должен совпадать с реальным эндпоинтом API.
    expect(readRepoFile("src/routes/health.ts")).toContain('app.get("/health"');
  });

  it("HTTP→HTTPS redirect: force_https = true в [http_service]", () => {
    const doc = parseToml(readRepoFile("fly.toml"));
    const httpService = doc.tables["http_service"]?.[0] ?? {};

    // AC #56: все HTTP-запросы к приложению редиректятся на HTTPS.
    // Ключ `force_https` в секции [http_service] — по docs.fly.io/reference/configuration
    // ("A Boolean which determines whether to enforce HTTP to HTTPS redirects").
    expect(str(httpService.force_https)).toBe("true");
  });

  it("single primary region", () => {
    const doc = parseToml(readRepoFile("fly.toml"));
    const primaryRegion = str(doc.root.primary_region);

    expect(primaryRegion).toBe("iad");
    // Multi-region вне scope (AC #54): других регионов в конфиге быть не должно.
    const otherRegions = allValues(doc).filter(
      (value) => FLY_REGION_CODES.includes(value) && value !== primaryRegion,
    );
    expect(otherRegions).toEqual([]);
  });

  it("min/max инстансов 1/1 — scale-to-zero вне scope", () => {
    const doc = parseToml(readRepoFile("fly.toml"));
    const httpService = doc.tables["http_service"]?.[0] ?? {};

    expect(Number(str(httpService.min_machines_running))).toBe(1);
    // "off" = Fly Proxy никогда не останавливает машины по простою (нет scale-to-zero).
    expect(str(httpService.auto_stop_machines)).toBe("off");
    expect(str(httpService.auto_start_machines)).toBe("true");
    // У Fly в fly.toml нет ключа max_machines_running — верхняя граница 1/1
    // выражается командой `fly scale count 1` (см. комментарий в fly.toml).
    expect(httpService.max_machines_running).toBeUndefined();
    expect(readRepoFile("fly.toml")).toMatch(/fly scale count 1\b/);
  });

  it("ресурсы: shared-cpu-1x и RAM ≤ 1GB", () => {
    const doc = parseToml(readRepoFile("fly.toml"));
    const vm = doc.tables["vm"]?.[0] ?? {};
    const memoryMb = memoryToMb(str(vm.memory));

    expect(str(vm.size)).toBe("shared-cpu-1x");
    expect(memoryMb).toBeGreaterThan(0);
    expect(memoryMb).toBeLessThanOrEqual(1024);
  });

  it("ADR-0004 ссылается на file path конфига", () => {
    const adr = readRepoFile("docs/adr/0004-hosting-platform.md");

    expect(adr).toContain("fly.toml");
    expect(adr).toMatch(/\(\.\.\/\.\.\/fly\.toml\)/);
  });

  it("runbook DNS/TLS (#56) на месте и связан со смежными артефактами", () => {
    const runbook = readRepoFile("docs/agents/production-dns-tls.md");

    // Runbook — основной артефакт тикета #56: без живого домена и Fly-аккаунта
    // именно он описывает выдачу сертификата, DNS-записи и проверки.
    expect(runbook).toContain("fly certs add");
    expect(runbook).toContain("fly ips list");
    expect(runbook).toContain("force_https");
    // Смежные артефакты карты #52 — по ним runbook и ведёт владельца релиза.
    expect(runbook).toContain("../adr/0004-hosting-platform.md");
    expect(runbook).toContain("production-secrets.md");
    // README ведёт на runbook (раздел «DNS / TLS»).
    expect(readRepoFile("README.md")).toContain("docs/agents/production-dns-tls.md");
  });
});
