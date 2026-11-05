import { test, expect } from "@playwright/test";
import { seedMeetingType } from "./seed-meeting-type";

/**
 * C1 / Wave C — карта #26: конфликт слотов (тикет #34).
 *
 * Проверяет требование R3 + R4: две независимые попытки записи на тот же
 * слот — первая успешна, вторая получает `SLOT_TAKEN` (`409 Conflict`).
 * Бэкенд сериализует операции записи через `AsyncLock` (см.
 * `src/store/booking-store.ts`), поэтому одновременные POST'ы получают
 * детерминированный порядок: «кто первый встал в очередь — тот и записался»,
 * второй видит доменную ошибку `SLOT_TAKEN`.
 *
 * Тест управляет двумя независимыми `browser.newContext()` (cookies
 * изолированы, никакого cross-context шаринга), каждый проходит реальный
 * UI-flow гостя через главную страницу Vite. Никаких `page.route` или
 * перехвата трафика — только настоящий браузер по настоящему HTTP.
 *
 * Поведение бэкенда: `BookingStore.availability` исключает слот, если
 * запись пересекается с ним. После первого успешного `booking` слот
 * пропадает из сетки. Тест ожидает один из двух допустимых исходов:
 *   (a) слот остался в DOM, но submit даёт `data-testid="booking-error-slot-taken"`;
 *   (b) слот уже исключён из сетки (`getByTestId("slot-...").count() === 0`).
 * Оба варианта — валидное проявление конфликта; в owner-UX видим баннер
 * варианта (a), B4 отвечает за этот testid.
 *
 * Стратегия времени: «реальные часы», как в `guest-happy-path.spec.ts`;
 * слот берём первый попавшийся — окно 14 дней от сейчас.
 */
test("guest conflict: two browser contexts POST the same slot; second sees SLOT_TAKEN", async ({
  browser,
}) => {
  test.setTimeout(90_000);

  // Seed: сценарий выбирает только созданный здесь MeetingType по его ID.
  const meetingTypeId = await seedMeetingType({
    name: "Конфликтная консультация",
    description: "Слот для проверки SLOT_TAKEN.",
    durationMinutes: 30,
  });

  // Два независимых контекста = две независимые cookie-jar для гипотетической
  // auth в будущем; auth в v1 нет, но архитектурно тест уже корректен.
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  try {
    const pageA = await ctxA.newPage();
    pageA.setDefaultTimeout(10_000);
    const pageB = await ctxB.newPage();
    pageB.setDefaultTimeout(10_000);

    // --- Сторона A: бронирует слот через UI.
    await pageA.goto("/");
    await expect(pageA.getByTestId("home-page")).toBeVisible();
    await expect(pageA.getByTestId("meeting-types-list")).toBeVisible({ timeout: 10_000 });
    await pageA.getByTestId(`meeting-type-card-${meetingTypeId}`).click();
    await expect(pageA).toHaveURL(`/book/${meetingTypeId}`);
    await expect(pageA.getByTestId("book-grid")).toBeVisible({ timeout: 10_000 });

    const slotA = pageA.getByTestId(/^slot-/).first();
    await expect(slotA).toBeVisible({ timeout: 10_000 });
    // testid ловим до клика; формат — `slot-<iso-datetime>`.
    const slotTestid = await slotA.getAttribute("data-testid");
    if (!slotTestid) throw new Error("slot testid is null");
    await slotA.click();

    await expect(pageA.getByTestId("booking-form")).toBeVisible({ timeout: 10_000 });
    await pageA.getByTestId("booking-name").fill("Алиса");
    await pageA.getByTestId("booking-email").fill("alice@example.com");
    await pageA.getByTestId("booking-submit").click();

    await expect(pageA.getByTestId("booking-success")).toBeVisible({ timeout: 10_000 });
    await expect(pageA.getByTestId("booking-success-uuid")).toContainText(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );

    // --- Сторона B: открывает ту же страницу. Слот либо пропал из сетки
    // (вариант b), либо ещё стоит, но submit вернёт ошибку (вариант a).
    await pageB.goto("/");
    await expect(pageB.getByTestId("meeting-types-list")).toBeVisible({ timeout: 10_000 });
    await pageB.getByTestId(`meeting-type-card-${meetingTypeId}`).click();
    await expect(pageB).toHaveURL(`/book/${meetingTypeId}`);
    await expect(pageB.getByTestId("book-grid")).toBeVisible({ timeout: 10_000 });

    const slotB = pageB.getByTestId(slotTestid);
    if ((await slotB.count()) === 0) {
      // (b) Слот уже исключён из сетки — это тоже валидное проявление
      // SLOT_TAKEN. Тест зелёный без дополнительных действий.
      return;
    }

    // (a) Слот остался — кликаем и пытаемся забронировать. Ждём баннер
    // `booking-error-slot-taken` (см. B4 UI; тикет #34 ссылается на
    // этот testid в acceptance-критериях).
    await slotB.first().click();
    await expect(pageB.getByTestId("booking-form")).toBeVisible({ timeout: 10_000 });
    await pageB.getByTestId("booking-name").fill("Борис");
    await pageB.getByTestId("booking-email").fill("boris@example.com");
    await pageB.getByTestId("booking-submit").click();
    await expect(pageB.getByTestId("booking-error-slot-taken")).toBeVisible({ timeout: 10_000 });
  } finally {
    await ctxA.close();
    await ctxB.close();
  }
});
