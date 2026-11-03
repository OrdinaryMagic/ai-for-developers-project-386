/**
 * Compile-time-зеркало полей TS-интерфейсов из `src/types.ts`.
 *
 * `Record<keyof X, true>` заставляет TypeScript требовать, чтобы литерал
 * перечислил ровно ключи, объявленные в `X`:
 *   - уберёте поле из `src/types.ts` — `tsc` ругнётся
 *     "Property 'xxx' is missing in type";
 *   - добавите поле в `X`, не отразив здесь, — `tsc` ругнётся
 *     "Object literal may only specify known properties".
 *
 * Vitest использует это как рантайм-источник списка ключей и сравнивает
 * с `typesManifest` / `openapi.yaml` — дрейф в любую сторону ловится.
 *
 * В `tsconfig.json` каталог `test/` исключён из `tsc`, поэтому проверка
 * TS-литерала не срабатывает на `npm run typecheck`; вместо неё vitest
 * на каждом запуске материализует список ключей и сравнивает его с
 * манифестом ниже в `openapi.contract.test.ts`.
 */
import type { Availability, AvailabilityDay, Booking, MeetingType } from "../../src/types.js";

export const tsShape: {
  MeetingType: Record<keyof MeetingType, true>;
  Booking: Record<keyof Booking, true>;
  Availability: Record<keyof Availability, true>;
  AvailabilityDay: Record<keyof AvailabilityDay, true>;
} = {
  MeetingType: {
    id: true,
    name: true,
    description: true,
    durationMinutes: true,
  },
  Booking: {
    id: true,
    meetingTypeId: true,
    meetingTypeName: true,
    guestName: true,
    guestEmail: true,
    startsAt: true,
    endsAt: true,
  },
  Availability: {
    meetingTypeId: true,
    windowStart: true,
    windowEnd: true,
    days: true,
  },
  AvailabilityDay: {
    date: true,
    slots: true,
  },
};
