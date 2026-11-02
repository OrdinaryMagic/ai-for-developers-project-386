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
