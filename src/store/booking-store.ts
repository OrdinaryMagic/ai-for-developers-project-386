import { randomUUID } from "node:crypto";
import { DateTime } from "luxon";
import type { Availability, AvailabilityDay, Booking } from "../types.js";
import type { OwnerConfig } from "../config/owner.js";
import { makeDomainError, type DomainErrorBody } from "../errors/domain-errors.js";
import { toStep } from "../time/align.js";
import { contains, parseHHMM, type WorkingHours } from "../time/working-hours.js";
import { boundsFor } from "../time/window.js";
import { AsyncLock } from "./async-lock.js";
import type { MeetingTypeStore } from "./meeting-type-store.js";

/**
 * Входные данные для `book`. Дополнительно принимаем `now` — точка отсчёта
 * для ролл-окна (см. GLOSSARY.md → Window). Это выводит «сейчас» из зависимости процесса и
 * делает store полностью тестируемым через фиксированные времена.
 */
export interface BookInput {
  meetingTypeId: string;
  /** ISO 8601 datetime интерпретируется в TZ владельца. */
  startsAt: string;
  guestName: string;
  guestEmail: string;
}

export type BookOutcome = { ok: true; booking: Booking } | { ok: false; error: DomainErrorBody };

/**
 * Один мьютекс на всё хранилище сериализует операции — и мутации, и
 * снимко-чтения. Все методы снаружи асинхронные (даже те, что внутри только
 * читают), чтобы конкуренция в Node.js между async-вызовами не приводила к
 * неконсистентным наблюдениям (т.е. array.push во время итерации в `some`).
 */
export class BookingStore {
  private readonly bookings: Booking[] = [];
  private readonly gate = new AsyncLock();

  constructor(
    private readonly meetingTypeStore: MeetingTypeStore,
    private readonly config: OwnerConfig,
  ) {}

  /**
   * Создаёт бронирование, если:
   * 1. `meetingTypeId` существует;
   * 2. `startsAt` корректный ISO и попадает в текущее окно;
   * 2a. `startsAt` — в будущем (слот, который уже начался, не бронируется);
   * 3. день входит в `workingDays`, а `[startsAt, startsAt + duration)` — в рабочие часы;
   * 4. `startsAt` выровнен по `slotStepMinutes`;
   * 5. нет уже сделанной записи, пересекающейся по интервалу (в том числе
   *    у другого `meetingTypeId`).
   *
   * Возврат — tagged union: либо `Booking` (200), либо `DomainErrorBody`,
   * уже с правильным `statusCode`. Сериализация в HTTP — задача route.
   */
  async book(input: BookInput, options: { now: DateTime }): Promise<BookOutcome> {
    const tz = this.config.owner.timezone;

    // (1) Тип встречи.
    const mt = this.meetingTypeStore.getById(input.meetingTypeId);
    if (!mt) {
      return {
        ok: false,
        error: makeDomainError(
          "MEETING_TYPE_NOT_FOUND",
          `Тип встречи ${input.meetingTypeId} не найден.`,
        ),
      };
    }

    // (2a) Парсинг ISO. Luxon `fromISO` возвращает DateTime c `isValid=false`,
    //     если строка битая — это наш единственный путь отличить «битый ввод»
    //     от «вышел за окно» без специальных регулярок.
    const startDt = DateTime.fromISO(input.startsAt, { zone: tz });
    if (!startDt.isValid) {
      return {
        ok: false,
        error: makeDomainError(
          "OUTSIDE_WINDOW",
          `Невалидный ISO 8601 timestamp: ${input.startsAt}`,
        ),
      };
    }
    const endDt = startDt.plus({ minutes: mt.durationMinutes });

    // (2b) Окно.
    const win = boundsFor(options.now, this.config.windowDays, tz);
    if (startDt < win.start || startDt >= win.end) {
      return { ok: false, error: makeDomainError("OUTSIDE_WINDOW") };
    }

    // (2c) Слот должен быть в будущем. Окно начинается с 00:00 текущего дня,
    //     поэтому «сегодняшние» слоты, которые уже начались, формально в окно
    //     попадают — но записаться на них нельзя: список владельца показывает
    //     только предстоящие бронирования (контракт `GET /bookings`), и такая
    //     запись была бы невидима. Раньше сетка отдавала эти слоты, гость мог
    //     на них записаться — и запись «терялась». Теперь правило одно: слот,
    //     который уже начался, не предлагается и не принимается.
    if (startDt.toMillis() <= options.now.toMillis()) {
      return {
        ok: false,
        error: makeDomainError("OUTSIDE_WINDOW", "Этот слот уже начался — выберите время позже."),
      };
    }

    // (3) Рабочий день определяется только после перевода timestamp в TZ владельца.
    if (!this.config.workingDays.includes(startDt.setZone(tz).weekday)) {
      return { ok: false, error: makeDomainError("OUTSIDE_WORKING_HOURS") };
    }

    //     Рабочие часы ограничивают интервал внутри рабочего дня.
    const wh: WorkingHours = {
      startMin: parseHHMM(this.config.workingHours.start),
      endMin: parseHHMM(this.config.workingHours.end),
    };
    if (!contains(startDt, mt.durationMinutes, wh)) {
      return { ok: false, error: makeDomainError("OUTSIDE_WORKING_HOURS") };
    }

    // (4) Шаг сетки.
    if (!toStep(startDt, this.config.slotStepMinutes).equals(startDt)) {
      return { ok: false, error: makeDomainError("MISMATCH_STEP") };
    }

    // (5) Под локом — пересечения с уже существующими записями.
    const release = await this.gate.acquire();
    try {
      const newStart = startDt.toMillis();
      const newEnd = endDt.toMillis();
      const conflict = this.bookings.some((b) => {
        const bs = DateTime.fromISO(b.startsAt).toMillis();
        const be = DateTime.fromISO(b.endsAt).toMillis();
        return newStart < be && bs < newEnd;
      });
      if (conflict) {
        return { ok: false, error: makeDomainError("SLOT_TAKEN") };
      }
      const booking: Booking = {
        id: randomUUID(),
        meetingTypeId: input.meetingTypeId,
        meetingTypeName: mt.name,
        guestName: input.guestName,
        guestEmail: input.guestEmail,
        startsAt: startDt.toISO({ suppressMilliseconds: true })!,
        endsAt: endDt.toISO({ suppressMilliseconds: true })!,
      };
      this.bookings.push(booking);
      return { ok: true, booking };
    } finally {
      release();
    }
  }

  /**
   * Список предстоящих бронирований (`startsAt >= now`), отсортированных
   * хронологически. Снимок берётся под локом, чтобы конкурентный `book`
   * не застал нас на полпути.
   */
  async list(now: DateTime): Promise<Booking[]> {
    const snapshot = await this.snapshot();
    const nowMs = now.toMillis();
    return snapshot
      .filter((b) => DateTime.fromISO(b.startsAt).toMillis() >= nowMs)
      .toSorted((a, b) => a.startsAt.localeCompare(b.startsAt));
  }

  /**
   * Сетка свободных слотов для конкретного `meetingTypeId` в текущем окне.
   * Слот, занятый записью с любым `meetingTypeId`, считается занятым. Под локом
   * берётся снимок записей; далее мы итерируем сетку, проверяя пересечение.
   *
   * Слоты, которые **уже начались**, в сетку не попадают: окно начинается с
   * 00:00 текущего дня, поэтому без этого фильтра гость увидел бы (и мог бы
   * занять) сегодняшние часы, которые прошли — запись на такой слот
   * отвергается доменом (см. `book`) и никогда не появилась бы в списке
   * владельца.
   */
  async availability(
    meetingTypeId: string,
    now: DateTime,
  ): Promise<{ ok: true; value: Availability } | { ok: false; error: DomainErrorBody }> {
    const mt = this.meetingTypeStore.getById(meetingTypeId);
    if (!mt) {
      return {
        ok: false,
        error: makeDomainError("MEETING_TYPE_NOT_FOUND", `Тип встречи ${meetingTypeId} не найден.`),
      };
    }
    const tz = this.config.owner.timezone;
    const win = boundsFor(now, this.config.windowDays, tz);
    const wh: WorkingHours = {
      startMin: parseHHMM(this.config.workingHours.start),
      endMin: parseHHMM(this.config.workingHours.end),
    };
    const snapshot = await this.snapshot();
    const nowMs = now.toMillis();

    const dayStarts: DateTime[] = [];
    for (let d = 0; d < this.config.windowDays; d++) {
      dayStarts.push(win.start.plus({ days: d }));
    }

    const days: AvailabilityDay[] = dayStarts.map((dayBase) => {
      const date = dayBase.toISODate()!;
      // Window остаётся календарным: нерабочий день не удаляется из ответа.
      if (!this.config.workingDays.includes(dayBase.weekday)) {
        return { date, slots: [] };
      }

      const slots: string[] = [];
      const hourStart = Math.floor(wh.startMin / 60);
      const minuteStart = wh.startMin % 60;
      let cur = dayBase.set({
        hour: hourStart,
        minute: minuteStart,
        second: 0,
        millisecond: 0,
      });
      // Продолжаем, пока есть место под длительность типа до конца рабочего дня.
      while (cur.hour * 60 + cur.minute + mt.durationMinutes <= wh.endMin) {
        const slotEnd = cur.plus({ minutes: mt.durationMinutes });
        const curMs = cur.toMillis();
        const endMs = slotEnd.toMillis();
        // Уже начавшийся слот не предлагаем (см. doc-комментарий метода).
        if (curMs > nowMs) {
          const occupied = snapshot.some((b) => {
            const bs = DateTime.fromISO(b.startsAt).toMillis();
            const be = DateTime.fromISO(b.endsAt).toMillis();
            return curMs < be && bs < endMs;
          });
          if (!occupied) slots.push(cur.toISO({ suppressMilliseconds: true })!);
        }
        cur = cur.plus({ minutes: this.config.slotStepMinutes });
      }
      return { date, slots };
    });

    return {
      ok: true,
      value: {
        meetingTypeId,
        windowStart: win.start.toISO({ suppressMilliseconds: true })!,
        windowEnd: win.end.toISO({ suppressMilliseconds: true })!,
        days,
      },
    };
  }

  private async snapshot(): Promise<readonly Booking[]> {
    const release = await this.gate.acquire();
    try {
      return this.bookings.slice();
    } finally {
      release();
    }
  }
}
