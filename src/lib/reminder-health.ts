export type ReminderHealthPhase =
  | "BEFORE_WINDOW"
  | "DURING_WINDOW"
  | "OK"
  | "OK_EMPTY"
  | "PARTIAL"
  | "FAILED"
  | "MISSING"
  | "STARTED_STUCK";

export type ReminderHealthStatus =
  | "DISABLED"
  | "WAITING"
  | "HEALTHY"
  | "NEEDS_ATTENTION"
  | "NO_RECORDS"
  | "SCHEDULE_ERROR";

export function classifyReminderHealth(input: {
  enabled: boolean;
  phase: ReminderHealthPhase;
  sent: number;
  skipped: number;
  failed: number;
}): ReminderHealthStatus {
  if (!input.enabled) return "DISABLED";
  if (["FAILED", "MISSING", "STARTED_STUCK"].includes(input.phase)) {
    return "SCHEDULE_ERROR";
  }
  if (["BEFORE_WINDOW", "DURING_WINDOW"].includes(input.phase)) return "WAITING";
  if (input.failed > 0 || input.skipped > 0 || input.phase === "PARTIAL") {
    return "NEEDS_ATTENTION";
  }
  if (input.sent > 0) return "HEALTHY";
  return "NO_RECORDS";
}
