/**
 * Минимальный асинхронный мьютекс для in-memory хранилища. Очередь FIFO:
 * каждый `acquire()` ждёт окончания предыдущего холдера и получает свою
 * функцию `release`. Бросать после `acquire()` не нужно — корректная работа
 * гарантируется парой `await acquire()` → `try { ... } finally { release(); }`.
 *
 * В v1 используется в {@link BookingStore} под капотом `book`. Один мьютекс на
 * хранилище — все мутации сериализуются. Это даёт корректность при конкурентных
 * `POST /bookings` без сложной per-key логики; узкое место — теоретическое, в
 * нашем масштабе (один владелец, in-memory) некритичное.
 *
 * Переезд на SQLite в следующей итерации (см. ADR-0001) заменит мутекс на
 * транзакцию БД — публичный интерфейс `acquire/release` останется тем же на
 * уровне кода стора.
 */
export class AsyncLock {
  private tail: Promise<void> = Promise.resolve();

  async acquire(): Promise<() => void> {
    const previous = this.tail;
    let release!: () => void;
    this.tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    return release;
  }
}
