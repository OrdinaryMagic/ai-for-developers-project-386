import { describe, it, expect } from "vitest";
import { makeDomainError, type DomainErrorCode } from "../../src/errors/domain-errors.js";

const cases: Array<{ code: DomainErrorCode; statusCode: number }> = [
  { code: "MEETING_TYPE_NOT_FOUND", statusCode: 404 },
  { code: "OUTSIDE_WORKING_HOURS", statusCode: 422 },
  { code: "OUTSIDE_WINDOW", statusCode: 422 },
  { code: "MISMATCH_STEP", statusCode: 422 },
  { code: "SLOT_TAKEN", statusCode: 409 },
];

describe("makeDomainError", () => {
  for (const { code, statusCode } of cases) {
    it(`код ${code} → HTTP ${statusCode}`, () => {
      const err = makeDomainError(code);
      expect(err.code).toBe(code);
      expect(err.statusCode).toBe(statusCode);
      expect(typeof err.message).toBe("string");
      expect(err.message.length).toBeGreaterThan(0);
    });
  }

  it("поддерживает переопределение message", () => {
    const err = makeDomainError("MEETING_TYPE_NOT_FOUND", "Тип foo не найден");
    expect(err.message).toBe("Тип foo не найден");
    expect(err.code).toBe("MEETING_TYPE_NOT_FOUND");
    expect(err.statusCode).toBe(404);
  });

  it("возвращает стабильные коды для всех кодов", () => {
    const codes: DomainErrorCode[] = [
      "MEETING_TYPE_NOT_FOUND",
      "OUTSIDE_WORKING_HOURS",
      "OUTSIDE_WINDOW",
      "MISMATCH_STEP",
      "SLOT_TAKEN",
    ];
    expect(new Set(codes.map((c) => makeDomainError(c).code)).size).toBe(codes.length);
  });
});
