/**
 * Дрейф-шит «код ↔ production-документация секретов» (тикет #55).
 *
 * Смысл: `.env.example` и `docs/agents/production-secrets.md` обязаны описывать
 * ровно те переменные окружения, которые реально читает backend-код, а
 * `.railway/railway.ts` — выставлять в production ровно те, которые должен.
 * Иначе документация молча устаревает: переменная появляется в `src/`, а в
 * `.env.example` её нет — и production-деплой ведёт себя не так, как ожидает
 * разработчик.
 *
 * Модель секретов (находка F1 аудита карты #52): `OWNER_*` — **не секреты**
 * (они публично отдаются в `GET /config`), поэтому живут в `env` IaC-конфига
 * и в `.env.example`. Настоящих секретов в v1 нет; механизм для будущих
 * секретов — `railway variable set` / sealed variables на платформе.
 *
 * Источник истины — литерал `EXPECTED_ENV_VARS` ниже: он продублирован из
 * acceptance criteria тикета #55 и из ADR-0005, а **не** вычисляется из кода.
 * Списки, выведенные из кода, проверяются против этого литерала — так тест
 * не тавтологичен (см. tdd-скилл: expected values must come from an
 * independent source of truth).
 */
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readmeSection } from "./helpers/readme.js";
import { secretValueHits } from "./helpers/secrets.js";

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

/**
 * Env-vars, которые читает backend-код: `PORT`/`HOST` — из `process.env`
 * (`src/server.ts`), `OWNER_*` — из `EnvSource` (`src/config/owner.ts`).
 * Продублировано из acceptance criteria тикета #55 и из ADR-0005.
 */
const CODE_ENV_VARS = [
  "PORT",
  "HOST",
  "OWNER_NAME",
  "OWNER_TIMEZONE",
  "OWNER_WINDOW_DAYS",
  "OWNER_SLOT_STEP_MINUTES",
  "OWNER_WORKING_DAYS",
  "OWNER_WORKING_HOURS_START",
  "OWNER_WORKING_HOURS_END",
] as const;

/**
 * Env-vars, которые выставляет платформа, а не код: `NODE_ENV` приходит из
 * `Dockerfile` / `env` в `.railway/railway.ts`. В production-контракт
 * (ADR-0005) он входит, поэтому обязан быть и в `.env.example`, и в runbook —
 * но читается он не backend-кодом, и в первом списке его нет.
 */
const PLATFORM_ENV_VARS = ["NODE_ENV"] as const;

/**
 * Полный production-контракт: имя + значения, которые обязаны встретиться
 * в строке таблицы документации (код-дефолт и/или production-значение).
 */
const EXPECTED_ENV_VARS = [
  { name: "PORT", values: ["3000"] },
  { name: "HOST", values: ["127.0.0.1", "0.0.0.0"] },
  { name: "NODE_ENV", values: ["production"] },
  { name: "OWNER_NAME", values: ["Demo Owner"] },
  { name: "OWNER_TIMEZONE", values: ["Europe/Moscow"] },
  { name: "OWNER_WINDOW_DAYS", values: ["14"] },
  { name: "OWNER_SLOT_STEP_MINUTES", values: ["30"] },
  { name: "OWNER_WORKING_DAYS", values: ["1,2,3,4,5"] },
  { name: "OWNER_WORKING_HOURS_START", values: ["09:00"] },
  { name: "OWNER_WORKING_HOURS_END", values: ["18:00"] },
] as const;

/**
 * Переменные, которые **не** являются секретами: их значения публично
 * отдаёт `GET /config`, «секретность» им ничего не даёт (находка F1).
 */
const PUBLIC_ENV_VARS = [
  "OWNER_NAME",
  "OWNER_TIMEZONE",
  "OWNER_WINDOW_DAYS",
  "OWNER_SLOT_STEP_MINUTES",
  "OWNER_WORKING_DAYS",
  "OWNER_WORKING_HOURS_START",
  "OWNER_WORKING_HOURS_END",
] as const;

const ENV_EXAMPLE_PATH = join(REPO_ROOT, ".env.example");
const SECRETS_DOC_PATH = join(REPO_ROOT, "docs/agents/production-secrets.md");
const README_PATH = join(REPO_ROOT, "README.md");
const IAC_PATH = join(REPO_ROOT, ".railway/railway.ts");

/** Все `.ts`-файлы `src/` — рекурсивно. */
function listSourceFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
    .map((entry) => join(entry.parentPath, entry.name));
}

/** Прямой доступ `process.env.<NAME>`. */
function readProcessEnvVars(files: string[]): Set<string> {
  const found = new Set<string>();
  const pattern = /process\.env\.([A-Z_][A-Z0-9_]*)/g;
  for (const file of files) {
    for (const match of readFileSync(file, "utf8").matchAll(pattern)) {
      found.add(match[1] as string);
    }
  }
  return found;
}

/** Доступ через `EnvSource`-параметр `loadOwnerConfig(env)` в `src/config/owner.ts`. */
function readOwnerConfigEnvVars(file: string): Set<string> {
  const found = new Set<string>();
  // `(?<![.\w])` отсекает `process.env.X` — там нужен именно `env.X`.
  const pattern = /(?<![.\w])env\.([A-Z_][A-Z0-9_]*)/g;
  for (const match of readFileSync(file, "utf8").matchAll(pattern)) {
    found.add(match[1] as string);
  }
  return found;
}

/** Ключи `NAME=...` из dotenv-файла (комментарии и пустые строки пропускаются). */
function parseEnvKeys(content: string): string[] {
  return [...parseEnvEntries(content).keys()];
}

/**
 * Пары `NAME=VALUE` из dotenv-файла. Значение — всё после первого `=`,
 * включая пробелы (`OWNER_NAME=Demo Owner`).
 */
function parseEnvEntries(content: string): Map<string, string> {
  const entries = new Map<string, string>();
  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) continue;
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
    if (match === null) {
      throw new Error(`.env.example: строка не формы NAME=... — "${line}"`);
    }
    entries.set(match[1] as string, match[2] as string);
  }
  return entries;
}

/**
 * Строка markdown-таблицы, в которой переменная стоит **первой ячейкой**.
 * Проверка именно первой ячейки, а не «где-то в строке»: иначе ссылка на
 * соседнюю переменную внутри чужой строки (`строго меньше \`X\``) перехватила
 * бы поиск.
 */
function findDocRow(doc: string, varName: string): string | undefined {
  const needle = `\`${varName}\``;
  return doc
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("|"))
    .find((line) => {
      const cells = line.split("|").map((cell) => cell.trim());
      return cells[1]?.includes(needle) ?? false;
    });
}

/**
 * Ключи `env` из `.railway/railway.ts` — разбираем блок `env: { … }` вручную:
 * формат файла фиксирован этим же репозиторием, а лишний парсер не нужен.
 */
function readIaCEnvKeys(source: string): string[] {
  const start = source.indexOf("env: {");
  if (start === -1) return [];
  const end = source.indexOf("}", start);
  if (end === -1) return [];

  return [...source.slice(start + "env: {".length, end).matchAll(/^\s*([A-Z_][A-Z0-9_]*):/gm)].map(
    (match) => match[1] as string,
  );
}

/** `git ls-files` — список отслеживаемых файлов; `null`, если git недоступен. */
function trackedFiles(): string[] | null {
  try {
    const out = execFileSync("git", ["ls-files"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return out.split("\n").filter((line) => line !== "");
  } catch {
    return null;
  }
}

const sourceFiles = listSourceFiles(join(REPO_ROOT, "src"));
const codeEnvVars = [
  ...readProcessEnvVars(sourceFiles),
  ...readOwnerConfigEnvVars(join(REPO_ROOT, "src/config/owner.ts")),
].toSorted();

const expectedNames = EXPECTED_ENV_VARS.map((entry) => entry.name);

describe("drift seam: код ↔ production env-vars", () => {
  it("backend читает ровно ожидаемый набор env-vars", () => {
    expect(codeEnvVars).toEqual([...CODE_ENV_VARS].toSorted());
  });

  it("код не читает переменных, которых нет в контракте #55", () => {
    const known = new Set<string>([...CODE_ENV_VARS, ...PLATFORM_ENV_VARS]);
    expect(codeEnvVars.filter((name) => !known.has(name))).toEqual([]);
  });

  it("контракт #55 — это кодовые переменные плюс переменные платформы", () => {
    expect([...expectedNames].toSorted()).toEqual(
      [...CODE_ENV_VARS, ...PLATFORM_ENV_VARS].toSorted(),
    );
  });
});

describe("drift seam: .env.example ↔ код", () => {
  it(".env.example существует", () => {
    expect(existsSync(ENV_EXAMPLE_PATH)).toBe(true);
  });

  it(".env.example перечисляет ровно те переменные, что читает код", () => {
    const keys = parseEnvKeys(readFileSync(ENV_EXAMPLE_PATH, "utf8"));
    expect([...keys].toSorted()).toEqual([...expectedNames].toSorted());
  });

  it(".env.example не содержит повторов переменных", () => {
    const keys = parseEnvKeys(readFileSync(ENV_EXAMPLE_PATH, "utf8"));
    expect([...new Set(keys)].toSorted()).toEqual([...keys].toSorted());
  });

  it(".env.example содержит значения по умолчанию из контракта #55", () => {
    // Шаблон не «форма без значений»: в нём записаны дефолты из кода (и
    // production-значения для HOST/NODE_ENV). Значения обязаны совпадать с
    // контрактом тикета #55, иначе шаблон врёт о поведении приложения.
    const entries = parseEnvEntries(readFileSync(ENV_EXAMPLE_PATH, "utf8"));

    for (const { name, values } of EXPECTED_ENV_VARS) {
      const value = entries.get(name);
      expect(value, `в .env.example нет значения для ${name}`).toBeDefined();
      expect(values, `неожиданное значение ${name}="${value}" в .env.example`).toContain(value);
    }
  });

  it(".env.example не содержит credential-значений", () => {
    // Шаблон коммитится в репозиторий: присваивания токенов/паролей в нём
    // быть не должно (сканер — общий, `test/helpers/secrets.ts`).
    expect(secretValueHits(readFileSync(ENV_EXAMPLE_PATH, "utf8"))).toEqual([]);
  });
});

describe("drift seam: .railway/railway.ts ↔ .env.example (#55)", () => {
  const iacEnvKeys = readIaCEnvKeys(readFileSync(IAC_PATH, "utf8"));

  it("IaC-конфиг выставляет все переменные из `.env.example`, кроме `PORT`", () => {
    // `PORT` Railway инжектит сам — задавать его в конфиге не нужно.
    const expected = expectedNames.filter((name) => name !== "PORT");
    expect([...iacEnvKeys].toSorted()).toEqual([...expected].toSorted());
  });

  it("`PORT` в IaC-конфиге не задан", () => {
    expect(iacEnvKeys).not.toContain("PORT");
  });
});

describe("drift seam: docs/agents/production-secrets.md ↔ код", () => {
  const doc = existsSync(SECRETS_DOC_PATH) ? readFileSync(SECRETS_DOC_PATH, "utf8") : "";

  it("runbook существует", () => {
    expect(existsSync(SECRETS_DOC_PATH)).toBe(true);
  });

  for (const { name, values } of EXPECTED_ENV_VARS) {
    it(`runbook документирует \`${name}\` вместе со значением и признаком секретности`, () => {
      const row = findDocRow(doc, name);
      expect(row, `в runbook нет строки таблицы с \`${name}\``).toBeDefined();
      for (const value of values) {
        expect(row, `в строке \`${name}\` нет значения "${value}"`).toContain(value);
      }
      expect(row?.toLowerCase()).toContain("секрет");
    });
  }

  for (const name of PUBLIC_ENV_VARS) {
    it(`\`${name}\` помечен как НЕ секрет (модель F1: значение публично в /config)`, () => {
      const row = findDocRow(doc, name);
      expect(row, `в runbook нет строки таблицы с \`${name}\``).toBeDefined();
      expect(row?.toLowerCase()).toContain("не секрет");
    });
  }

  it("runbook не велит выставлять публичные `OWNER_*` через секреты", () => {
    // Команда вида `railway variable set OWNER_NAME=…` противоречила бы
    // модели «OWNER_* — не секреты» (находка F1 аудита).
    expect(doc).not.toMatch(/railway\s+variable\s+set\s+OWNER_/i);
  });

  it("runbook называет платформу и способ настройки секретов", () => {
    expect(doc).toContain("Railway");
    expect(doc).toContain("railway variable set");
    expect(doc).toContain("railway variable list");
    expect(doc).toContain("railway variable delete");
  });

  it("runbook описывает sealed variables — платформенный механизм секретов", () => {
    expect(doc.toLowerCase()).toContain("sealed");
  });

  it("runbook разделяет секреты и несекретный `env` IaC-конфига", () => {
    expect(doc).toContain(".railway/railway.ts");
    expect(doc).toContain("env");
  });

  it("runbook фиксирует rotation policy и реакцию на утечку", () => {
    expect(doc.toLowerCase()).toContain("ротаци");
    expect(doc.toLowerCase()).toContain("утечк");
  });

  it("runbook ссылается на ADR-0005 и тикет #54", () => {
    expect(doc).toContain("ADR-0005");
    expect(doc).toContain("#54");
  });

  it("runbook запрещает хранить значения секретов в репозитории", () => {
    expect(doc).toContain(".env.example");
    expect(doc).toContain(".env.production");
  });
});

describe("drift seam: README ↔ runbook", () => {
  const readme = readFileSync(README_PATH, "utf8");

  it("README содержит раздел «Secrets» со ссылкой на runbook", () => {
    expect(readme).toMatch(/^##\s+Secrets\s*$/m);
    expect(readme).toContain("docs/agents/production-secrets.md");
  });

  it("README и runbook описывают `.env.example` одинаково", () => {
    // `.env.example` содержит значения по умолчанию (дефолты из кода) — называть
    // его «формой/шаблоном без значений» значит противоречить самому файлу.
    const doc = readFileSync(SECRETS_DOC_PATH, "utf8");
    const secretsSection = readmeSection(readme, "Secrets");

    for (const [name, text] of [
      ["README «Secrets»", secretsSection],
      ["runbook", doc],
    ] as const) {
      expect(text, `${name}: .env.example назван шаблоном без значений`).not.toMatch(
        /без\s+значений/,
      );
      expect(text, `${name}: нет единой формулировки про шаблон env-контракта`).toMatch(
        /имена\s+переменных/,
      );
    }
  });

  it("README «Secrets» называет платформу Railway", () => {
    const secretsSection = readmeSection(readme, "Secrets");
    expect(secretsSection).toContain("Railway");
  });
});

describe("репозиторий не хранит значения секретов", () => {
  it(".gitignore игнорирует `.env`/`.env.*`, но не `.env.example`", () => {
    const gitignore = readFileSync(join(REPO_ROOT, ".gitignore"), "utf8");
    const lines = gitignore.split("\n").map((line) => line.trim());
    expect(lines).toContain(".env");
    expect(lines).toContain(".env.*");
    expect(lines).toContain("!.env.example");
  });

  const tracked = trackedFiles();

  it.skipIf(tracked === null)("в git-индексе нет `.env` / `.env.production`", () => {
    const trackedNames = tracked ?? [];
    expect(trackedNames.filter((name) => name === ".env" || name === ".env.production")).toEqual(
      [],
    );
  });

  it.skipIf(tracked === null)("`.env.example` отслеживается git'ом", () => {
    expect(tracked ?? []).toContain(".env.example");
  });
});
