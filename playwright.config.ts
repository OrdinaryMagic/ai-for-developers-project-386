import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config для е2е Wave C карты #26 (тикет #34).
 *
 * Тесты обходят настоящий Fastify-стек: никаких `page.route` / `routeFromHAR`
 * для `/api/*` — только реальный HTTP через Vite proxy.
 *
 * `webServer` поднимает два процесса:
 *   1. Fastify backend на `E2E_API_PORT` (по умолчанию 3030). Сначала
 *      `npm run build --silent` (кладёт `dist/server.js`), затем
 *      `node dist/server.js` с пробросом `PORT`/`HOST`. Порт 3030 не
 *      пересекается с dev-сервером на 3000 и UI Vite на 5173.
 *   2. Vite dev-frontend на 5173 с `VITE_API_TARGET=http://127.0.0.1:3030`,
 *      чтобы proxy `/api/*` ходил в e2e-бэкенд, а не в 3000-й dev.
 *
 * По умолчанию каждый прогон стартует и останавливает собственные процессы.
 * Переиспользование уже запущенных серверов доступно только через явный ручной
 * `npm run test:e2e:reuse`; canonical `make check` всегда использует strict mode.
 */

const HOST = "127.0.0.1";
const API_PORT = Number(process.env.E2E_API_PORT ?? 3030);
const WEB_PORT = 5173;
const WEB_URL = `http://${HOST}:${WEB_PORT}`;

const isCI = !!process.env.CI;
const reuseExistingServer = process.env.E2E_REUSE_EXISTING_SERVER === "1";

export default defineConfig({
  testDir: "./e2e",
  // 30 секунд по умолчанию: e2e дороже unit-теста, но e2e-флоу (full
  // booking submit) длится несколько секунд. Стрейчим per-test при
  // необходимости через `test.setTimeout`.
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: isCI ? 2 : 0,
  workers: 1,
  reporter: isCI ? "line" : "list",
  use: {
    baseURL: WEB_URL,
    trace: "on-first-retry",
    headless: true,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: `npm run build --silent && PORT=${API_PORT} HOST=${HOST} node dist/server.js`,
      url: `http://${HOST}:${API_PORT}/health`,
      reuseExistingServer,
      timeout: 60_000,
      stdout: "ignore",
      stderr: "pipe",
    },
    {
      command: "npm --prefix web run dev",
      url: WEB_URL,
      reuseExistingServer,
      timeout: 60_000,
      env: {
        // Vite proxy `/api/*` ходит в e2e-бэкенд, не в 3000 dev.
        VITE_API_TARGET: `http://${HOST}:${API_PORT}`,
      },
      stdout: "ignore",
      stderr: "pipe",
    },
  ],
});
