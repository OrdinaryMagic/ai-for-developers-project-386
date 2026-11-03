import type { MeetingType } from "./api.js";

export interface EventTypesListProps {
  items: ReadonlyArray<MeetingType>;
}

/**
 * Список существующих типов встречи. Пустое состояние рисуется как
 * отдельный `data-testid="event-types-empty"` — нужно для e2e-селектора
 * и для component-теста.
 */
export function EventTypesList({ items }: EventTypesListProps) {
  if (items.length === 0) {
    return (
      <p data-testid="event-types-empty" className="text-sm text-muted-foreground">
        Пока нет типов встреч. Создайте первый через форму ниже.
      </p>
    );
  }

  return (
    <ul data-testid="event-types-list" className="space-y-2">
      {items.map((mt) => (
        <li
          key={mt.id}
          data-testid={`event-types-row-${mt.id}`}
          className="flex items-baseline justify-between rounded border border-input bg-card px-4 py-3"
        >
          <div className="flex flex-col">
            <span className="font-medium">{mt.name}</span>
            {mt.description !== "" && (
              <span className="text-sm text-muted-foreground">{mt.description}</span>
            )}
          </div>
          <span className="text-sm tabular-nums text-muted-foreground">
            {mt.durationMinutes} мин
          </span>
        </li>
      ))}
    </ul>
  );
}
