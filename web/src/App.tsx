import { Route, Routes } from "react-router-dom";

import { BookingsPage } from "@/features/owner/bookings";
import HomePage from "@/features/guest/index";
import BookPage from "@/features/guest/book/BookPage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/book/:meetingTypeId" element={<BookPage />} />
      <Route path="/admin/bookings" element={<BookingsPage />} />
    </Routes>
  );
}
