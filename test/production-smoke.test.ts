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
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { readTopLevelStringKey } from "./helpers/toml.js";

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SCRIPT_PATH = join(REPO_ROOT, "scripts", "production-smoke.sh");
const FLY_TOML_PATH = join(REPO_ROOT, "fly.toml");

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

/** Top-level ключ `app` из `fly.toml` — имя Fly-приложения. */
function readFlyApp(): string {
  return readTopLevelStringKey(readFileSync(FLY_TOML_PATH, "utf8"), "app") ?? "";
}

let app: FastifyInstance | null = null;
let liveBaseUrl = "";

beforeAll(async () => {
  app = await buildApp();
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
});

describe("контракт scripts/production-smoke.sh", () => {
  it("скрипт существует и исполняемый (бит X_OK)", () => {
    expect(() => accessSync(SCRIPT_PATH, constants.F_OK)).not.toThrow();
    expect(() => accessSync(SCRIPT_PATH, constants.X_OK)).not.toThrow();
  });

  it("в скрипте зафиксированы все четыре проверяемых пути", () => {
    const source = readFileSync(SCRIPT_PATH, "utf8");

    for (const path of ["/", "/health", "/config", "/meeting-types"]) {
      expect(source, `в скрипте нет пути ${path}`).toContain(`"${path}"`);
    }
  });
});

describe("smoke против живого приложения", () => {
  it("проходит с кодом 0 и печатает PASS", async () => {
    const run = await runSmoke([liveBaseUrl]);

    expect(run.code, run.output).toBe(0);
    expect(run.output).toContain("PASS");
    expect(run.output).not.toContain("FAIL");
  });

  it("проверяет все четыре эндпоинта", async () => {
    const run = await runSmoke([liveBaseUrl]);

    for (const path of ["/", "/health", "/config", "/meeting-types"]) {
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
    const seeded = await buildApp();
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

describe("default-URL выводится из fly.toml", () => {
  it("в скрипте нет захардкоженного публичного адреса", () => {
    const source = readFileSync(SCRIPT_PATH, "utf8");

    expect(source).not.toContain("booking-api.fly.dev");
    expect(source).not.toContain("booking.example.com");
  });

  it("без аргумента печатает URL, собранный из ключа `app` в fly.toml", async () => {
    // Stub `curl` в PATH: сетевых обращений не происходит, скрипт только
    // печатает разрешённый base URL и затем падает на недоступном хосте.
    const stubDir = mkdtempSync(join(tmpdir(), "production-smoke-stub-"));
    const stubPath = join(stubDir, "curl");
    writeFileSync(stubPath, "#!/usr/bin/env bash\nexit 7\n", "utf8");
    chmodSync(stubPath, 0o755);

    const run = await runSmoke([], { PATH: `${stubDir}:${process.env.PATH ?? ""}` });

    expect(run.output).toContain(`https://${readFlyApp()}.fly.dev`);
  });
});
