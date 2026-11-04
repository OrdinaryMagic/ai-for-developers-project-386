import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";

import { BookingsPage } from "@/features/owner/bookings";
import HomePage from "@/features/guest/index";
import BookPage from "@/features/guest/book/BookPage";
import ConfirmedPage from "@/features/guest/book/ConfirmedPage";
import { AppLayout } from "@/features/shared/AppLayout";
import { NotFoundPage } from "@/features/shared/NotFoundPage";

// Owner-страница MeetingType CRUD: лениво (на этой стадии без SSR,
// чанк не съест ничего важного для smoke-теста `/`, но держит
// root-маршрут лёгким).
const EventTypesPage = lazy(() => import("@/features/owner/event-types/index.js"));

export default function App() {
  return (
    <Routes>
      {/* Layout-роут: шапка с навигацией рендерится на всех страницах. */}
      <Route element={<AppLayout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/book/:meetingTypeId" element={<BookPage />} />
        <Route path="/book/:meetingTypeId/confirmed" element={<ConfirmedPage />} />
        <Route path="/admin/bookings" element={<BookingsPage />} />
        <Route
          path="/admin/event-types"
          element={
            <Suspense fallback={<div className="container py-8">Загрузка…</div>}>
              <EventTypesPage />
            </Suspense>
          }
        />
        {/* Catch-all: сервер отдаёт оболочку для любого неизвестного пути
            (SPA-fallback, ADR-0006) — без этого маршрута страница была бы
            пустой. */}
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
