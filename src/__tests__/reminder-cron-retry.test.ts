/**
 * decideReminderRetry — gate decision table tests (PR-R2-A)
 *
 * 覆蓋：
 *   - 7-case retry gate decision table（無紀錄 / OK / OK_EMPTY / PARTIAL / FAILED /
 *     STARTED>5min / STARTED≤5min）
 *   - 5-min STUCK_THRESHOLD 邊界（恰好 5 min → noop；5 min+1ms → retry）
 *   - 只看今日 reminders job（昨日 row / 別 jobName row 都不該影響判定）
 *   - 同日多筆時取最新 startedAt
 *
 * Engine-level dedup（"18:00 已 SENT，18:30 engine 重跑 → sent=0 skipped=N"）由
 * src/__tests__/reminder-engine.test.ts 的 idempotent 測試覆蓋；本 PR 的 retry
 * 安全性 = (gate 阻擋無謂重跑) + (engine 已有 dedup) 兩層的乘積，這裡只負責測前者。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { CronRunStatus } from "@prisma/client";

type CronRunRow = {
  id: string;
  jobName: string;
  startedAt: Date;
  status: CronRunStatus;
};

let cronRuns: CronRunRow[] = [];

const mockPrisma = {
  cronRunLog: {
    findFirst: vi.fn(async (args: {
      where?: Record<string, unknown>;
      orderBy?: Record<string, unknown>;
    }) => {
      const where = args.where ?? {};
      const matched = cronRuns.filter((r) => {
        if (where.jobName && r.jobName !== where.jobName) return false;
        const sf = where.startedAt as { gte?: Date; lte?: Date } | undefined;
        if (sf?.gte && r.startedAt < sf.gte) return false;
        if (sf?.lte && r.startedAt > sf.lte) return false;
        return true;
      });
      // helper always uses orderBy startedAt desc
      matched.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
      return matched[0] ?? null;
    }),
  },
};

vi.mock("@/lib/db", () => ({ prisma: mockPrisma }));

async function loadHelper() {
  return await import("@/server/reminder-cron-retry");
}

// TW 18:30 = UTC 10:30. Use a fixed date for deterministic boundary math.
const TODAY_TW = "2026-06-06";
const at = (hhmmss: string) => new Date(`${TODAY_TW}T${hhmmss}.000Z`);
const RETRY_TIME = at("10:30:00"); // TW 18:30

function setNow(d: Date) {
  vi.setSystemTime(d);
}

beforeEach(() => {
  cronRuns = [];
  vi.useFakeTimers();
  setNow(RETRY_TIME);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("decideReminderRetry — 7-case decision table", () => {
  it("no prior CronRunLog today → retry (NO_PRIOR_RUN)", async () => {
    const { decideReminderRetry } = await loadHelper();
    const decision = await decideReminderRetry();
    expect(decision.action).toBe("retry");
    if (decision.action === "retry") {
      expect(decision.reason).toBe("NO_PRIOR_RUN");
      expect(decision.retryOf).toBeNull();
    }
  });

  it("latest row OK → noop (ALREADY_OK)", async () => {
    cronRuns.push({
      id: "row-ok",
      jobName: "reminders",
      startedAt: at("10:00:00"),
      status: "OK" as CronRunStatus,
    });
    const { decideReminderRetry } = await loadHelper();
    const decision = await decideReminderRetry();
    expect(decision.action).toBe("noop");
    if (decision.action === "noop") {
      expect(decision.reason).toBe("ALREADY_OK");
      expect(decision.latestRunId).toBe("row-ok");
    }
  });

  it("latest row OK_EMPTY → noop (ALREADY_OK_EMPTY)", async () => {
    cronRuns.push({
      id: "row-empty",
      jobName: "reminders",
      startedAt: at("10:00:00"),
      status: "OK_EMPTY" as CronRunStatus,
    });
    const { decideReminderRetry } = await loadHelper();
    const decision = await decideReminderRetry();
    expect(decision.action).toBe("noop");
    if (decision.action === "noop") {
      expect(decision.reason).toBe("ALREADY_OK_EMPTY");
    }
  });

  it("latest row PARTIAL → noop (ALREADY_PARTIAL — engine OK, other tasks failed)", async () => {
    cronRuns.push({
      id: "row-partial",
      jobName: "reminders",
      startedAt: at("10:00:00"),
      status: "PARTIAL" as CronRunStatus,
    });
    const { decideReminderRetry } = await loadHelper();
    const decision = await decideReminderRetry();
    expect(decision.action).toBe("noop");
    if (decision.action === "noop") {
      expect(decision.reason).toBe("ALREADY_PARTIAL");
    }
  });

  it("latest row FAILED → retry (PRIOR_FAILED)", async () => {
    cronRuns.push({
      id: "row-failed",
      jobName: "reminders",
      startedAt: at("10:00:00"),
      status: "FAILED" as CronRunStatus,
    });
    const { decideReminderRetry } = await loadHelper();
    const decision = await decideReminderRetry();
    expect(decision.action).toBe("retry");
    if (decision.action === "retry") {
      expect(decision.reason).toBe("PRIOR_FAILED");
      expect(decision.retryOf).toBe("row-failed");
    }
  });

  it("latest row STARTED > 5min ago → retry (PRIOR_STUCK)", async () => {
    // now = 10:30 UTC; startedAt = 10:00 (30 min ago)
    cronRuns.push({
      id: "row-stuck",
      jobName: "reminders",
      startedAt: at("10:00:00"),
      status: "STARTED" as CronRunStatus,
    });
    const { decideReminderRetry } = await loadHelper();
    const decision = await decideReminderRetry();
    expect(decision.action).toBe("retry");
    if (decision.action === "retry") {
      expect(decision.reason).toBe("PRIOR_STUCK");
      expect(decision.retryOf).toBe("row-stuck");
    }
  });

  it("latest row STARTED ≤ 5min ago → noop (STILL_RUNNING — let primary finish)", async () => {
    // now = 10:30 UTC; startedAt = 10:26 (4 min ago, < 5min threshold)
    cronRuns.push({
      id: "row-running",
      jobName: "reminders",
      startedAt: at("10:26:00"),
      status: "STARTED" as CronRunStatus,
    });
    const { decideReminderRetry } = await loadHelper();
    const decision = await decideReminderRetry();
    expect(decision.action).toBe("noop");
    if (decision.action === "noop") {
      expect(decision.reason).toBe("STILL_RUNNING");
    }
  });
});

describe("decideReminderRetry — 5-min STUCK_THRESHOLD boundary", () => {
  it("STARTED exactly 5 min ago → noop (boundary not inclusive)", async () => {
    // now = 10:30:00 UTC; startedAt = 10:25:00 (exactly 5 min)
    cronRuns.push({
      id: "row-boundary",
      jobName: "reminders",
      startedAt: at("10:25:00"),
      status: "STARTED" as CronRunStatus,
    });
    const { decideReminderRetry } = await loadHelper();
    const decision = await decideReminderRetry();
    expect(decision.action).toBe("noop");
    if (decision.action === "noop") {
      expect(decision.reason).toBe("STILL_RUNNING");
    }
  });

  it("STARTED at 5min+1ms ago → retry (just past boundary)", async () => {
    const { STUCK_THRESHOLD_MS, decideReminderRetry } = await loadHelper();
    const start = new Date(RETRY_TIME.getTime() - STUCK_THRESHOLD_MS - 1);
    cronRuns.push({
      id: "row-just-past",
      jobName: "reminders",
      startedAt: start,
      status: "STARTED" as CronRunStatus,
    });
    const decision = await decideReminderRetry();
    expect(decision.action).toBe("retry");
    if (decision.action === "retry") {
      expect(decision.reason).toBe("PRIOR_STUCK");
    }
  });
});

describe("decideReminderRetry — window + jobName filters", () => {
  it("yesterday's OK row → still retry today (NO_PRIOR_RUN)", async () => {
    cronRuns.push({
      id: "yesterday-ok",
      jobName: "reminders",
      startedAt: new Date("2026-06-05T10:00:00.000Z"),
      status: "OK" as CronRunStatus,
    });
    const { decideReminderRetry } = await loadHelper();
    const decision = await decideReminderRetry();
    expect(decision.action).toBe("retry");
    if (decision.action === "retry") {
      expect(decision.reason).toBe("NO_PRIOR_RUN");
    }
  });

  it("today's row with different jobName → ignored", async () => {
    cronRuns.push({
      id: "other-job",
      jobName: "some-other-cron",
      startedAt: at("10:00:00"),
      status: "OK" as CronRunStatus,
    });
    const { decideReminderRetry } = await loadHelper();
    const decision = await decideReminderRetry();
    expect(decision.action).toBe("retry");
    if (decision.action === "retry") {
      expect(decision.reason).toBe("NO_PRIOR_RUN");
    }
  });

  it("multiple reminders rows today → uses latest startedAt", async () => {
    cronRuns.push({
      id: "earlier-failed",
      jobName: "reminders",
      startedAt: at("10:00:00"),
      status: "FAILED" as CronRunStatus,
    });
    cronRuns.push({
      id: "later-ok",
      jobName: "reminders",
      startedAt: at("10:15:00"),
      status: "OK" as CronRunStatus,
    });
    const { decideReminderRetry } = await loadHelper();
    const decision = await decideReminderRetry();
    expect(decision.action).toBe("noop");
    if (decision.action === "noop") {
      expect(decision.reason).toBe("ALREADY_OK");
      expect(decision.latestRunId).toBe("later-ok");
    }
  });

  it("multiple rows today, latest is FAILED retry-of-earlier-OK → still retry", async () => {
    // Edge case: should not happen in practice (gate prevents retry-after-OK),
    // but if a bad actor wrote a FAILED row later, gate still bows to "latest"
    cronRuns.push({
      id: "earlier-ok",
      jobName: "reminders",
      startedAt: at("10:00:00"),
      status: "OK" as CronRunStatus,
    });
    cronRuns.push({
      id: "later-failed",
      jobName: "reminders",
      startedAt: at("10:15:00"),
      status: "FAILED" as CronRunStatus,
    });
    const { decideReminderRetry } = await loadHelper();
    const decision = await decideReminderRetry();
    expect(decision.action).toBe("retry");
    if (decision.action === "retry") {
      expect(decision.reason).toBe("PRIOR_FAILED");
      expect(decision.retryOf).toBe("later-failed");
    }
  });
});

describe("computeRetryStatus — terminal status invariant", () => {
  it("engine throw (errorMessage set) → FAILED, regardless of result", async () => {
    const { computeRetryStatus } = await loadHelper();
    expect(computeRetryStatus(null, "DB connection refused")).toBe("FAILED");
    expect(
      computeRetryStatus({ total: 6, sent: 0, failed: 0 }, "boom"),
    ).toBe("FAILED");
  });

  it("result null + no error → OK_EMPTY (defensive)", async () => {
    const { computeRetryStatus } = await loadHelper();
    expect(computeRetryStatus(null, null)).toBe("OK_EMPTY");
  });

  it("total === 0 → OK_EMPTY (engine 真的沒掃到 eligible booking)", async () => {
    const { computeRetryStatus } = await loadHelper();
    expect(
      computeRetryStatus({ total: 0, sent: 0, failed: 0 }, null),
    ).toBe("OK_EMPTY");
  });

  it("total>0 sent=0 skipped=N failed=0 → OK (NOT OK_EMPTY — invariant 核心)", async () => {
    // 場景：主 cron 已發完 6 筆，retry 跑 engine 全 dedupe skip。
    // 若誤標 OK_EMPTY，audit 會誤判「今天沒 eligible booking」，掩蓋主 cron
    // 其實有成功的事實。invariant：OK_EMPTY 只能用在 total === 0。
    const { computeRetryStatus } = await loadHelper();
    expect(
      computeRetryStatus({ total: 6, sent: 0, failed: 0 }, null),
    ).toBe("OK");
  });

  it("total>0 sent=N failed=0 → OK (一般成功情境)", async () => {
    const { computeRetryStatus } = await loadHelper();
    expect(
      computeRetryStatus({ total: 6, sent: 6, failed: 0 }, null),
    ).toBe("OK");
  });

  it("total>0 sent=部分 failed=部分 → FAILED，讓 backup cron 重試", async () => {
    const { computeRetryStatus } = await loadHelper();
    expect(
      computeRetryStatus({ total: 6, sent: 3, failed: 3 }, null),
    ).toBe("FAILED");
  });
});
