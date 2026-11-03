import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { listMeetingTypes, type MeetingType } from "./api.js";
import { EventTypeForm } from "./EventTypeForm.js";
import { EventTypesList } from "./EventTypesList.js";
import type { ListState, SubmitState } from "./types.js";

/**
 * Owner-страница `/admin/event-types`. В v1 API без auth, поэтому
 * компонент сам читает/пишет `MeetingType` через `/api/meeting-types`
 * (Vite-прокси ведёт на Fastify `127.0.0.1:3000`).
 *
 * Состояние верхнего уровня держит два слота:
 *   - `listState` — судьба `GET /meeting-types` (для блока списка);
 *   - `submitState` — судьба `POST /meeting-types` (для баннера-retry).
 *
 * Между собой они не пересекаются: создание элемента не перезагружает
 * список, новый элемент мержится локально через `onCreated`.
 */
export default function EventTypesPage() {
  const [listState, setListState] = useState<ListState>({ kind: "idle" });
  const [submitState, setSubmitState] = useState<SubmitState>({ kind: "idle" });
  const [items, setItems] = useState<MeetingType[]>([]);

  const reload = useCallback(async () => {
    setListState({ kind: "loading" });
    const outcome = await listMeetingTypes();
    if (outcome.kind === "success") {
      setItems(outcome.value);
      setListState({ kind: "loaded" });
      return;
    }
    setListState({ kind: "error", message: outcome.message });
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const onCreated = useCallback((created: MeetingType) => {
    setItems((prev) => [...prev, created]);
    setListState({ kind: "loaded" });
  }, []);

  return (
    <div data-testid="event-types-page" className="container mx-auto max-w-3xl space-y-6 py-8">
      <header>
        <h1 className="text-2xl font-semibold">Типы встреч</h1>
        <p className="text-sm text-muted-foreground">
          Список категорий, доступных гостям для бронирования.
        </p>
      </header>

      <Card data-testid="event-types-list-card">
        <CardHeader>
          <CardTitle className="text-lg">Существующие</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {listState.kind === "loading" && (
            <p data-testid="event-types-loading" className="text-sm text-muted-foreground">
              Загрузка…
            </p>
          )}
          {listState.kind === "error" && (
            <div
              data-testid="event-types-list-error"
              role="alert"
              className="space-y-2 rounded border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm"
            >
              <p className="font-medium text-destructive">Не удалось загрузить список.</p>
              <p className="text-muted-foreground">{listState.message}</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                data-testid="event-types-retry"
                onClick={() => void reload()}
              >
                Повторить
              </Button>
            </div>
          )}
          {(listState.kind === "loaded" || listState.kind === "idle") && (
            <EventTypesList items={items} />
          )}
        </CardContent>
      </Card>

      <Card data-testid="event-types-form-card">
        <CardHeader>
          <CardTitle className="text-lg">Создать тип встречи</CardTitle>
        </CardHeader>
        <CardContent>
          <EventTypeForm state={submitState} onStateChange={setSubmitState} onCreated={onCreated} />
        </CardContent>
      </Card>
    </div>
  );
}
