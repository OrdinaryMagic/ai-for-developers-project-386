/**
 * Контракт production-размещения, зафиксированный в `.railway/railway.ts`
 * (тикет #54, платформа — ADR-0005).
 *
 * Тест **компилирует** IaC-файл программно (`defineRailway` → `project` →
 * `ServiceNode`) и проверяет получившийся граф, а не текст файла: так
 * проверяются именно те значения, которые уедут в окружение Railway.
 *
 * Ожидаемые значения — литералы ниже: продублированы из acceptance criteria
 * тикета #54 и из ADR-0005, а **не** вычислены из самого конфига (иначе тест
 * тавтологичен).
 *
 * Типобезопасность: `.railway/railway.ts` типизируется отдельным
 * `tsconfig.railway.json` (шаг `typecheck`), поэтому опечатка в ключе
 * (например, `healthcheckPth`) не проходит молча — компилятор Railway-SDK её
 * отвергнет. Это закрывает находку F2 аудита карты #52, где `fly.toml`
 * проверялся на *наличие* ключей, но не на *отсутствие* неизвестных.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRailwayContext, project as railwayProject } from "railway/iac";
import program from "../.railway/railway.js";

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

const IAC_PATH = join(REPO_ROOT, ".railway/railway.ts");
const MANIFEST_PATH = join(REPO_ROOT, ".railway/production.json");
const TSCONFIG_PATH = join(REPO_ROOT, "tsconfig.railway.json");
const ADR_PATH = join(REPO_ROOT, "docs/adr/0005-hosting-platform-railway.md");
const PACKAGE_JSON_PATH = join(REPO_ROOT, "package.json");

/** AC #54: единственный источник сборки — корневой Dockerfile cart #42. */
const EXPECTED_REPO = "OrdinaryMagic/ai-for-developers-project-386";
const EXPECTED_BRANCH = "main";
const EXPECTED_DOCKERFILE = "Dockerfile";
const EXPECTED_HEALTHCHECK_PATH = "/health";

/** AC #54: RAM ≤ 1GB, CPU — с запасом меньше лимита бесплатного плана. */
const MAX_MEMORY_BYTES = 1_000_000_000;

/**
 * Регионы Railway (docs.railway.com/deployments/regions). Список нужен, чтобы
 * «лишний» регион в конфиге был пойман по имени, а не просто по количеству.
 */
const RAILWAY_REGIONS = [
  "us-west2",
  "us-east4-eqdc4a",
  "europe-west4-drams3a",
  "asia-southeast1-eqsg3a",
] as const;

/**
 * Переменные, которые обязаны быть в `env` IaC-файла. `PORT` здесь **нет**:
 * Railway подставляет порт сам (приложение читает `process.env.PORT`).
 */
const EXPECTED_ENV_KEYS = [
  "HOST",
  "NODE_ENV",
  "OWNER_NAME",
  "OWNER_TIMEZONE",
  "OWNER_WINDOW_DAYS",
  "OWNER_SLOT_STEP_MINUTES",
  "OWNER_WORKING_HOURS_START",
  "OWNER_WORKING_HOURS_END",
] as const;

/**
 * Публичные значения `OWNER_*` — продублированы из дефолтов `src/config/owner.ts`
 * и из ADR-0005. Сверка ловит рассинхрон между IaC-конфигом и кодом.
 */
const EXPECTED_OWNER_VALUES: Record<string, string> = {
  OWNER_NAME: "Demo Owner",
  OWNER_TIMEZONE: "Europe/Moscow",
  OWNER_WINDOW_DAYS: "14",
  OWNER_SLOT_STEP_MINUTES: "30",
  OWNER_WORKING_HOURS_START: "09:00",
  OWNER_WORKING_HOURS_END: "18:00",
};

/** UUID-формат идентификаторов окружения (Railway API). */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as {
  platform?: string;
  projectId?: string;
  serviceId?: string;
  environmentId?: string;
  environmentName?: string;
  region?: string;
  publicUrl?: string;
};

const iacSource = readFileSync(IAC_PATH, "utf8");

/**
 * Скомпилированный узел сервиса в графе Railway IaC.
 *
 * `resources` — это массив узлов (или массивов узлов), поэтому узел достаётся
 * через сужение по `type`, а не через приведение типа: так тест не сломается,
 * если форма графа изменится.
 */
type CompiledService = {
  type?: string;
  name?: string;
  source?: { type?: string; repo?: string | null; branch?: string | null };
  build?: {
    builder?: string | null;
    dockerfilePath?: string | null;
  };
  deploy?: {
    healthcheckPath?: string | null;
    healthcheckTimeout?: number | null;
    sleepApplication?: boolean | null;
    restartPolicyType?: string | null;
    restartPolicyMaxRetries?: number | null;
    limitOverride?: {
      containers?: { cpu?: number | null; memoryBytes?: number | null } | null;
    } | null;
    multiRegionConfig?: Record<string, { numReplicas?: number }> | null;
  };
  variables?: Record<string, { type?: string; value?: string }>;
};

/**
 * Скомпилированный IaC-файл. `service()` вызывается внутри программы, поэтому
 * ресурсы уже развёрнуты в узлы графа (`ServiceNode`).
 */
const definition = await program(
  createRailwayContext({ environment: "production", environmentName: "production" }),
  railwayProject,
);

const resources = definition.resources ?? [];

function asService(node: unknown): CompiledService | undefined {
  if (node === null || typeof node !== "object") return undefined;
  const candidate = node as CompiledService;
  return candidate.type === "service" ? candidate : undefined;
}

const serviceNode = asService(resources[0]);

describe(".railway/railway.ts — форма и структура (#54)", () => {
  it("IaC-файл существует", () => {
    expect(existsSync(IAC_PATH)).toBe(true);
  });

  it("проект компилируется и называется `booking-api`", () => {
    expect(definition.name).toBe("booking-api");
  });

  it("в проекте ровно один ресурс — сервис `booking-api`", () => {
    expect(resources).toHaveLength(1);
    expect(serviceNode?.type).toBe("service");
    expect(serviceNode?.name).toBe("booking-api");
  });

  it("сервис подключён к этому GitHub-репозиторию и ветке `main`", () => {
    expect(serviceNode?.source?.type).toBe("github");
    expect(serviceNode?.source?.repo).toBe(EXPECTED_REPO);
    expect(serviceNode?.source?.branch).toBe(EXPECTED_BRANCH);
  });

  it("build — из корневого Dockerfile", () => {
    expect(serviceNode?.build?.builder).toBe("DOCKERFILE");
    expect(serviceNode?.build?.dockerfilePath).toBe(EXPECTED_DOCKERFILE);
  });
});

describe(".railway/railway.ts — deploy-контракт (#54)", () => {
  it("health-check — `GET /health` с таймаутом 30 с", () => {
    expect(serviceNode?.deploy?.healthcheckPath).toBe(EXPECTED_HEALTHCHECK_PATH);
    expect(serviceNode?.deploy?.healthcheckTimeout).toBe(30);
  });

  it("scale-to-zero выключен — сервис всегда онлайн", () => {
    expect(serviceNode?.deploy?.sleepApplication).toBe(false);
  });

  it("restart policy — ON_FAILURE с 10 попытками", () => {
    expect(serviceNode?.deploy?.restartPolicyType).toBe("ON_FAILURE");
    expect(serviceNode?.deploy?.restartPolicyMaxRetries).toBe(10);
  });

  it("лимиты: CPU ≤ 1 vCPU и RAM ≤ 1GB", () => {
    const containers = serviceNode?.deploy?.limitOverride?.containers;
    expect(containers?.cpu).toBeTypeOf("number");
    expect(containers?.cpu as number).toBeGreaterThan(0);
    expect(containers?.cpu as number).toBeLessThanOrEqual(1);
    expect(containers?.memoryBytes).toBeTypeOf("number");
    expect(containers?.memoryBytes as number).toBeGreaterThan(0);
    expect(containers?.memoryBytes as number).toBeLessThanOrEqual(MAX_MEMORY_BYTES);
  });
});

describe(".railway/railway.ts — регион и реплики (#54)", () => {
  it("регион ровно один и известный Railway", () => {
    const regions = Object.keys(serviceNode?.deploy?.multiRegionConfig ?? {});
    expect(regions).toHaveLength(1);
    expect(RAILWAY_REGIONS).toContain(regions[0] as (typeof RAILWAY_REGIONS)[number]);
  });

  it("реплик ровно одна — single-writer (ADR-0001/ADR-0002)", () => {
    const regions = serviceNode?.deploy?.multiRegionConfig ?? {};
    const counts = Object.values(regions).map((region) => region.numReplicas);
    expect(counts).toEqual([1]);
  });

  it("регион конфига совпадает с регионом манифеста окружения", () => {
    const regions = Object.keys(serviceNode?.deploy?.multiRegionConfig ?? {});
    expect(regions[0]).toBe(manifest.region);
  });
});

describe(".railway/railway.ts — переменные окружения (#55)", () => {
  it("`env` содержит ровно ожидаемый набор несекретных переменных", () => {
    expect(Object.keys(serviceNode?.variables ?? {}).toSorted()).toEqual(
      [...EXPECTED_ENV_KEYS].toSorted(),
    );
  });

  it("`PORT` не задан — Railway инжектит порт сам", () => {
    expect(Object.keys(serviceNode?.variables ?? {})).not.toContain("PORT");
  });

  it("`HOST` — 0.0.0.0 (в контейнере нужен не loopback)", () => {
    expect(serviceNode?.variables?.["HOST"]?.value).toBe("0.0.0.0");
  });

  it("`NODE_ENV` — production", () => {
    expect(serviceNode?.variables?.["NODE_ENV"]?.value).toBe("production");
  });

  it("значения `OWNER_*` совпадают с дефолтами кода", () => {
    for (const [name, value] of Object.entries(EXPECTED_OWNER_VALUES)) {
      expect(serviceNode?.variables?.[name]?.value, name).toBe(value);
    }
  });

  it("все переменные — литералы (никаких ссылок на секреты)", () => {
    for (const [name, variable] of Object.entries(serviceNode?.variables ?? {})) {
      expect(variable.type, name).toBe("literal");
    }
  });

  it("в `env` нет ни одного секрета", () => {
    // Секреты живут только на платформе (sealed variables) — в репозитории им
    // не место (см. docs/agents/production-secrets.md).
    const suspicious = Object.keys(serviceNode?.variables ?? {}).filter((key) =>
      /token|password|secret|api[_-]?key|bearer/i.test(key),
    );
    expect(suspicious).toEqual([]);
  });
});

describe(".railway/production.json — манифест окружения (#62)", () => {
  it("манифест существует и объявляет платформу Railway", () => {
    expect(existsSync(MANIFEST_PATH)).toBe(true);
    expect(manifest.platform).toBe("railway");
  });

  it("идентификаторы окружения — UUID", () => {
    expect(manifest.projectId).toMatch(UUID_PATTERN);
    expect(manifest.serviceId).toMatch(UUID_PATTERN);
    expect(manifest.environmentId).toMatch(UUID_PATTERN);
  });

  it("имена проекта, сервиса и окружения непустые", () => {
    expect(manifest.projectName).toBe("booking-api");
    expect(manifest.serviceName).toBe("booking-api");
    expect(manifest.environmentName).toBe("production");
  });

  it("`publicUrl` — платформенный домен Railway с HTTPS", () => {
    expect(manifest.publicUrl).toMatch(/^https:\/\/[a-z0-9-]+\.up\.railway\.app$/);
  });

  it("`publicUrl` не попал в IaC-файл (сгенерированные домены в IaC не пишутся)", () => {
    // В комментариях упоминание формата домена допустимо — запрещён именно
    // конкретный адрес окружения: он генерируется платформой и в IaC не пишется.
    const canonicalUrl = manifest.publicUrl ?? "";
    expect(canonicalUrl).not.toBe("");
    expect(iacSource).not.toContain(canonicalUrl);
    expect(iacSource).not.toMatch(/https:\/\/[a-z0-9-]+\.up\.railway\.app/);
  });
});

describe("типизация IaC-конфига (F2 аудита #52)", () => {
  it("`tsconfig.railway.json` существует и включает IaC-файл", () => {
    expect(existsSync(TSCONFIG_PATH)).toBe(true);
    const tsconfig = JSON.parse(readFileSync(TSCONFIG_PATH, "utf8")) as {
      include?: string[];
      compilerOptions?: { noEmit?: boolean };
    };
    expect(tsconfig.include).toContain(".railway/railway.ts");
    expect(tsconfig.compilerOptions?.noEmit).toBe(true);
  });

  it("скрипт `typecheck` проверяет и IaC-конфиг", () => {
    const pkg = JSON.parse(readFileSync(PACKAGE_JSON_PATH, "utf8")) as {
      scripts?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    expect(pkg.scripts?.["typecheck"] ?? "").toContain("tsconfig.railway.json");
    expect(pkg.devDependencies?.["railway"]).toBeDefined();
  });
});

describe("ADR-0005 — решение о платформе (#53)", () => {
  it("ADR существует и принят", () => {
    expect(existsSync(ADR_PATH)).toBe(true);
    const adr = readFileSync(ADR_PATH, "utf8");
    expect(adr).toMatch(/^##\s+Status\s*$/m);
    expect(adr).toMatch(/accepted/i);
  });

  it("ADR ссылается на файл конфигурации", () => {
    const adr = readFileSync(ADR_PATH, "utf8");
    expect(adr).toContain("../../.railway/railway.ts");
  });

  it("ADR помечает ADR-0004 как superseded", () => {
    const adr = readFileSync(ADR_PATH, "utf8");
    expect(adr).toContain("0004-hosting-platform.md");
    expect(adr).toMatch(/supersed/i);
  });
});

// Про удаление deprecated-форматов (`fly.toml`, `railway.toml`) из репозитория
// — отдельный контрактный тест `test/deprecated-fly-artifacts.test.ts`: он
// проверяет отсутствие файлов, а не содержимое конфига.
