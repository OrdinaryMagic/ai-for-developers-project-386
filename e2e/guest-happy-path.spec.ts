import { test, expect } from "@playwright/test";
import { seedMeetingType } from "./seed-meeting-type";
import { selectBookingSlot } from "./select-booking-slot";

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
 * через `webServer`. Каждый spec seed'ит свой MeetingType через прямой POST
 * и выбирает его по ID (ничего не мокается: это тот же HTTP-эндпоинт, который
 * дёргает UI), поэтому порядок specs и retries не зависят от пустого store.
 * Параметры совпадают с дефолтами `OwnerConfig`: `slotStepMinutes=30`,
 * `windowDays=14`, `workingHours=09:00–18:00 Europe/Moscow`.
 *
 * Тест не использует `page.route`, `routeFromHAR` или любые подмены трафика —
 * ровно как требует acceptance-критерий тикета.
 */

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
  const meetingTypeId = await seedMeetingType({
    name: "Тестовая консультация",
    description: "Автотестовый слот для happy-path.",
    durationMinutes: 30,
  });

  await page.goto("/");
  await expect(page.getByTestId("home-page")).toBeVisible();

  // На главной ждём карточку именно созданного MeetingType, а не первую
  // по порядку: в store уже могут быть seed'ы другого spec или retry.
  await expect(page.getByTestId("meeting-types-list")).toBeVisible({ timeout: 10_000 });
  const card = page.getByTestId(`meeting-type-card-${meetingTypeId}`);
  await expect(card).toBeVisible();
  await card.click();

  // После клика должны попасть на страницу именно seed MeetingType.
  await expect(page).toHaveURL(`/book/${meetingTypeId}`);
  await expect(page.getByTestId("book-page")).toBeVisible();
  await expect(page.getByTestId("book-grid")).toBeVisible({ timeout: 10_000 });

  // Явный master-detail выбор дня и времени вынесен в общий guest-flow helper.
  const { startsAt } = await selectBookingSlot(page);

  // Проверяем человекочитаемое представление выбранного слота без ISO-строки.
  const selectedSlot = page.getByTestId("booking-prefilled-slot");
  await expect(selectedSlot).toContainText("Тестовая консультация ·");
  await expect(selectedSlot).toContainText(
    /[а-я]+, \d{1,2} [а-я]+ \d{4} · \d{2}:\d{2}–\d{2}:\d{2}/,
  );
  await expect(selectedSlot).not.toContainText(startsAt);
  await expect(page.getByTestId("booking-prefilled-slot-iso")).not.toBeVisible();
  const selectedSummary = await selectedSlot.innerText();

  await page.getByTestId("booking-name").fill("Иван Иванов");
  await page.getByTestId("booking-email").fill("ivan@example.com");
  await page.getByTestId("booking-submit").click();

  // Success-экран должен показать UUID созданного `Booking`.
  await expect(page.getByTestId("booking-success")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId("booking-success-uuid")).toContainText(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  );
  await expect(page.getByTestId("booking-success-meeting-type-name")).toContainText(/\S+/);
  await expect(page.getByTestId("booking-success-summary")).toHaveText(selectedSummary);
  await expect(page.getByTestId("booking-success")).not.toContainText(startsAt);
});
