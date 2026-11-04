/**
 * Дрейф-шит «проектная MCP-конфигурация ↔ инструкция в репозитории» (тикет #63).
 *
 * Смысл: `.opencode/opencode.json` — единственное место, где проект объявляет
 * MCP-серверы для агента. Форма V2 (`mcp.servers`) канонична, V1-путь
 * (`mcp.<name>`) deprecated. Если форма устареет, в конфиг попадёт токен или
 * инструкция в README разойдётся с конфигом — новый разработчик получит либо
 * сломанное подключение, либо утечку кредов в git.
 *
 * Ожидаемые значения — литералы ниже: продублированы из acceptance criteria
 * тикета #63 и из документации OpenCode V2, а **не** вычислены из самого
 * конфига (иначе тест тавтологичен).
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readmeSection } from "./helpers/readme.js";
import { secretFieldHits } from "./helpers/secrets.js";

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

const CONFIG_PATH = join(REPO_ROOT, ".opencode/opencode.json");
const README_PATH = join(REPO_ROOT, "README.md");
const MCP_DOC_PATH = join(REPO_ROOT, "docs/agents/production-mcp.md");

/**
 * Ключи, допустимые у `mcp` в OpenCode V2. Всё остальное — устаревшая
 * V1-форма, где сервер объявлялся прямо в `mcp.<name>`.
 *
 * `enabled` — глобальный тумблер MCP (валиден по схеме
 * <https://opencode.ai/config.json>), его наличие ошибкой не считается.
 */
const CANONICAL_MCP_KEYS = ["servers", "timeout", "enabled"];

/**
 * Что ждём от `railway-mcp` (AC тикета #63): remote + публичный URL, OAuth
 * по умолчанию. URL — официальный hosted-сервер Railway.
 */
const RAILWAY_MCP_SERVER = { type: "remote", url: "https://mcp.railway.com" } as const;

/** Что ждём от `shadcn` после миграции формы — команда запуска не меняется. */
const SHADCN_COMMAND = ["npx", "-y", "shadcn@latest", "mcp"];

/** Команды, которые обязаны быть в инструкции (AC тикета #63). */
const CONNECT_COMMAND = "opencode mcp add --global railway-mcp --url https://mcp.railway.com";
const AUTH_COMMAND = "opencode mcp auth railway-mcp";

type McpServerEntry = {
  type?: string;
  url?: string;
  command?: string[];
  headers?: Record<string, string>;
  environment?: Record<string, string>;
  oauth?: unknown;
};

type OpenCodeConfig = {
  $schema?: string;
  mcp?: Record<string, unknown> & { servers?: Record<string, McpServerEntry> };
};

const rawConfig = readFileSync(CONFIG_PATH, "utf8");

/** Разбор конфига без падения на этапе импорта: ошибка — тоже проверяемый факт. */
function tryParseConfig(raw: string): { config: OpenCodeConfig; error: unknown } {
  try {
    return { config: JSON.parse(raw) as OpenCodeConfig, error: undefined };
  } catch (error) {
    return { config: {}, error };
  }
}

const parsed = tryParseConfig(rawConfig);
const config = parsed.config;

describe("drift seam: .opencode/opencode.json — форма V2", () => {
  it("конфиг — валидный JSON (подмножество JSONC)", () => {
    expect(parsed.error).toBeUndefined();
  });

  it("конфиг ссылается на опубликованную схему OpenCode", () => {
    expect(config.$schema).toBe("https://opencode.ai/config.json");
  });

  it("серверы объявлены в каноническом V2-пути `mcp.servers`", () => {
    const servers = config.mcp?.servers;
    expect(servers, "в конфиге нет `mcp.servers`").toBeTypeOf("object");
    expect(Object.keys(servers ?? {})).toContain("railway-mcp");
  });

  it("устаревшая V1-форма `mcp.<name>` не используется", () => {
    const mcp = config.mcp ?? {};
    const legacyKeys = Object.keys(mcp).filter((key) => !CANONICAL_MCP_KEYS.includes(key));
    expect(legacyKeys, "серверы объявлены прямо в `mcp` — это deprecated V1-путь").toEqual([]);
  });
});

describe("drift seam: .opencode/opencode.json — состав серверов", () => {
  const servers = config.mcp?.servers ?? {};

  it("`railway-mcp` — remote-сервер Railway с публичным URL", () => {
    expect(servers["railway-mcp"]).toMatchObject(RAILWAY_MCP_SERVER);
  });

  it("`railway-mcp` не содержит заголовков с кредом и не отключает OAuth", () => {
    const railway = servers["railway-mcp"] ?? {};
    expect(railway.headers).toBeUndefined();
    expect(railway.oauth).toBeUndefined();
  });

  it("`shadcn` остался в списке серверов (миграция формы, не удаление)", () => {
    expect(Object.keys(servers)).toContain("shadcn");
    expect(servers["shadcn"]?.type).toBe("local");
    expect(servers["shadcn"]?.command).toEqual(SHADCN_COMMAND);
  });

  it("состав серверов совпадает с ожидаемым", () => {
    expect(Object.keys(servers).toSorted()).toEqual(["railway-mcp", "shadcn"]);
  });

  it("прежний `fly-mcp` убран — платформа размещения теперь Railway", () => {
    expect(Object.keys(servers)).not.toContain("fly-mcp");
  });
});

/**
 * Паттерны «похожего на секрет» и сбор строк конфига живут в общем хелпере
 * `test/helpers/secrets.ts` — тем же сканером пользуются drift-тесты
 * production-документации.
 */
describe("репозиторий не хранит значения секретов в MCP-конфиге", () => {
  it("в конфиге нет токенов, ключей, паролей и заголовков с кредом", () => {
    expect(secretFieldHits(config)).toEqual([]);
  });
});

describe("drift seam: README ↔ проектная MCP-конфигурация", () => {
  const readme = readFileSync(README_PATH, "utf8");
  const section = readmeSection(readme, "MCP");

  it("README содержит раздел «MCP»", () => {
    expect(readme).toMatch(/^##\s+MCP\s*$/m);
    expect(section).not.toBe("");
  });

  it("раздел «MCP» объясняет, как подключить `railway-mcp`", () => {
    expect(section).toContain(CONNECT_COMMAND);
  });

  it("раздел «MCP» объясняет, как залогиниться через OAuth", () => {
    expect(section).toContain(AUTH_COMMAND);
    expect(section).toContain("/mcps");
  });

  it("раздел «MCP» фиксирует: секреты хранятся вне репозитория", () => {
    expect(section).toMatch(/вне\s+репозитория/i);
  });

  it("раздел «MCP» ссылается на runbook по MCP", () => {
    expect(section).toContain("docs/agents/production-mcp.md");
  });

  it("раздел «MCP» больше не упоминает `fly-mcp`", () => {
    expect(section).not.toContain("fly-mcp");
  });
});

describe("drift seam: runbook MCP ↔ проектная MCP-конфигурация", () => {
  const doc = existsSync(MCP_DOC_PATH) ? readFileSync(MCP_DOC_PATH, "utf8") : "";

  it("runbook существует", () => {
    expect(existsSync(MCP_DOC_PATH)).toBe(true);
  });

  it("runbook описывает подключение и логин теми же командами", () => {
    expect(doc).toContain(CONNECT_COMMAND);
    expect(doc).toContain(AUTH_COMMAND);
  });

  it("runbook фиксирует тот же публичный URL, что и конфиг", () => {
    expect(doc).toContain(RAILWAY_MCP_SERVER.url);
  });

  it("runbook говорит, что OAuth-токены хранятся вне репозитория", () => {
    expect(doc).toMatch(/вне\s+репозитория/i);
    expect(doc).toContain("OAuth");
  });

  it("runbook ссылается на ADR-0005", () => {
    expect(doc).toContain("ADR-0005");
  });
});
