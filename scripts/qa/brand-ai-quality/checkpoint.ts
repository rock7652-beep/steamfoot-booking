/** Evaluation scheduling only; no Production state, credentials or model transport. */
export const DEVELOPMENT_DAILY_LIMIT = 100;
export const HIGH_RISK_CODES = new Set([
  "UNAPPROVED_PRICE",
  "PLAN_PRICE_MISMATCH",
  "UNVERIFIABLE_PRICE",
  "MISSING_SUBSCRIPTION_TERM",
  "UNAPPROVED_TERMS",
  "UNAPPROVED_URL",
  "UNVERIFIED_REFUND_POLICY",
  "PRIVATE_DATA",
  "OPERATION_CLAIM",
  "UNAVAILABLE_SERVICE_PROMISE",
  "UNSUPPORTED_CLAIM",
]);
export type EvaluationCall = { id: string; attempt: number; day: string };
export type EvaluationResult = {
  id: string;
  route: string;
  state: "FINISHED" | "INCOMPLETE";
  review?: { status: "PENDING" | "PASS" | "FAIL"; highRisk: boolean | null };
  codes: string[];
};
export function canStartEvaluationCase(
  calls: EvaluationCall[],
  id: string,
  day: string,
  baseline: number,
  max: number,
  untilDayEndMs: number,
) {
  // Reserve scheduling capacity for both possible calls without charging unused slots.
  return (
    !calls.some((c) => c.id === id) &&
    calls.length + 2 <= max &&
    calls.filter((c) => c.day === day).length + baseline + 2 <= DEVELOPMENT_DAILY_LIMIT &&
    untilDayEndMs >= 15000
  );
}
export function resultIsIncomplete(attempts: number, codes: string[]) {
  return (
    attempts === 0 ||
    codes.includes("CALL_NOT_AUTHORIZED") ||
    codes.includes("AUTHORIZATION_ERROR")
  );
}
export function evaluateQualityGate(
  cases: { id: string; requiredForRelease?: boolean }[],
  results: EvaluationResult[],
  calls: EvaluationCall[],
) {
  const byId = new Map(results.map((row) => [row.id, row]));
  const incomplete = cases
    .filter(
      (row) => !byId.has(row.id) || byId.get(row.id)!.state !== "FINISHED",
    )
    .map((row) => row.id);
  const pending = cases
    .filter(
      (row) =>
        !byId.get(row.id)?.review ||
        byId.get(row.id)!.review!.status === "PENDING" ||
        byId.get(row.id)!.review!.highRisk === null,
    )
    .map((row) => row.id);
  const risk = results
    .filter(
      (row) =>
        row.review?.highRisk === true ||
        row.codes.some((code) => HIGH_RISK_CODES.has(code)),
    )
    .map((row) => row.id);
  const pass = (id: string) => {
    const row = byId.get(id);
    return (
      row?.state === "FINISHED" &&
      ["generated", "repaired"].includes(row.route) &&
      row.review?.status === "PASS" &&
      row.review.highRisk === false
    );
  };
  const passed = cases.filter((row) => pass(row.id)).length;
  const requiredFailed = cases
    .filter((row) => row.requiredForRelease && !pass(row.id))
    .map((row) => row.id);
  const perCaseLimitExceeded = cases.some(
    (row) => calls.filter((c) => c.id === row.id).length > 2,
  );
  return {
    ready:
      incomplete.length === 0 &&
      pending.length === 0 &&
      risk.length === 0 &&
      requiredFailed.length === 0 &&
      passed >= 34 &&
      !perCaseLimitExceeded,
    passed,
    total: cases.length,
    incomplete,
    pending,
    risk,
    requiredFailed,
    perCaseLimitExceeded,
    routes: Object.fromEntries(
      ["generated", "repaired", "knowledge_fallback", "uncertain"].map(
        (route) => [route, results.filter((row) => row.state === "FINISHED" && row.route === route).length],
      ),
    ),
  };
}
