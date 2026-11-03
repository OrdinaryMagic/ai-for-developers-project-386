import { Button } from "@/components/ui/button";

export function SlotButton({ startsAt }: { startsAt: string }) {
  const hh = startsAt.slice(11, 16);
  return (
    <Button
      type="button"
      variant="outline"
      data-testid={`slot-${startsAt}`}
      className="justify-center"
    >
      {hh}
    </Button>
  );
}
