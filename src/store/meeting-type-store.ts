import { randomUUID } from "node:crypto";
import type { MeetingType } from "../types.js";

/**
 * In-memory хранилище типов встреч: CRUD над `MeetingType`. Держит записи в
 * порядке создания (через `Map`), что даёт стабильный порядок в `list()`.
 *
 * Валидация входных полей делегирована Fastify-schema на уровне маршрутов.
 * Этот класс предполагает уже-валидированный вход — он отвечает только за
 * присвоение UUID и хранение. Если позже появится вызов из «обходящих» мест
 * (фоновые задачи, миграции), валидацию логики стоит вернуть сюда.
 */
export class MeetingTypeStore {
  private readonly map = new Map<string, MeetingType>();

  /**
   * Шаг слотов в минутах. Нужен как минимум для семантической связки (например,
   * чтобы будущие проверки консистентности могли опираться на это значение),
   * но сам store никаких ограничений на `durationMinutes` сейчас не накладывает.
   */
  constructor(public readonly slotStepMinutes: number) {}

  create(input: Omit<MeetingType, "id">): MeetingType {
    const mt: MeetingType = { id: randomUUID(), ...input };
    this.map.set(mt.id, mt);
    return mt;
  }

  list(): MeetingType[] {
    return Array.from(this.map.values());
  }

  getById(id: string): MeetingType | undefined {
    return this.map.get(id);
  }
}
