import { expect, type Page } from "@playwright/test";

export type SelectedBookingSlot = {
  dayTestid: string;
  slotTestid: string;
  startsAt: string;
};

/**
 * Выбирает первый доступный день/слот либо повторяет переданный выбор в другом context.
 * Возвращает testid'ы и ISO-start, чтобы сценарий мог проверить форму и конфликт.
 */
export async function selectBookingSlot(
  page: Page,
  selection?: SelectedBookingSlot,
): Promise<SelectedBookingSlot> {
  const day = selection
    ? page.getByTestId(selection.dayTestid)
    : page.locator('[data-testid^="day-"][data-testid$="-button"]:enabled').first();
  await expect(day).toBeVisible({ timeout: 10_000 });
  await expect(day).toBeEnabled();
  const dayTestid = await day.getAttribute("data-testid");
  if (!dayTestid) throw new Error("day testid is null");
  const selectedDate = dayTestid.slice("day-".length, -"-button".length);
  await day.click();
  await expect(day).toHaveAttribute("aria-pressed", "true");

  const slot = selection
    ? page.getByTestId(selection.slotTestid)
    : page.getByTestId(/^slot-/).first();
  await expect(slot).toBeVisible({ timeout: 10_000 });
  await expect(slot).toHaveText(/^\d{2}:\d{2}$/);
  const slotTestid = await slot.getAttribute("data-testid");
  if (!slotTestid) throw new Error("slot testid is null");
  const startsAt = slotTestid.slice("slot-".length);
  expect(startsAt.startsWith(`${selectedDate}T`)).toBe(true);
  if (selection) expect({ dayTestid, slotTestid, startsAt }).toEqual(selection);
  await slot.click();

  await expect(page.getByTestId("booking-form")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId("booking-prefilled-slot-iso")).toHaveValue(startsAt);
  return { dayTestid, slotTestid, startsAt };
}
