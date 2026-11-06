import { test, expect } from "@playwright/test";
import { seedMeetingType } from "./seed-meeting-type";
import { selectBookingSlot } from "./select-booking-slot";

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
 * Оба контекста открывают availability и выбирают один день и один слот
 * до первого submit. Поэтому второй context сохраняет форму со stale slot
 * после успешной записи первого и обязан получить видимый `SLOT_TAKEN`.
 * Исчезновение слота из скрытой сетки не засчитывается как доказательство
 * конфликта.
 *
 * Стратегия времени: «реальные часы», как в `guest-happy-path.spec.ts`;
 * день и первый слот внутри него выбираются явно в обоих contexts.
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

    // --- Сторона A: явно выбирает день и слот, но ждёт B до submit.
    await pageA.goto("/");
    await expect(pageA.getByTestId("home-page")).toBeVisible();
    await expect(pageA.getByTestId("meeting-types-list")).toBeVisible({ timeout: 10_000 });
    await pageA.getByTestId(`meeting-type-card-${meetingTypeId}`).click();
    await expect(pageA).toHaveURL(`/book/${meetingTypeId}`);
    await expect(pageA.getByTestId("book-grid")).toBeVisible({ timeout: 10_000 });

    const selection = await selectBookingSlot(pageA);
    await pageA.getByTestId("booking-name").fill("Алиса");
    await pageA.getByTestId("booking-email").fill("alice@example.com");

    // --- Сторона B: до записи A выбирает тот же день и тот же слот.
    await pageB.goto("/");
    await expect(pageB.getByTestId("meeting-types-list")).toBeVisible({ timeout: 10_000 });
    await pageB.getByTestId(`meeting-type-card-${meetingTypeId}`).click();
    await expect(pageB).toHaveURL(`/book/${meetingTypeId}`);
    await expect(pageB.getByTestId("book-grid")).toBeVisible({ timeout: 10_000 });

    await selectBookingSlot(pageB, selection);
    await pageB.getByTestId("booking-name").fill("Борис");
    await pageB.getByTestId("booking-email").fill("boris@example.com");

    // --- A создаёт Booking, затем stale-форма B получает реальный 409.
    await pageA.getByTestId("booking-submit").click();
    await expect(pageA.getByTestId("booking-success")).toBeVisible({ timeout: 10_000 });
    await expect(pageA.getByTestId("booking-success-uuid")).toContainText(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );

    await pageB.getByTestId("booking-submit").click();
    await expect(pageB.getByTestId("booking-error-slot-taken")).toBeVisible({ timeout: 10_000 });
  } finally {
    await ctxA.close();
    await ctxB.close();
  }
});
