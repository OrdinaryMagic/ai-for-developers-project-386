import { Link } from "react-router-dom";

/**
 * Заглушка для неизвестного маршрута.
 *
 * Сервер отдаёт оболочку SPA для любого клиентского пути (SPA-fallback,
 * ADR-0006), поэтому маршрут, которого нет в `App.tsx`, обязан показать
 * что-то осмысленное — иначе пользователь видит пустую страницу.
 */
export function NotFoundPage() {
  return (
    <div data-testid="not-found-page" className="container py-8">
      <h1 className="text-3xl font-semibold tracking-tight">Страница не найдена</h1>
      <p className="text-sm text-muted-foreground mt-1">
        Такого адреса нет. Возможно, ссылка устарела или в ней опечатка.
      </p>
      <Link to="/" className="mt-6 inline-block text-sm font-medium underline underline-offset-4">
        На главную
      </Link>
    </div>
  );
}

export default NotFoundPage;
