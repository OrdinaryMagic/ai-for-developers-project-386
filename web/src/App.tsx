import { Route, Routes } from "react-router-dom";

import { BookingsPage } from "@/features/owner/bookings";

export default function App() {
  return (
    <Routes>
      <Route
        path="/"
        element={
          <div className="container py-8">
            <div data-testid="root-placeholder">Booking frontend skeleton — coming soon</div>
          </div>
        }
      />
      <Route path="/admin/bookings" element={<BookingsPage />} />
    </Routes>
  );
}
