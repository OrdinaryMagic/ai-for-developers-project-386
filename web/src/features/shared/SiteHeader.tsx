import { NavLink } from "react-router-dom";

import { cn } from "@/lib/utils";

/**
 * Ссылки на страницы приложения.
 *
 * В v1 API без auth, поэтому «доступных страниц» ровно столько, сколько
 * маршрутов в `App.tsx`: гостевой сценарий записи и два owner-экрана.
 * Динамический маршрут `/book/:meetingTypeId` в шапку не попадает — у
 * него нет постоянного адреса, он открывается из списка типов встреч.
 */
export const NAV_LINKS = [
  { to: "/", label: "Запись", end: true },
  { to: "/admin/bookings", label: "Бронирования", end: false },
  { to: "/admin/event-types", label: "Типы встреч", end: false },
] as const;

/**
 * Шапка приложения: рендерится над контентом на всех маршрутах
 * (включая страницу «не найдено»), чтобы к любому экрану можно было
 * дойти в один клик.
 */
export function SiteHeader() {
  return (
    <header data-testid="site-header" className="border-b bg-background">
      <div className="container flex h-14 items-center gap-6">
        <span className="text-sm font-semibold tracking-tight">Booking</span>
        <nav aria-label="Основная навигация" className="flex items-center gap-1">
          {NAV_LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              className={({ isActive }) =>
                cn(
                  "rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground",
                  isActive ? "bg-secondary text-secondary-foreground" : "text-muted-foreground",
                )
              }
            >
              {link.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </header>
  );
}

export default SiteHeader;
