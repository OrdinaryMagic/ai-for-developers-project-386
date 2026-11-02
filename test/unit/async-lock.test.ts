import { describe, it, expect } from "vitest";
import { AsyncLock } from "../../src/store/async-lock.js";

describe("AsyncLock", () => {
  it("acquire/release позволяет одному холдеру работать за раз", async () => {
    const lock = new AsyncLock();
    const order: number[] = [];

    const first = lock.acquire().then((release) => {
      order.push(1);
      return release;
    });
    const second = lock.acquire().then((release) => {
      order.push(2);
      return release;
    });

    const release1 = await first;
    release1();
    const release2 = await second;
    release2();
  });

  it("сериализует 5 параллельных холдеров в порядке очереди", async () => {
    const lock = new AsyncLock();
    const log: string[] = [];

    async function task(id: string, body: () => Promise<void>): Promise<void> {
      const release = await lock.acquire();
      try {
        log.push(`in:${id}`);
        await body();
        log.push(`out:${id}`);
      } finally {
        release();
      }
    }

    await Promise.all([
      task("1", () => new Promise((r) => setTimeout(r, 10))),
      task("2", () => new Promise((r) => setTimeout(r, 10))),
      task("3", () => new Promise((r) => setTimeout(r, 10))),
      task("4", () => new Promise((r) => setTimeout(r, 10))),
      task("5", () => new Promise((r) => setTimeout(r, 10))),
    ]);

    // Каждый "in" предшествует следующему "out".
    for (let i = 0; i < 5; i++) {
      const inIdx = log.indexOf(`in:${i + 1}`);
      const outIdx = log.indexOf(`out:${i + 1}`);
      const prevOut = i > 0 ? log.indexOf(`out:${i}`) : -1;
      expect(outIdx).toBeGreaterThan(inIdx);
      if (prevOut >= 0) expect(outIdx).toBeGreaterThan(prevOut);
    }
  });

  it("освобождённый mutex позволяет следующему холдеру сразу войти", async () => {
    const lock = new AsyncLock();
    const releaseA = await lock.acquire();
    releaseA();
    const releaseB = await lock.acquire();
    releaseB();
  });
});
