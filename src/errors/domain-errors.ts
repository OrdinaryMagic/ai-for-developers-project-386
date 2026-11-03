/**
 * Стабильные строковые коды доменных ошибок v1 (см. `spec/models/errors.tsp`).
 * Клиентский SDK разбирает их напрямую, без парсинга `message`.
 */
export type DomainErrorCode =
  | "MEETING_TYPE_NOT_FOUND"
  | "OUTSIDE_WORKING_HOURS"
  | "OUTSIDE_WINDOW"
  | "MISMATCH_STEP"
  | "SLOT_TAKEN"
  | "INVALID_DURATION";

/**
 * Тело ответа с доменной ошибкой. Соответствует схеме `DomainError` в `openapi.yaml`.
 *
 * `statusCode` дублирует HTTP-код ответа (для SDK, которые читают только body)
 * и должен соответствовать HTTP-статусу, выставленному сервером на этом запросе.
 */
export interface DomainErrorBody {
  statusCode: number;
  code: DomainErrorCode;
  message: string;
}

const DEFINITIONS = {
  MEETING_TYPE_NOT_FOUND: {
    statusCode: 404,
    defaultMessage: "Запрашиваемый тип встречи не найден.",
  },
  OUTSIDE_WORKING_HOURS: {
    statusCode: 422,
    defaultMessage: "Запрашиваемый старт не попадает в рабочие часы владельца.",
  },
  OUTSIDE_WINDOW: {
    statusCode: 422,
    defaultMessage: "Запрашиваемый старт вне 14-дневного окна бронирования.",
  },
  MISMATCH_STEP: {
    statusCode: 422,
    defaultMessage: "Запрашиваемый старт не выровнен по шагу слотов.",
  },
  SLOT_TAKEN: {
    statusCode: 409,
    defaultMessage: "Слот уже занят другим (или тем же) бронированием.",
  },
  INVALID_DURATION: {
    statusCode: 422,
    defaultMessage: "Длительность встречи должна быть кратна шагу слотов.",
  },
} satisfies Record<DomainErrorCode, { statusCode: number; defaultMessage: string }>;

/**
 * Создаёт {@link DomainErrorBody} для заданного кода. Необязательный второй
 * аргумент позволяет переопределить человекочитаемое `message` (например,
 * чтобы вставить конкретный `meetingTypeId` в описание).
 *
 * `statusCode` берётся из словаря и согласован с HTTP-кодом, который сервер
 * обязан выставить на запросе (см. `src/routes/*`).
 */
export function makeDomainError(code: DomainErrorCode, messageOverride?: string): DomainErrorBody {
  const def = DEFINITIONS[code];
  return {
    statusCode: def.statusCode,
    code,
    message: messageOverride ?? def.defaultMessage,
  };
}
