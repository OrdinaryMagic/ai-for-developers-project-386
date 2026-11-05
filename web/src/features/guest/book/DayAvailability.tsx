import { Badge } from "@/components/ui/badge";
import type { AvailabilityDay } from "@/features/guest/api";
import { SlotButton } from "@/features/guest/book/SlotButton";
import { useOwnerTimezone } from "@/features/owner/bookings/OwnerTimezoneContext";
import { formatDay } from "@/lib/dateTime";

export interface DayAvailabilityProps {
  day: AvailabilityDay;
  /**
   * Колбэк для каждого `SlotButton` — пробрасывается из {@link BookPage}
   * (см. commit body #33: выбор слота держится локальным state).
   */
  onSlotClick?: (startsAt: string) => void;
}

export function DayAvailability({ day, onSlotClick }: DayAvailabilityProps) {
  const { timezone } = useOwnerTimezone();
  const slots = day.slots.slice(0, 18);
  const slotsCount = slots.length;
  return (
    <section
      data-testid={`day-${day.date}`}
      className="rounded-md border bg-card text-card-foreground p-4"
    >
      <header className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium">{formatDay(day.date, timezone)}</h3>
        <Badge variant="secondary" data-testid={`day-${day.date}-count`}>
          {slotsCount}
        </Badge>
      </header>

      {slotsCount === 0 ? (
        <p data-testid="day-empty" className="text-sm text-muted-foreground">
          Нет свободных слотов.
        </p>
      ) : (
        <div data-testid="day-slots" className="flex flex-wrap gap-2">
          {slots.map((startsAt) => (
            <SlotButton
              key={startsAt}
              startsAt={startsAt}
              onClick={onSlotClick ? () => onSlotClick(startsAt) : undefined}
            />
          ))}
        </div>
      )}
    </section>
  );
}
