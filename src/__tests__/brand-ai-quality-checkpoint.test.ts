import { expect, it } from "vitest";
import {
  canStartEvaluationCase,
  resultIsIncomplete,
  evaluateQualityGate,
} from "../../scripts/qa/brand-ai-quality/checkpoint";
const today = "2026-11-28";
const calls = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    id: `old-${i}`,
    attempt: 1,
    day: today,
  }));
it("defers an unstarted case when only one daily slot remains, and starts it next day", () => {
  const history = calls(19);
  expect(canStartEvaluationCase(history, "next", today, 80, 70, 60000)).toBe(
    false,
  );
  expect(
    canStartEvaluationCase(history, "next", "2026-11-29", 0, 70, 60000),
  ).toBe(true);
  expect(history).toHaveLength(19);
});
it("does not start in the final15seconds or repeat a charged incomplete case", () => {
  expect(canStartEvaluationCase([], "next", today, 0, 70, 14999)).toBe(false);
  expect(
    canStartEvaluationCase(
      [{ id: "next", attempt: 1, day: today }],
      "next",
      "2026-11-29",
      0,
      70,
      60000,
    ),
  ).toBe(false);
  expect(canStartEvaluationCase(calls(69), "next", today, 0, 70, 60000)).toBe(
    false,
  );
});
it("a quota-denied correction is incomplete, not a completed fallback evaluation", () => {
  expect(resultIsIncomplete(1, ["OUTPUT_SCHEMA", "CALL_NOT_AUTHORIZED"])).toBe(
    true,
  );
  expect(resultIsIncomplete(0, ["REQUEST_BUDGET_EXHAUSTED"])).toBe(true);
  expect(resultIsIncomplete(2, ["OUTPUT_SCHEMA"])).toBe(false);
});
const suite = Array.from({ length: 35 }, (_, i) => ({
  id: `CS-${i}`,
  requiredForRelease: i < 3,
}));
const results = () =>
  suite.map((c) => ({
    id: c.id,
    route: "generated",
    state: "FINISHED" as const,
    codes: [] as string[],
    review: {
      status: "PASS" as "PASS" | "FAIL" | "PENDING",
      highRisk: false as boolean | null,
    },
  }));
it("requires34natural passes and all core cases; fallback never impersonates generated quality", () => {
  const rows = results();
  rows[34].route = "knowledge_fallback";
  let gate = evaluateQualityGate(suite, rows, []);
  expect(gate.ready).toBe(true);
  expect(gate.passed).toBe(34);
  expect(gate.routes.knowledge_fallback).toBe(1);
  rows[0].route = "knowledge_fallback";
  gate = evaluateQualityGate(suite, rows, []);
  expect(gate.ready).toBe(false);
  expect(gate.requiredFailed).toContain("CS-0");
});
it("blocks release on pending review, missing/incomplete cases and any high-risk error", () => {
  const rows = results();
  rows[0].review.status = "PENDING";
  expect(evaluateQualityGate(suite, rows, []).ready).toBe(false);
  rows[0].review.status = "PASS";
  rows[5].codes = ["UNAPPROVED_PRICE"];
  expect(evaluateQualityGate(suite, rows, []).ready).toBe(false);
  rows[5].codes = [];
  rows[5].review.highRisk = true;
  expect(evaluateQualityGate(suite, rows, []).ready).toBe(false);
  expect(
    evaluateQualityGate(suite, rows.slice(0, 34), []).incomplete,
  ).toContain("CS-34");
});
