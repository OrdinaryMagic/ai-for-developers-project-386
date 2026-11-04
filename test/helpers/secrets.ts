/**
 * Поиск секретоподобных значений — общий скаут для drift-тестов.
 *
 * Два режима:
 *   - `secretValueHits` — credential-значения в произвольном тексте
 *     (markdown-документация, значения конфигов). Слова «секрет»/`token` в
 *     прозе сюда НЕ попадают: ловится присваивание, `Bearer …`, префикс
 *     GitHub-токена, PEM-ключ и JWT;
 *   - `secretFieldHits` — подозрительные ключи и значения в структуре
 *     (JSON-конфиг): проверяются и имена полей, и их содержимое.
 */

/** Credential-значения в тексте. */
const SECRET_VALUE_PATTERNS: readonly RegExp[] = [
  // Префиксы GitHub-токенов (ghp_, gho_, ghu_, ghs_, ghr_).
  /\bgh[pousr]_[A-Za-z0-9]{16,}/g,
  // Присваивание credential'а: `token = …`, `api_key: …`, `password=…`.
  /\b(?:token|password|passwd|secret|api[_-]?key|access[_-]?key|credentials?)\b\s*[:=]\s*\S/gi,
  // Значение заголовка Authorization.
  /\bbearer\s+[A-Za-z0-9._~+/=-]{8,}/gi,
  // Приватный ключ в PEM-виде.
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/g,
  // JWT.
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\./g,
];

/** Подозрительные имена полей в структуре конфига. */
const SECRET_FIELD_PATTERNS: readonly RegExp[] = [
  /token/i,
  /password/i,
  /secret/i,
  /api[_-]?key/i,
  /bearer/i,
  /\bghp_/,
  /\bgho_/,
];

/** Подозрительные значения текста — чтобы падение было читаемым. */
export function secretValueHits(text: string): string[] {
  const hits: string[] = [];
  for (const pattern of SECRET_VALUE_PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      hits.push(match[0]);
    }
  }
  return hits;
}

/** Все ключи и строковые значения структуры вместе с путём до них. */
function collectStrings(value: unknown, path = "$"): Array<{ path: string; text: string }> {
  if (typeof value === "string") return [{ path, text: value }];
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => collectStrings(item, `${path}[${index}]`));
  }
  if (value !== null && typeof value === "object") {
    return Object.entries(value).flatMap(([key, item]) => [
      { path: `${path}.${key}`, text: key },
      ...collectStrings(item, `${path}.${key}`),
    ]);
  }
  return [];
}

/** Подозрительные поля структуры: путь + текст, чтобы падение было читаемым. */
export function secretFieldHits(value: unknown): string[] {
  return collectStrings(value)
    .filter(({ text }) => SECRET_FIELD_PATTERNS.some((pattern) => pattern.test(text)))
    .map(({ path, text }) => `${path} → ${text}`);
}
