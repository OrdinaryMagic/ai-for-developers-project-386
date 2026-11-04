import { Outlet } from "react-router-dom";

import { SiteHeader } from "@/features/shared/SiteHeader";

/**
 * Общий каркас приложения: шапка + контент маршрута.
 *
 * Вынесен в layout-роут (`App.tsx`), чтобы шапка была на всех страницах
 * и её не приходилось дублировать в каждой фиче.
 */
export function AppLayout() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}

export default AppLayout;
