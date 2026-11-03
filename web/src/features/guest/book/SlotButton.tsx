import { Button } from "@/components/ui/button";

export interface SlotButtonProps {
  startsAt: string;
  /**
   * Колбэк при клике. Если не передан — кнопка остаётся декоративной
   * (используется до подключения guest-flow в #33).
   */
  onClick?: () => void;
}

export function SlotButton({ startsAt, onClick }: SlotButtonProps) {
  const hh = startsAt.slice(11, 16);
  return (
    <Button
      type="button"
      variant="outline"
      data-testid={`slot-${startsAt}`}
      className="justify-center"
      onClick={onClick}
    >
      {hh}
    </Button>
  );
}
