import { Route, Routes } from "react-router-dom";

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
    </Routes>
  );
}
