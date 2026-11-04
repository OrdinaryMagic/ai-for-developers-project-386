/**
 * Извлечение markdown-раздела README по заголовку.
 *
 * Дрейф-тесты читают конкретные разделы README («Production deploy», «MCP»,
 * «Secrets»), а не весь файл: совпадение в соседнем тексте не должно
 * проходить за совпадение в нужном разделе.
 *
 * Раздел — это блок от заголовка второго уровня (`## Заголовок`) до
 * следующего заголовка второго уровня. Заголовки третьего уровня (`###`)
 * остаются внутри раздела.
 */
export function readmeSection(readme: string, heading: string): string {
  const start = readme.search(new RegExp(`^##\\s+${heading}\\s*$`, "m"));
  if (start === -1) return "";
  const rest = readme.slice(start);
  const next = rest.slice(1).search(/^##\s+/m);
  return next === -1 ? rest : rest.slice(0, next + 1);
}
