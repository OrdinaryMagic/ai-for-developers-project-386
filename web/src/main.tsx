import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { OwnerTimezoneProvider } from "./features/owner/bookings/OwnerTimezoneContext";
import "./index.css";

const rootEl = document.getElementById("root");
if (!rootEl) {
  throw new Error("Root element #root not found");
}

createRoot(rootEl).render(
  <StrictMode>
    <BrowserRouter>
      <OwnerTimezoneProvider>
        <App />
      </OwnerTimezoneProvider>
    </BrowserRouter>
  </StrictMode>,
);
