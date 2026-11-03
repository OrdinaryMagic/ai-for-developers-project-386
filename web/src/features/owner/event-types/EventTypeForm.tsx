import { useEffect } from "react";
import { useForm } from "react-hook-form";

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

import type { CreateMeetingTypeRequest, CreateOutcome, MeetingType } from "./api.js";
import { createMeetingType } from "./api.js";
import { DOMAIN_ERROR_MESSAGES, type EventTypeFormValues, type SubmitState } from "./types.js";

/**
 * Шаг сетки владельца по умолчанию. Бэкенд читает `OWNER_SLOT_STEP_MINUTES`
 * (default 30) и принимает только кратные этому шагу длительности; UI
 * валидирует локально по тому же инварианту — иначе первый сабмит получит
 * `INVALID_DURATION` и пользователь увидит серверный текст вместо
 * мгновенной подсказки.
 */
const SLOT_STEP_MINUTES = 30;
const MAX_DURATION_MINUTES = 1440;

export interface EventTypeFormProps {
  state: SubmitState;
  onStateChange: (next: SubmitState) => void;
  onCreated: (created: MeetingType) => void;
}

/**
 * Пытается распарсить положительное целое из строки input.
 * Возвращает `null`, если строка пуста; иначе либо валидный `number`,
 * либо `NaN`-флаг через `isNaN`.
 */
function parseDuration(raw: string): { ok: true; value: number } | { ok: false; reason: string } {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { ok: false, reason: "обязательное" };
  if (!/^-?\d+$/.test(trimmed)) {
    return { ok: false, reason: "только целые числа" };
  }
  const n = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(n) || n <= 0) {
    return { ok: false, reason: "должно быть положительным" };
  }
  if (n > MAX_DURATION_MINUTES) {
    return {
      ok: false,
      reason: `должно быть ≤ ${MAX_DURATION_MINUTES}`,
    };
  }
  if (n % SLOT_STEP_MINUTES !== 0) {
    return {
      ok: false,
      reason: `должно быть кратно ${SLOT_STEP_MINUTES}`,
    };
  }
  return { ok: true, value: n };
}

/**
 * Маппит ответ `POST /meeting-types` на воздействия UI. Сервер —
 * source of truth; здесь только диспетчер: привязать `INVALID_DURATION`
 * к полю или поднять банер.
 */
function applyOutcome(
  outcome: CreateOutcome,
  setFieldError: (message: string | undefined) => void,
  setBanner: (msg: string) => void,
): { kind: "success" | "field-error" | "banner-error" } {
  if (outcome.kind === "success") return { kind: "success" };
  if (outcome.kind === "domain") {
    if (outcome.error.code === "INVALID_DURATION") {
      setFieldError(DOMAIN_ERROR_MESSAGES.INVALID_DURATION);
      return { kind: "field-error" };
    }
    setFieldError(undefined);
    setBanner(DOMAIN_ERROR_MESSAGES[outcome.error.code] ?? outcome.error.message);
    return { kind: "banner-error" };
  }
  setFieldError(undefined);
  setBanner(outcome.message);
  return { kind: "banner-error" };
}

export function EventTypeForm({ state, onStateChange, onCreated }: EventTypeFormProps) {
  const form = useForm<EventTypeFormValues>({
    defaultValues: { name: "", description: "", durationMinutes: 30 },
    mode: "onSubmit",
  });

  const {
    handleSubmit,
    setError,
    reset,
    control,
    formState: { isSubmitting },
  } = form;

  // Если родительский баннер сбросился (`idle`) — чистим и локальный.
  useEffect(() => {
    if (state.kind === "idle") {
      setError("root", { message: undefined });
    }
  }, [state.kind, setError]);

  async function onSubmit(values: EventTypeFormValues) {
    onStateChange({ kind: "submitting" });
    const durationCheck = parseDuration(String(values.durationMinutes));
    if (!durationCheck.ok) {
      setError("durationMinutes", { type: "manual", message: durationCheck.reason });
      onStateChange({ kind: "idle" });
      return;
    }

    const body: CreateMeetingTypeRequest = {
      name: values.name.trim(),
      description: values.description.trim(),
      durationMinutes: durationCheck.value,
    };
    const outcome = await createMeetingType(body);

    const applied = applyOutcome(
      outcome,
      (msg) => setError("durationMinutes", { type: "server", message: msg }),
      (msg) => onStateChange({ kind: "network-error", message: msg }),
    );

    if (applied.kind === "success" && outcome.kind === "success") {
      reset({ name: "", description: "", durationMinutes: 30 });
      onStateChange({ kind: "idle" });
      onCreated(outcome.value);
      return;
    }
    if (applied.kind === "field-error") {
      onStateChange({ kind: "idle" });
      return;
    }
    // banner-error — состояние уже выставлено в onStateChange.
  }

  const showBanner = state.kind === "network-error";
  const isBusy = isSubmitting || state.kind === "submitting";

  return (
    <Form {...form}>
      <form
        data-testid="event-type-form"
        onSubmit={handleSubmit(onSubmit)}
        className="space-y-4"
        noValidate
      >
        {showBanner && state.kind === "network-error" && (
          <div
            data-testid="event-type-error-banner"
            role="alert"
            className="rounded border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm"
          >
            <p className="font-medium text-destructive">Не удалось создать тип встречи.</p>
            <p className="text-muted-foreground">{state.message}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-2"
              data-testid="event-type-retry"
              onClick={() => handleSubmit(onSubmit)()}
              disabled={isBusy}
            >
              Повторить
            </Button>
          </div>
        )}

        <FormField
          control={control}
          name="name"
          rules={{
            required: "обязательное",
            validate: (v) => v.trim().length >= 1 || "обязательное",
          }}
          render={({ field }) => (
            <FormItem>
              <FormLabel htmlFor={field.name}>Название</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  id={field.name}
                  data-testid="event-type-name"
                  placeholder="30-минутная консультация"
                  disabled={isBusy}
                />
              </FormControl>
              <FormMessage data-testid="event-type-error-name" />
            </FormItem>
          )}
        />

        <FormField
          control={control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel htmlFor={field.name}>Описание</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  id={field.name}
                  data-testid="event-type-description"
                  placeholder="Кратко о чём встреча"
                  disabled={isBusy}
                />
              </FormControl>
              <FormMessage data-testid="event-type-error-description" />
            </FormItem>
          )}
        />

        <FormField
          control={control}
          name="durationMinutes"
          rules={{
            required: "обязательное",
            validate: (v) => {
              const r = parseDuration(String(v));
              return r.ok || r.reason;
            },
          }}
          render={({ field, fieldState }) => (
            <FormItem>
              <FormLabel htmlFor={field.name}>Длительность, мин</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  id={field.name}
                  data-testid="event-type-duration"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={MAX_DURATION_MINUTES}
                  step={SLOT_STEP_MINUTES}
                  value={field.value}
                  onChange={(e) => field.onChange(e.target.value)}
                  disabled={isBusy}
                />
              </FormControl>
              {fieldState.error?.type === "server" && (
                <p
                  data-testid="event-type-error-invalid-duration"
                  className="text-sm font-medium text-destructive"
                >
                  {fieldState.error.message ?? DOMAIN_ERROR_MESSAGES.INVALID_DURATION}
                </p>
              )}
              <FormMessage data-testid="event-type-error-duration" />
            </FormItem>
          )}
        />

        <Button type="submit" data-testid="event-type-submit" disabled={isBusy}>
          Создать тип встречи
        </Button>
      </form>
    </Form>
  );
}
