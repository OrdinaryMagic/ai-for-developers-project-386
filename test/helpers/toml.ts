/**
 * Минимальный разбор TOML-конфигов репозитория (`fly.toml`).
 *
 * TOML-парсера в зависимостях нет (новые deps не добавляем), поэтому разбор
 * построчный: секции + key/value. Этого хватает, потому что формат файлов
 * в этом репозитории зафиксирован контрактными тестами.
 */

/** Убирает `#`-комментарий, не задевая `#` внутри строковых значений. */
export function stripComment(line: string): string {
  let inString = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"' || ch === "'") inString = !inString;
    if (ch === "#" && !inString) return line.slice(0, i);
  }
  return line;
}

/** Значение без кавычек (`"3000"` → `3000`, `undefined` → пустая строка). */
export function unquote(value: string | undefined): string {
  if (value === undefined) return "";
  return value.replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
}

/**
 * Top-level строковый ключ TOML-источника — значение без кавычек.
 *
 * Ключ обязан стоять **до** первой секции `[…]`: внутри секции одноимённый
 * ключ принадлежит ей, а не корню. `undefined`, если такого ключа нет.
 */
export function readTopLevelStringKey(source: string, key: string): string | undefined {
  let inSection = false;

  for (const rawLine of source.split("\n")) {
    const line = stripComment(rawLine).trim();
    if (line === "") continue;
    // Секция начинается с `[` — дальше ключи принадлежат ей, а не root.
    if (line.startsWith("[")) {
      inSection = true;
      continue;
    }
    if (inSection) continue;

    const separator = line.indexOf("=");
    if (separator === -1) continue;
    if (line.slice(0, separator).trim() !== key) continue;

    return unquote(line.slice(separator + 1).trim());
  }

  return undefined;
}
