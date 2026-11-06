import { parseHHMM } from "../time/working-hours.js";

/**
 * Конфигурация владельца, отдаваемая через `GET /config` и используемая
 * всеми зависимыми слоями (time-domain, BookingStore, роуты). Совпадает
 * со схемой `Configuration` в `openapi.yaml` (см. `spec/models/configuration.tsp`).
 *
 * `workingHours.start` и `.end` хранятся в виде строк `HH:MM` — это форма,
 * в которой их видит клиент; перевод в минуты происходит на границе
 * time-domain через `parseHHMM`.
 */
export interface OwnerConfig {
  owner: { name: string; timezone: string };
  windowDays: number;
  slotStepMinutes: number;
  workingDays: number[];
  workingHours: { start: string; end: string };
}

/**
 * Окружение, из которого читается конфигурация. По умолчанию — `process.env`,
 * но в тестах можно подсунуть словарь без сайд-эффектов на глобальный процесс.
 */
export type EnvSource = Readonly<Record<string, string | undefined>>;

const DEFAULTS = {
  name: "Demo Owner",
  timezone: "Europe/Moscow",
  windowDays: 14,
  slotStepMinutes: 30,
  workingDays: [1, 2, 3, 4, 5],
  workingHoursStart: "09:00",
  workingHoursEnd: "18:00",
} as const;

function parsePositiveInt(name: string, raw: string | undefined, fallback: number): number {
  const candidate = raw ?? String(fallback);
  const n = Number.parseInt(candidate, 10);
  if (!Number.isInteger(n) || n <= 0 || String(n) !== candidate.trim()) {
    throw new Error(`OWNER_${name} must be a positive integer; got "${raw}"`);
  }
  return n;
}

function parseWorkingDays(raw: string | undefined): number[] {
  if (raw === undefined) return [...DEFAULTS.workingDays];

  const items = raw.split(",").map((item) => item.trim());
  if (items.some((item) => !/^[1-7]$/.test(item))) {
    throw new Error(
      `OWNER_WORKING_DAYS must be a non-empty comma-separated list of ISO weekdays 1-7 without missing items; got "${raw}"`,
    );
  }

  const days = items.map(Number);
  if (new Set(days).size !== days.length) {
    throw new Error(`OWNER_WORKING_DAYS must not contain duplicate ISO weekdays; got "${raw}"`);
  }
  return days;
}

/**
 * Читает и валидирует конфигурацию владельца из переданного источника (по
 * умолчанию `process.env`). Бросает, если значения некорректны (формат
 * `HH:MM`, неизвестная TZ, не-положительные числа).
 *
 * Значения по умолчанию — из Configuration (см. GLOSSARY.md): (`name=Demo Owner`,
 * `timezone=Europe/Moscow`, `windowDays=14`, `slotStepMinutes=30`,
 * `workingDays=1,2,3,4,5`, `workingHours=09:00–18:00`).
 */
export function loadOwnerConfig(env: EnvSource = process.env): OwnerConfig {
  const name = env.OWNER_NAME?.trim() || DEFAULTS.name;
  const timezone = env.OWNER_TIMEZONE?.trim() || DEFAULTS.timezone;

  // Валидация часового пояса: Intl.DateTimeFormat бросает, если TZ неизвестна.
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).resolvedOptions();
  } catch {
    throw new Error(`OWNER_TIMEZONE "${timezone}" is not a valid IANA timezone`);
  }

  const windowDays = parsePositiveInt("WINDOW_DAYS", env.OWNER_WINDOW_DAYS, DEFAULTS.windowDays);
  const slotStepMinutes = parsePositiveInt(
    "SLOT_STEP_MINUTES",
    env.OWNER_SLOT_STEP_MINUTES,
    DEFAULTS.slotStepMinutes,
  );

  const start = env.OWNER_WORKING_HOURS_START?.trim() || DEFAULTS.workingHoursStart;
  const end = env.OWNER_WORKING_HOURS_END?.trim() || DEFAULTS.workingHoursEnd;

  // parseHHMM бросает на некорректном формате.
  const startMin = parseHHMM(start);
  const endMin = parseHHMM(end);
  if (endMin <= startMin) {
    throw new Error(
      `OWNER_WORKING_HOURS_END (${end}) must be strictly greater than OWNER_WORKING_HOURS_START (${start})`,
    );
  }

  return {
    owner: { name, timezone },
    windowDays,
    slotStepMinutes,
    workingDays: parseWorkingDays(env.OWNER_WORKING_DAYS),
    workingHours: { start, end },
  };
}
