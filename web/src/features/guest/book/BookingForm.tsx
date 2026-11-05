import { useState } from "react";
import { useForm } from "react-hook-form";
import { DateTime } from "luxon";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";

import type { MeetingType } from "@/features/guest/api";
import { createBooking, type Booking, type DomainError } from "@/features/guest/book/api";
import { useOwnerTimezone } from "@/features/owner/bookings/OwnerTimezoneContext";
import { formatBookingSummary } from "@/lib/dateTime";

/**
 * Шаблон валидации email для react-hook-form. Цель — мгновенная
 * подсветка браузером вместо серверного 400 (`FST_ERR_VALIDATION`) на
 * первом submit; на сервере правила жёстче, но нам достаточно
 * приличного regex-предиката, чтобы форма не отправляла мусор.
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Локальная форма-стратегия. Не использует SDK-types напрямую для
 * значений — react-hook-form оперирует строками из input. Граница
 * со схемой сервера фиксируется в `onSubmit` (trim, валидация, fetch).
 */
interface BookingFormValues {
  name: string;
  email: string;
}

type SubmitState =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "domain-error"; error: DomainError }
  | { kind: "network-error"; message: string };

export interface BookingFormProps {
  /** Название и длительность нужны для человекочитаемого summary до POST. */
  meetingType: MeetingType;
  /** Пре-заполненный ISO старта слота (`startsAt` из `AvailabilityDay.slots`). */
  slot: string;
  /** Колбэк при успешном `POST /bookings` — родитель ведёт в `/confirmed`. */
  onBooked: (booking: Booking) => void;
  /** Колбэк отмены — родитель возвращает к списку слотов. */
  onCancel: () => void;
}

/**
 * Маппинг `DomainErrorCode → понятный текст баннера`. Цель — короткое
 * человеко-ориентированное сообщение; детали кода остаются в
 * `data-testid="booking-error-<code>"` для тестов и автоматизаций.
 */
export const BOOKING_ERROR_MESSAGES: Readonly<Record<DomainError["code"], string>> = {
  SLOT_TAKEN: "Слот уже занят, выберите другое время.",
  OUTSIDE_WINDOW: "Это время уже прошло или вне окна бронирования — выберите другой слот.",
  OUTSIDE_WORKING_HOURS: "Этот слот вне рабочих часов владельца, выберите другой.",
  MISMATCH_STEP: "Старт слота не выровнен по шагу сетки, обновите страницу.",
  MEETING_TYPE_NOT_FOUND: "Тип встречи больше не доступен.",
  INVALID_DURATION: "Длительность встречи изменилась, обновите страницу.",
};

export function BookingForm({ meetingType, slot, onBooked, onCancel }: BookingFormProps) {
  const { timezone } = useOwnerTimezone();
  const form = useForm<BookingFormValues>({
    defaultValues: { name: "", email: "" },
    mode: "onSubmit",
  });

  const [state, setState] = useState<SubmitState>({ kind: "idle" });

  const {
    handleSubmit,
    control,
    formState: { isSubmitting },
  } = form;

  async function onSubmit(values: BookingFormValues) {
    setState({ kind: "submitting" });
    const trimmed: BookingFormValues = {
      name: values.name.trim(),
      email: values.email.trim(),
    };
    const outcome = await createBooking({
      meetingTypeId: meetingType.id,
      startsAt: slot,
      guestName: trimmed.name,
      guestEmail: trimmed.email,
    });
    if (outcome.kind === "success") {
      setState({ kind: "idle" });
      onBooked(outcome.booking);
      return;
    }
    if (outcome.kind === "domain") {
      setState({ kind: "domain-error", error: outcome.error });
      return;
    }
    setState({ kind: "network-error", message: outcome.message });
  }

  const isBusy = isSubmitting || state.kind === "submitting";
  const showDomainBanner = state.kind === "domain-error";
  const showNetworkBanner = state.kind === "network-error";
  const endsAt =
    DateTime.fromISO(slot, { zone: timezone })
      .plus({ minutes: meetingType.durationMinutes })
      .toISO() ?? slot;

  return (
    <Form {...form}>
      <form
        data-testid="booking-form"
        onSubmit={handleSubmit(onSubmit)}
        className="space-y-4"
        noValidate
      >
        <div
          data-testid="booking-prefilled-slot"
          className="rounded-md border bg-muted/40 px-3 py-2 text-sm font-medium"
        >
          {formatBookingSummary(meetingType.name, slot, endsAt, timezone)}
          <input type="hidden" data-testid="booking-prefilled-slot-iso" value={slot} readOnly />
        </div>

        {showDomainBanner && (
          <div data-testid="booking-error" role="alert">
            <div
              data-testid={`booking-error-${state.error.code.toLowerCase().replace(/_/g, "-")}`}
              className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm"
            >
              <p className="font-medium text-destructive">Не удалось создать бронь.</p>
              <p className="text-muted-foreground">
                {BOOKING_ERROR_MESSAGES[state.error.code] ?? state.error.message}
              </p>
            </div>
          </div>
        )}

        {showNetworkBanner && (
          <div
            data-testid="booking-error"
            role="alert"
            className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm"
          >
            <p className="font-medium text-destructive">Не удалось отправить запрос.</p>
            <p className="text-muted-foreground">{state.message}</p>
          </div>
        )}

        <FormField
          control={control}
          name="name"
          rules={{
            required: "обязательное",
            validate: (v) => v.trim().length > 0 || "обязательное",
          }}
          render={({ field }) => (
            <FormItem>
              <FormLabel htmlFor={field.name}>Имя</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  id={field.name}
                  data-testid="booking-name"
                  placeholder="Как к вам обращаться"
                  disabled={isBusy}
                  autoComplete="name"
                />
              </FormControl>
              <FormMessage data-testid="booking-error-name" />
            </FormItem>
          )}
        />

        <FormField
          control={control}
          name="email"
          rules={{
            required: "обязательное",
            pattern: { value: EMAIL_PATTERN, message: "похоже на email" },
          }}
          render={({ field }) => (
            <FormItem>
              <FormLabel htmlFor={field.name}>Email</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  id={field.name}
                  data-testid="booking-email"
                  type="email"
                  placeholder="name@example.com"
                  disabled={isBusy}
                  autoComplete="email"
                />
              </FormControl>
              <FormMessage data-testid="booking-error-email" />
            </FormItem>
          )}
        />

        <div className="flex flex-wrap gap-2">
          <Button type="submit" data-testid="booking-submit" disabled={isBusy}>
            Записаться
          </Button>
          <Button
            type="button"
            variant="outline"
            data-testid="booking-cancel"
            onClick={onCancel}
            disabled={isBusy}
          >
            Назад
          </Button>
        </div>
      </form>
    </Form>
  );
}

export default BookingForm;
