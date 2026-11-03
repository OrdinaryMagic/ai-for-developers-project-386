import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";

import { BookingsPage } from "@/features/owner/bookings";
import HomePage from "@/features/guest/index";
import BookPage from "@/features/guest/book/BookPage";

// Owner-страница MeetingType CRUD: лениво (на этой стадии без SSR,
// чанк не съест ничего важного для smoke-теста `/`, но держит
// root-маршрут лёгким).
const EventTypesPage = lazy(() => import("@/features/owner/event-types/index.js"));

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/book/:meetingTypeId" element={<BookPage />} />
      <Route path="/admin/bookings" element={<BookingsPage />} />
      <Route
        path="/admin/event-types"
        element={
          <Suspense fallback={<div className="container py-8">Загрузка…</div>}>
            <EventTypesPage />
          </Suspense>
        }
      />
    </Routes>
  );
}
