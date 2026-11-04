import { buildApp } from "./app.js";

const app = await buildApp();

try {
  await app.listen({
    port: Number(process.env.PORT ?? 3000),
    host: process.env.HOST ?? "127.0.0.1",
  });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

/**
 * Graceful shutdown.
 *
 * Railway (как и любой оркестратор) шлёт `SIGTERM` контейнеру перед остановкой
 * и перед заменой реплики на rolling-деплое. Без обработчика Node завершается
 * немедленно, и in-flight запросы обрываются на полуслове. `app.close()`
 * дожидается завершения активных запросов и закрывает сервер штатно.
 *
 * Сторожевой таймер нужен на случай зависшего запроса: если за
 * `SHUTDOWN_TIMEOUT_MS` процесс не завершился — выходим принудительно, чтобы
 * деплой не висел бесконечно.
 */
const SHUTDOWN_TIMEOUT_MS = 10_000;

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, () => {
    app.log.info({ signal }, "shutdown signal received — closing gracefully");

    const timer = setTimeout(() => {
      app.log.error({ signal }, "graceful shutdown timed out — forcing exit");
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    timer.unref();

    app.close().then(
      () => {
        clearTimeout(timer);
        app.log.info("server closed");
        process.exit(0);
      },
      (err: unknown) => {
        clearTimeout(timer);
        app.log.error(err);
        process.exit(1);
      },
    );
  });
}
