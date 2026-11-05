import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const glossary = readFileSync(join(REPO_ROOT, "GLOSSARY.md"), "utf8");
const readme = readFileSync(join(REPO_ROOT, "README.md"), "utf8");

function glossaryEntry(term: string): string {
  const marker = `**${term} `;
  const start = glossary.indexOf(marker);
  if (start === -1) return "";
  const entry = glossary.slice(start);
  const nextEntry = entry.indexOf("\n**", marker.length);
  return nextEntry === -1 ? entry : entry.slice(0, nextEntry);
}

describe("drift seam: Working days ↔ доменная документация", () => {
  it("глоссарий отделяет ISO Working days от внутридневных Working hours и календарного Window", () => {
    const workingDays = glossaryEntry("Working days");
    expect(workingDays).toContain("ISO");
    expect(workingDays).toMatch(/1[^\n]*понедельник/i);
    expect(workingDays).toMatch(/7[^\n]*воскресенье/i);
    expect(workingDays).toMatch(/TZ владельца/);
    expect(workingDays).toContain("Working hours");
    expect(workingDays).toContain("Window");
    expect(workingDays).toContain("OUTSIDE_WORKING_HOURS");

    expect(glossaryEntry("Working hours")).toContain("Working days");
    expect(glossaryEntry("Window")).toMatch(/нерабоч/i);
  });

  it("README документирует формат env, custom weekends и отказ прямой записи", () => {
    expect(readme).toContain("OWNER_WORKING_DAYS=1,2,3,4,5");
    expect(readme).toContain("OWNER_WORKING_DAYS=6,7");
    expect(readme).toMatch(/14 календарных дн/);
    expect(readme).toContain("OUTSIDE_WORKING_HOURS");
    expect(readme).toMatch(/1=понедельник/);
    expect(readme).toMatch(/7=воскресенье/);
  });

  it("Configuration остаётся read-only: runtime PATCH в контракт не добавляется", () => {
    const configSpec = readFileSync(join(REPO_ROOT, "spec/routes/config.tsp"), "utf8");
    expect(configSpec).not.toMatch(/@(patch|put|delete)\b/);
    expect(readme).toContain("`PATCH /config`");
  });
});
