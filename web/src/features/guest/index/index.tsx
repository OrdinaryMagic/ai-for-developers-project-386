import { useEffect, useState } from "react";

import { listMeetingTypes, type MeetingType } from "@/features/guest/api";
import { MeetingTypeCard } from "@/features/guest/index/MeetingTypeCard";

type State =
  | { kind: "loading" }
  | { kind: "ready"; meetingTypes: MeetingType[] }
  | { kind: "error"; message: string };

export function HomePage() {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let aborted = false;
    listMeetingTypes()
      .then((meetingTypes) => {
        if (aborted) return;
        setState({ kind: "ready", meetingTypes });
      })
      .catch((err: unknown) => {
        if (aborted) return;
        const message = err instanceof Error ? err.message : "Неизвестная ошибка";
        setState({ kind: "error", message });
      });
    return () => {
      aborted = true;
    };
  }, []);

  return (
    <div data-testid="home-page" className="container py-8">
      <header className="mb-6">
        <h1 className="text-3xl font-semibold tracking-tight">Запись на встречу</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Выберите тип встречи, чтобы посмотреть доступные слоты.
        </p>
      </header>

      {state.kind === "loading" ? (
        <p data-testid="home-loading" className="text-sm text-muted-foreground">
          Загрузка…
        </p>
      ) : state.kind === "error" ? (
        <div
          data-testid="home-error"
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive"
        >
          {state.message}
        </div>
      ) : state.meetingTypes.length === 0 ? (
        <div
          data-testid="home-empty"
          className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground"
        >
          Пока нет доступных типов встреч. Загляните позже.
        </div>
      ) : (
        <div data-testid="meeting-types-list" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {state.meetingTypes.map((mt) => (
            <MeetingTypeCard key={mt.id} meetingType={mt} />
          ))}
        </div>
      )}
    </div>
  );
}

export default HomePage;
