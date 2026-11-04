/**
 * Post-deploy smoke-скрипт (тикет #57): контракт CLI и поведение по-настоящему.
 *
 * Seam под тестом — сам скрипт `scripts/production-smoke.sh` как CLI:
 * вход — base URL (или его отсутствие), выход — код возврата и stdout.
 * Никаких моков HTTP-клиента: скрипт проверяется против настоящего
 * Fastify-приложения из `src/app.ts`, поднятого в том же процессе теста
 * на случайном порту (`port: 0`).
 *
 * Тест не ходит в интернет: адреса `127.0.0.1` + «мёртвый» порт, а
 * кейс с default-URL выполняется со stub-ом `curl` в PATH.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn } from "node:child_process";
import {
  accessSync,
  chmodSync,
  constants,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SCRIPT_PATH = join(REPO_ROOT, "scripts", "production-smoke.sh");
const MANIFEST_PATH = join(REPO_ROOT, ".railway/production.json");

/** Результат прогона скрипта: код возврата + собранный вывод. */
interface SmokeRun {
  code: number | null;
  output: string;
}

/**
 * Прогон скрипта. `SMOKE_RETRIES`/`SMOKE_RETRY_DELAY` по умолчанию урезаются,
 * чтобы тесты не ждали реальные паузы retry-цикла.
 */
function runSmoke(args: string[], env: NodeJS.ProcessEnv = {}): Promise<SmokeRun> {
  return new Promise((resolve, reject) => {
    const child = spawn(SCRIPT_PATH, args, {
      env: {
        ...process.env,
        SMOKE_RETRIES: "1",
        SMOKE_RETRY_DELAY: "0",
        ...env,
      },
    });

    let output = "";
    child.stdout.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, output }));
  });
}

/** Канонический публичный URL — поле `publicUrl` манифеста окружения. */
function readCanonicalUrl(): string {
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as { publicUrl?: string };
  return manifest.publicUrl ?? "";
}

let app: FastifyInstance | null = null;
let liveBaseUrl = "";
let staticRoot = "";

/**
 * Фикстура «собранного фронтенда»: оболочка SPA + один ассет.
 *
 * Smoke-проверяет, что задеплоенный сервис отдаёт UI, поэтому тест не может
 * полагаться на локальный `web/dist` (в CI его нет) — собираем минимальный
 * каталог статики во временной папке.
 */
beforeAll(() => {
  staticRoot = mkdtempSync(join(tmpdir(), "production-smoke-static-"));
  mkdirSync(join(staticRoot, "assets"));
  writeFileSync(
    join(staticRoot, "index.html"),
    '<!doctype html><html lang="en"><body><div id="root"></div></body></html>',
    "utf8",
  );
  writeFileSync(join(staticRoot, "assets", "app.js"), "console.log('app');\n", "utf8");
});

beforeAll(async () => {
  app = await buildApp({ staticRoot });
  await app.listen({ port: 0, host: "127.0.0.1" });
  const address = app.server.address();
  if (address === null || typeof address === "string") {
    throw new Error("не удалось получить адрес поднятого приложения");
  }
  liveBaseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  if (app) {
    await app.close();
    app = null;
  }
  rmSync(staticRoot, { recursive: true, force: true });
});

describe("контракт scripts/production-smoke.sh", () => {
  it("скрипт существует и исполняемый (бит X_OK)", () => {
    expect(() => accessSync(SCRIPT_PATH, constants.F_OK)).not.toThrow();
    expect(() => accessSync(SCRIPT_PATH, constants.X_OK)).not.toThrow();
  });

  it("в скрипте зафиксированы все проверяемые пути", () => {
    const source = readFileSync(SCRIPT_PATH, "utf8");

    for (const path of ["/", "/health", "/config", "/meeting-types", "/admin/event-types"]) {
      expect(source, `в скрипте нет пути ${path}`).toContain(`"${path}"`);
    }
  });

  it("скрипт проверяет UI: Accept-заголовок и режим html-валидатора", () => {
    const source = readFileSync(SCRIPT_PATH, "utf8");

    expect(source).toContain("BROWSER_ACCEPT");
    expect(source).toContain('"html"');
  });
});

describe("smoke против живого приложения", () => {
  it("проходит с кодом 0 и печатает PASS", async () => {
    const run = await runSmoke([liveBaseUrl]);

    expect(run.code, run.output).toBe(0);
    expect(run.output).toContain("PASS");
    expect(run.output).not.toContain("FAIL");
  });

  it("проверяет все шесть эндпоинтов", async () => {
    const run = await runSmoke([liveBaseUrl]);

    for (const path of ["/", "/health", "/config", "/meeting-types", "/admin/event-types"]) {
      expect(run.output, `эндпоинт ${path} не проверен`).toContain(path);
    }
  });

  it("падает с non-zero кодом и печатает FAIL на недоступном адресе", async () => {
    const run = await runSmoke(["http://127.0.0.1:1"]);

    expect(run.code).not.toBe(0);
    expect(run.output).toContain("FAIL");
  });

  it("печатает номер попытки и повторяет проверку при SMOKE_RETRIES > 1", async () => {
    const run = await runSmoke(["http://127.0.0.1:1"], {
      SMOKE_RETRIES: "2",
      SMOKE_RETRY_DELAY: "0",
    });

    expect(run.code).not.toBe(0);
    expect(run.output).toContain("attempt 1/2");
    expect(run.output).toContain("attempt 2/2");
  });

  it("непустой /meeting-types — WARNING, а не падение", async () => {
    // Отдельный инстанс с одним типом встречи: на инстансе с данными
    // непустой массив — норма, smoke падать не должен.
    const seeded = await buildApp({ staticRoot });
    await seeded.inject({
      method: "POST",
      url: "/meeting-types",
      payload: { name: "Sync", description: "30 минут", durationMinutes: 30 },
    });
    await seeded.listen({ port: 0, host: "127.0.0.1" });
    const address = seeded.server.address();
    if (address === null || typeof address === "string") {
      throw new Error("не удалось получить адрес поднятого приложения");
    }

    const run = await runSmoke([`http://127.0.0.1:${address.port}`]);
    await seeded.close();

    expect(run.code, run.output).toBe(0);
    expect(run.output).toContain("WARNING");
    expect(run.output).not.toContain("FAIL");
  });
});

describe("валидация числовых env-переменных", () => {
  const cases = [
    { name: "SMOKE_RETRIES", value: "abc" },
    { name: "SMOKE_RETRY_DELAY", value: "abc" },
    { name: "SMOKE_CURL_TIMEOUT", value: "abc" },
  ];

  for (const { name, value } of cases) {
    it(`невалидный ${name} → понятное сообщение, non-zero exit и итоговый FAIL`, async () => {
      const run = await runSmoke([liveBaseUrl], { [name]: value });

      expect(run.code, run.output).not.toBe(0);
      // Имя переменной в сообщении — чтобы было понятно, что именно не так.
      expect(run.output).toContain(name);
      // Итоговая строка-сводка, а не тихий обрыв на середине скрипта.
      expect(run.output).toContain("❌ FAIL:");
    });

    it(`невалидный ${name} отсекается до retry-цикла`, async () => {
      const run = await runSmoke([liveBaseUrl], { [name]: value });

      // Ни одной попытки проверки: валидация обязана быть ДО цикла, иначе
      // скрипт сначала пять раз повторит упавший запрос, а потом умрёт.
      expect(run.output).not.toContain("attempt 1/");
    });
  }

  it("валидные значения принимаются (граница: 0, 1 и большие числа)", async () => {
    const run = await runSmoke([liveBaseUrl], {
      SMOKE_RETRIES: "1",
      SMOKE_RETRY_DELAY: "0",
      SMOKE_CURL_TIMEOUT: "30",
    });

    expect(run.code, run.output).toBe(0);
    expect(run.output).toContain("PASS");
  });
});

describe("default-URL выводится из манифеста окружения", () => {
  it("в скрипте нет захардкоженного публичного адреса", () => {
    const source = readFileSync(SCRIPT_PATH, "utf8");

    // Ни одного доменного литерала: адрес приходит только из манифеста
    // окружения (`.railway/production.json`) или из аргумента командной строки.
    expect(source).not.toMatch(/[a-z0-9-]+\.up\.railway\.app/);
    expect(source).not.toContain("booking.example.com");
    expect(source).not.toContain("fly.dev");
  });

  it("скрипт читает адрес из манифеста окружения", () => {
    const source = readFileSync(SCRIPT_PATH, "utf8");

    expect(source).toContain(".railway/production.json");
    expect(source).toContain("publicUrl");
  });

  it("без аргумента печатает URL из поля `publicUrl` манифеста", async () => {
    // Stub `curl` в PATH: сетевых обращений не происходит, скрипт только
    // печатает разрешённый base URL и затем падает на недоступном хосте.
    const stubDir = mkdtempSync(join(tmpdir(), "production-smoke-stub-"));
    const stubPath = join(stubDir, "curl");
    writeFileSync(stubPath, "#!/usr/bin/env bash\nexit 7\n", "utf8");
    chmodSync(stubPath, 0o755);

    const run = await runSmoke([], { PATH: `${stubDir}:${process.env.PATH ?? ""}` });

    expect(run.output).toContain(readCanonicalUrl());
  });

  it("без аргумента и без манифеста — понятная ошибка, non-zero exit", async () => {
    // Скрипт обязан деградировать явно, а не молча проверять неверный адрес.
    const emptyRepo = mkdtempSync(join(tmpdir(), "production-smoke-no-manifest-"));
    // Копируем только скрипт: манифеста рядом не будет.
    const scriptCopy = join(emptyRepo, "production-smoke.sh");
    writeFileSync(scriptCopy, readFileSync(SCRIPT_PATH, "utf8"), "utf8");
    chmodSync(scriptCopy, 0o755);

    const run = await new Promise<SmokeRun>((resolve, reject) => {
      const child = spawn(scriptCopy, [], {
        env: { ...process.env, SMOKE_RETRIES: "1", SMOKE_RETRY_DELAY: "0" },
      });
      let output = "";
      child.stdout.on("data", (chunk: Buffer) => {
        output += chunk.toString();
      });
      child.stderr.on("data", (chunk: Buffer) => {
        output += chunk.toString();
      });
      child.on("error", reject);
      child.on("close", (code) => resolve({ code, output }));
    });

    expect(run.code, run.output).not.toBe(0);
    expect(run.output).toContain("production.json");
  });
});
