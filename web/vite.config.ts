/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

/**
 * Vite proxy для `/api/*` указывает на Fastify-bakcend. По умолчанию — на
 * порт dev-сервера (3000), но e2e-тесты поднимают Fastify на отдельном
 * порту и подставляют свой target через env `VITE_API_TARGET` (см.
 * `playwright.config.ts` → `webServer[1].env`).
 */
const API_TARGET = process.env.VITE_API_TARGET ?? "http://127.0.0.1:3000";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: {
      "/api": {
        target: API_TARGET,
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    include: ["tests/**/*.test.tsx", "tests/**/*.test.ts", "src/**/*.test.tsx", "src/**/*.test.ts"],
    setupFiles: ["./tests/setup.ts"],
  },
});
