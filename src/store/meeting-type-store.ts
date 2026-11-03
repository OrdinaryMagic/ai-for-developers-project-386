import { randomUUID } from "node:crypto";
import type { MeetingType } from "../types.js";
import { makeDomainError, type DomainErrorBody } from "../errors/domain-errors.js";

/**
 * Минимальная конфигурация, нужная хранилищу. Принимаем ровно `slotStepMinutes`,
 * а не весь `OwnerConfig` — store не интересует tz, рабочие часы и окно,
 * только размер шага сетки для проверки кратности.
 */
export interface MeetingTypeStoreConfig {
  slotStepMinutes: number;
}

/**
 * Результат попытки создания `MeetingType`. Tagged union: либо созданный
 * тип, либо доменная ошибка. Сериализация в HTTP — задача маршрута.
 */
export type CreateOutcome =
  | { ok: true; value: MeetingType }
  | { ok: false; error: DomainErrorBody };

/**
 * In-memory хранилище типов встреч: CRUD над `MeetingType`. Держит записи в
 * порядке создания (через `Map`), что даёт стабильный порядок в `list()`.
 *
 * На границе `create` проверяется инвариант кратности `durationMinutes`
 * `slotStepMinutes` (см. словарь, термин «Step alignment»): значение,
 * не кратное шагу, отдаётся как `INVALID_DURATION` (HTTP 422). Границы
 * `[1, 1440]` ловятся Fastify-schema на уровне маршрута — здесь мы
 * полагаемся на то, что вход в этих пределах.
 */
export class MeetingTypeStore {
  private readonly map = new Map<string, MeetingType>();

  constructor(private readonly config: MeetingTypeStoreConfig) {}

  /**
   * Создаёт тип встречи и присваивает UUID. Если `durationMinutes` не
   * кратен `slotStepMinutes` — возвращает `INVALID_DURATION`-конверт
   * без побочного эффекта (запись в стор не делается).
   */
  create(input: Omit<MeetingType, "id">): CreateOutcome {
    if (input.durationMinutes % this.config.slotStepMinutes !== 0) {
      return {
        ok: false,
        error: makeDomainError(
          "INVALID_DURATION",
          `Длительность ${input.durationMinutes} мин не кратна шагу ${this.config.slotStepMinutes} мин.`,
        ),
      };
    }
    const mt: MeetingType = { id: randomUUID(), ...input };
    this.map.set(mt.id, mt);
    return { ok: true, value: mt };
  }

  list(): MeetingType[] {
    return Array.from(this.map.values());
  }

  getById(id: string): MeetingType | undefined {
    return this.map.get(id);
  }
}
