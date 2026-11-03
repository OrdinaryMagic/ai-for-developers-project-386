import { test, expect, request as pwRequest } from "@playwright/test";

/**
 * C1 / Wave C — карта #26: сквозной happy-path сценарий гостя
 * (тикет #34, см. также README → «UI / E2E»).
 *
 * Проверяет требование R3 из GLOSSARY (см. `GLOSSARY.md` → Guest flow):
 *   1) гость открывает `/`;
 *   2) выбирает тип встречи;
 *   3) выбирает свободный слот в окне бронирования;
 *   4) заполняет имя/email и сабмитит форму;
 *   5) видит success-экран с UUID.
 *
 * Стратегия времени: сервер использует «реальные часы» (`DateTime.now()` в TZ
 * владельца). Под Vite proxy `/api/*` цепляется к e2e-бэкенду (порт E2E_API_PORT
 * = 3030 по умолчанию), который стартует свежим в `playwright.config.ts`
 * через `webServer` — состояние in-memory пустое при заходе теста, поэтому
 * один тип встречи seed'ится через прямой POST в бэкенд (ничего не мокается:
 * это тот же HTTP-эндпоинт, который дёргает UI). Параметры совпадают с
 * дефолтами `OwnerConfig`: `slotStepMinutes=30`, `windowDays=14`,
 * `workingHours=09:00–18:00 Europe/Moscow`.
 *
 * Тест не использует `page.route`, `routeFromHAR` или любые подмены трафика —
 * ровно как требует acceptance-критерий тикета.
 */

const API_PORT = Number(process.env.E2E_API_PORT ?? 3030);
const API_BASE = `http://127.0.0.1:${API_PORT}`;

// Жизнь спека короткая: завести тип встречи, открыть `/`, пройти форму,
// увидеть UUID. `timeout` спека удерживаем 60с — Vite на холодном старте
// поднимается несколько секунд.
test("guest happy path: select meeting type, pick slot, submit, see success UUID", async ({
  page,
}) => {
  test.setTimeout(60_000);

  // Seed: создать один тип встречи напрямую в бэкенд. Браузер тут не
  // нужен — это эквивалент того, что owner сделал бы через `/admin/event-types`,
  // просто без раскрытия всех testid'ов owner-формы в публичном e2e.
  const api = await pwRequest.newContext({ baseURL: API_BASE });
  const create = await api.post("/meeting-types", {
    data: {
      name: "Тестовая консультация",
      description: "Автотестовый слот для happy-path.",
      durationMinutes: 30,
    },
  });
  expect(create.status(), "seed POST /api/meeting-types").toBe(200);

  await page.goto("/");
  await expect(page.getByTestId("home-page")).toBeVisible();

  // На главной ждём появления хотя бы одной карточки типа встречи.
  // Если `home-empty` остаётся — seed'а не было.
  await expect(page.getByTestId("meeting-types-list")).toBeVisible({ timeout: 10_000 });
  const card = page.getByTestId(/^meeting-type-card-/).first();
  await expect(card).toBeVisible();
  await card.click();

  // После клика должны попасть на /book/:id с сеткой слотов.
  await expect(page).toHaveURL(/\/book\//);
  await expect(page.getByTestId("book-page")).toBeVisible();
  await expect(page.getByTestId("book-grid")).toBeVisible({ timeout: 10_000 });

  // Свободные слоты — это `slot-{iso-datetime}`; первый видимый берём.
  // Окно «14 дней от сейчас» гарантирует, что в любой текущий момент хотя
  // бы дневной слот 09:00 владельца-TZ свободен.
  const slot = page.getByTestId(/^slot-/).first();
  await expect(slot).toBeVisible({ timeout: 10_000 });
  await slot.click();

  // После клика по слоту ожидаем увидеть форму гостя (B4-тест).
  // Сама форма ответственна за B4; здесь — только проверка контракта
  // через data-testid'ы, заявленные в спецификации Wave B / C.
  await expect(page.getByTestId("booking-form")).toBeVisible({ timeout: 10_000 });

  await page.getByTestId("booking-name").fill("Иван Иванов");
  await page.getByTestId("booking-email").fill("ivan@example.com");
  await page.getByTestId("booking-submit").click();

  // Success-экран должен показать UUID созданного `Booking`.
  await expect(page.getByTestId("booking-success")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId("booking-success-uuid")).toContainText(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  );
  await expect(page.getByTestId("booking-success-meeting-type-name")).toContainText(/\S+/);
});
