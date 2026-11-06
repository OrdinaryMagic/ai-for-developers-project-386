import { Button } from "@/components/ui/button";
import { formatTime } from "@/lib/dateTime";
import { useOwnerTimezone } from "@/features/owner/bookings/OwnerTimezoneContext";

export interface SlotButtonProps {
  startsAt: string;
  /**
   * Колбэк при клике. Если не передан — кнопка остаётся декоративной
   * (используется до подключения guest-flow в #33).
   */
  onClick?: () => void;
}

export function SlotButton({ startsAt, onClick }: SlotButtonProps) {
  const { timezone } = useOwnerTimezone();
  return (
    <Button
      type="button"
      variant="outline"
      data-testid={`slot-${startsAt}`}
      className="justify-center"
      onClick={onClick}
    >
      {formatTime(startsAt, timezone)}
    </Button>
  );
}
