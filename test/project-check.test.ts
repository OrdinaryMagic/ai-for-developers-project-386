/**
 * Дрейф-шит canonical project gate (тикет #76).
 *
 * Публичный контракт разработчика и CI — `make check` / `mise run check`.
 * Ожидаемый порядок продублирован литералами из acceptance criteria, чтобы
 * удаление frontend-сборки или Playwright из общего gate не прошло незамеченным.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { JSON_SCHEMA, load as parseYaml } from "js-yaml";

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const MISE_PATH = join(REPO_ROOT, "mise.toml");
const WORKFLOW_PATH = join(REPO_ROOT, ".github/workflows/ci.yml");

const EXPECTED_CHECK_COMMANDS = [
  "npm run typecheck",
  "npm run typecheck:web",
  "npm run lint",
  "npm run format:check",
  "npm run test",
  "npm run test:web",
  "npm run build:web",
  "npm run test:e2e",
];

type WorkflowStep = {
  name?: string;
  run?: string;
  uses?: string;
  if?: string;
};

type Workflow = {
  jobs: Record<
    string,
    {
      needs?: string;
      steps?: WorkflowStep[];
    }
  >;
};

function readWorkflow(): Workflow {
  return parseYaml(readFileSync(WORKFLOW_PATH, "utf8"), { schema: JSON_SCHEMA }) as Workflow;
}

describe("canonical project check", () => {
  it("последовательно запускает backend/web, production-сборку и Playwright", () => {
    const mise = readFileSync(MISE_PATH, "utf8");
    const checkSection = mise.match(/\[tasks\.check\]\s+[\s\S]*?run = "([^"]+)"/);

    expect(checkSection?.[1]?.split(" && ")).toEqual(EXPECTED_CHECK_COMMANDS);
  });

  it("CI использует тот же gate без дублирующего e2e-job и сохраняет browser-инфраструктуру", () => {
    const workflow = readWorkflow();

    expect(Object.keys(workflow.jobs)).toEqual(["check", "docker"]);
    expect(workflow.jobs.docker?.needs).toBe("check");

    const steps = workflow.jobs.check?.steps ?? [];
    expect(steps.some((step) => step.run === "mise run check")).toBe(true);
    expect(steps.some((step) => step.run === "npm run test:e2e:install")).toBe(true);
    expect(steps.some((step) => step.uses === "actions/cache@v5")).toBe(true);
    expect(
      steps.some((step) => step.uses === "actions/upload-artifact@v5" && step.if === "failure()"),
    ).toBe(true);
  });
});
