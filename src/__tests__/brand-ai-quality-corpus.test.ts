import { expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { brandKnowledge } from "@/server/services/brand-ai-knowledge";
import { emptyBrandProfile } from "@/server/services/brand-ai-dialogue";
const cases = JSON.parse(
  readFileSync("scripts/qa/brand-ai-quality/cases.json", "utf8"),
);
it("has40 distinct repeatable public/synthetic cases, including the real acceptance failures", () => {
  expect(cases).toHaveLength(40);
  expect(new Set(cases.map((item: { id: string }) => item.id)).size).toBe(40);
  expect(
    cases.slice(0, 5).map((item: { question: string }) => item.question),
  ).toContain("怎麼試用");
  for (const item of cases) {
    const sources = brandKnowledge(
      item.question + JSON.stringify(item.prior ?? emptyBrandProfile),
    ).sources;
    if (item.sourcesAny.length)
      expect(
        item.sourcesAny.some((id: string) => sources.some((s) => s.id === id)),
      ).toBe(true);
  }
});
it("default evaluator performs no real call and explicitly declines to mark model quality passed", () => {
  const run = spawnSync(
    process.execPath,
    [
      "--conditions=react-server",
      "--import",
      "tsx",
      "scripts/qa/brand-ai-quality/evaluate.ts",
    ],
    { encoding: "utf8", env: { PATH: process.env.PATH, NODE_ENV: "test" } },
  );
  expect(run.status).toBe(0);
  expect(JSON.parse(run.stdout)).toMatchObject({
    realCalls: 0,
    modelQuality: "NOT_EVALUATED",
    cases: 40,
  });
});
it("real evaluation requires explicit budget, private ledger and a separately injected key", () => {
  const run = spawnSync(
    process.execPath,
    [
      "--conditions=react-server",
      "--import",
      "tsx",
      "scripts/qa/brand-ai-quality/evaluate.ts",
      "--real",
    ],
    { encoding: "utf8", env: { PATH: process.env.PATH, NODE_ENV: "test" } },
  );
  expect(run.status).not.toBe(0);
  expect(run.stderr).toContain("QUALITY_EVALUATION_FAILED_NO_PRIVATE_DETAILS");
});
