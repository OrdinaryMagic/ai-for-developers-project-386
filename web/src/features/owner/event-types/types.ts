/**
 * Локальные типы для страницы `EventTypesPage`. Любые API-shape — только
 * через `web/src/api/sdk.ts`; здесь — пропсы компонентов и UI-state
 * (правило #10: не дублируем API типы).
 */

import type { DomainErrorCode } from "./api.js";

/**
 * Состояние загрузки списка. `items` отдельно в родителе, чтобы не
 * дублировать массив и иметь один источник истины; этот тип хранит
 * только фазу lifecycle и текст ошибки (для блока retry).
 */
export type ListState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "loaded" }
  | { kind: "error"; message: string };

/** Состояние сабмита формы (для баннера «retry»). */
export type SubmitState =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "network-error"; message: string };

/** Дискриминатор для UI-сообщений по `DomainError.code`. */
export type ErrorKind = "field" | "banner" | "ignored";

/** Поля формы создания. */
export interface EventTypeFormValues {
  name: string;
  description: string;
  durationMinutes: number;
}

/**
 * Маппинг `DomainErrorCode → UI-стратегия`. Полей, на которые бэкенд
 * привязывает ошибку в контексте `POST /meeting-types`, одно —
 * `INVALID_DURATION` → `durationMinutes`. Остальные коды идут в банер.
 *
 * `MEETING_TYPE_NOT_FOUND` специфичен для `GET /meeting-types/:id`
 * (404), на создание он не приходит — для формы показываем banner как
 * «непредвиденный ответ».
 */
export interface ErrorRouting {
  kind: ErrorKind;
  field?: keyof EventTypeFormValues;
  message: string;
}

export const DOMAIN_ERROR_MESSAGES: Readonly<Record<DomainErrorCode, string>> = {
  INVALID_DURATION: "Длительность должна быть кратна шагу 30 минут (значение от 1 до 1440).",
  MEETING_TYPE_NOT_FOUND: "Тип встречи не найден.",
  OUTSIDE_WORKING_HOURS: "Слот вне рабочих часов владельца.",
  OUTSIDE_WINDOW: "Слот вне 14-дневного окна бронирования.",
  MISMATCH_STEP: "Старт слота не выровнен по шагу сетки.",
  SLOT_TAKEN: "Слот уже занят.",
};
