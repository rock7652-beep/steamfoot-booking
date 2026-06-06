/**
 * checkReminderCronHealth — verdict matrix tests (PR-R2-B)
 *
 * 覆蓋：
 *   - 7-case verdict matrix:
 *       無 row → unhealthy_no_run / NO_RUN_TODAY
 *       OK / OK_EMPTY / PARTIAL → healthy
 *       FAILED → unhealthy_with_run / FAILED
 *       STARTED > 5min → unhealthy_with_run / STARTED_STUCK
 *       STARTED ≤ 5min → running
 *   - 5-min boundary (恰好 5 min → running；5min+1ms → STARTED_STUCK)
 *   - jobName filter（別 job 不污染）
 *   - 今日 TW 邊界（昨日 row 不算）
 *   - 多筆同日 → 取最新 startedAt
 *   - run summary 不含敏感資料（純讀 schema 確認 select 只挑計數字段）
 *
 * Route 層的 auth + JSON shaping 不在本檔範圍 — 那是 integration 行為，
 * pure helper 只負責 verdict 邏輯。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { CronRunStatus } from "@prisma/client";

type CronRunRow = {
  id: string;
  jobName: string;
  startedAt: Date;
  finishedAt: Date | null;
  status: CronRunStatus;
  bookingsScanned: number | null;
  sent: number | null;
  skipped: number | null;
  failed: number | null;
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
      matched.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
      return matched[0] ?? null;
    }),
  },
};

vi.mock("@/lib/db", () => ({ prisma: mockPrisma }));

async function loadHelper() {
  return await import("@/server/reminder-cron-health");
}

// TW 19:00 = UTC 11:00. External healthcheck 預設觸發時間
const TODAY_TW = "2026-06-06";
const at = (hhmmss: string) => new Date(`${TODAY_TW}T${hhmmss}.000Z`);
const PROBE_TIME = at("11:00:00"); // TW 19:00

function setNow(d: Date) {
  vi.setSystemTime(d);
}

beforeEach(() => {
  cronRuns = [];
  vi.useFakeTimers();
  setNow(PROBE_TIME);
});

afterEach(() => {
  vi.useRealTimers();
});

function pushRun(partial: Partial<CronRunRow> & { id: string; status: CronRunStatus; startedAt: Date }) {
  cronRuns.push({
    jobName: "reminders",
    finishedAt: null,
    bookingsScanned: null,
    sent: null,
    skipped: null,
    failed: null,
    ...partial,
  });
}

describe("checkReminderCronHealth — 7-case verdict matrix", () => {
  it("no row today → unhealthy_no_run / NO_RUN_TODAY", async () => {
    const { checkReminderCronHealth } = await loadHelper();
    const { verdict, dateTW } = await checkReminderCronHealth();
    expect(dateTW).toBe(TODAY_TW);
    expect(verdict.kind).toBe("unhealthy_no_run");
    if (verdict.kind === "unhealthy_no_run") {
      expect(verdict.reason).toBe("NO_RUN_TODAY");
    }
  });

  it("OK → healthy", async () => {
    pushRun({
      id: "r-ok",
      status: "OK" as CronRunStatus,
      startedAt: at("10:00:00"),
      finishedAt: at("10:00:30"),
      bookingsScanned: 6,
      sent: 6,
      skipped: 0,
      failed: 0,
    });
    const { checkReminderCronHealth } = await loadHelper();
    const { verdict } = await checkReminderCronHealth();
    expect(verdict.kind).toBe("healthy");
    if (verdict.kind === "healthy") {
      expect(verdict.run.status).toBe("OK");
      expect(verdict.run.sent).toBe(6);
    }
  });

  it("OK_EMPTY → healthy", async () => {
    pushRun({
      id: "r-empty",
      status: "OK_EMPTY" as CronRunStatus,
      startedAt: at("10:00:00"),
      finishedAt: at("10:00:30"),
      bookingsScanned: 0,
      sent: 0,
      skipped: 0,
      failed: 0,
    });
    const { checkReminderCronHealth } = await loadHelper();
    const { verdict } = await checkReminderCronHealth();
    expect(verdict.kind).toBe("healthy");
  });

  it("PARTIAL → healthy (reminders 子任務 OK，其他子任務失敗不算 unhealthy)", async () => {
    pushRun({
      id: "r-partial",
      status: "PARTIAL" as CronRunStatus,
      startedAt: at("10:00:00"),
      finishedAt: at("10:00:30"),
      bookingsScanned: 6,
      sent: 6,
    });
    const { checkReminderCronHealth } = await loadHelper();
    const { verdict } = await checkReminderCronHealth();
    expect(verdict.kind).toBe("healthy");
  });

  it("FAILED → unhealthy_with_run / FAILED", async () => {
    pushRun({
      id: "r-failed",
      status: "FAILED" as CronRunStatus,
      startedAt: at("10:00:00"),
      finishedAt: at("10:00:10"),
    });
    const { checkReminderCronHealth } = await loadHelper();
    const { verdict } = await checkReminderCronHealth();
    expect(verdict.kind).toBe("unhealthy_with_run");
    if (verdict.kind === "unhealthy_with_run") {
      expect(verdict.reason).toBe("FAILED");
      expect(verdict.run.status).toBe("FAILED");
    }
  });

  it("STARTED > 5min ago → unhealthy_with_run / STARTED_STUCK", async () => {
    // PROBE_TIME = 11:00 UTC; startedAt = 10:00 (60 min ago)
    pushRun({
      id: "r-stuck",
      status: "STARTED" as CronRunStatus,
      startedAt: at("10:00:00"),
      finishedAt: null,
    });
    const { checkReminderCronHealth } = await loadHelper();
    const { verdict } = await checkReminderCronHealth();
    expect(verdict.kind).toBe("unhealthy_with_run");
    if (verdict.kind === "unhealthy_with_run") {
      expect(verdict.reason).toBe("STARTED_STUCK");
    }
  });

  it("STARTED ≤ 5min ago → running (healthy but flagged)", async () => {
    // PROBE_TIME = 11:00 UTC; startedAt = 10:58 (2 min ago)
    pushRun({
      id: "r-running",
      status: "STARTED" as CronRunStatus,
      startedAt: at("10:58:00"),
      finishedAt: null,
    });
    const { checkReminderCronHealth } = await loadHelper();
    const { verdict } = await checkReminderCronHealth();
    expect(verdict.kind).toBe("running");
    if (verdict.kind === "running") {
      expect(verdict.run.status).toBe("STARTED");
    }
  });
});

describe("checkReminderCronHealth — 5-min boundary (matches retry STUCK_THRESHOLD)", () => {
  it("STARTED exactly 5 min ago → running (boundary not inclusive)", async () => {
    // PROBE_TIME = 11:00:00 UTC; startedAt = 10:55:00 (exactly 5 min)
    pushRun({
      id: "r-boundary",
      status: "STARTED" as CronRunStatus,
      startedAt: at("10:55:00"),
      finishedAt: null,
    });
    const { checkReminderCronHealth } = await loadHelper();
    const { verdict } = await checkReminderCronHealth();
    expect(verdict.kind).toBe("running");
  });

  it("STARTED at 5min+1ms → STARTED_STUCK (just past boundary)", async () => {
    const { HEALTH_STUCK_THRESHOLD_MS, checkReminderCronHealth } = await loadHelper();
    const start = new Date(PROBE_TIME.getTime() - HEALTH_STUCK_THRESHOLD_MS - 1);
    pushRun({
      id: "r-just-past",
      status: "STARTED" as CronRunStatus,
      startedAt: start,
      finishedAt: null,
    });
    const { verdict } = await checkReminderCronHealth();
    expect(verdict.kind).toBe("unhealthy_with_run");
    if (verdict.kind === "unhealthy_with_run") {
      expect(verdict.reason).toBe("STARTED_STUCK");
    }
  });
});

describe("checkReminderCronHealth — window + jobName filters", () => {
  it("yesterday's OK row → today still NO_RUN_TODAY", async () => {
    pushRun({
      id: "yesterday-ok",
      status: "OK" as CronRunStatus,
      startedAt: new Date("2026-06-05T10:00:00.000Z"),
      finishedAt: new Date("2026-06-05T10:00:30.000Z"),
    });
    const { checkReminderCronHealth } = await loadHelper();
    const { verdict } = await checkReminderCronHealth();
    expect(verdict.kind).toBe("unhealthy_no_run");
  });

  it("today's row with different jobName → ignored", async () => {
    pushRun({
      id: "other-job",
      jobName: "some-other-cron",
      status: "OK" as CronRunStatus,
      startedAt: at("10:00:00"),
      finishedAt: at("10:00:30"),
    });
    const { checkReminderCronHealth } = await loadHelper();
    const { verdict } = await checkReminderCronHealth();
    expect(verdict.kind).toBe("unhealthy_no_run");
  });

  it("multiple reminders rows today → uses latest startedAt (retry case)", async () => {
    // 18:00 primary cron failed
    pushRun({
      id: "primary-failed",
      status: "FAILED" as CronRunStatus,
      startedAt: at("10:00:00"),
      finishedAt: at("10:00:10"),
    });
    // 18:30 retry succeeded
    pushRun({
      id: "retry-ok",
      status: "OK" as CronRunStatus,
      startedAt: at("10:30:00"),
      finishedAt: at("10:30:20"),
      bookingsScanned: 6,
      sent: 6,
    });
    const { checkReminderCronHealth } = await loadHelper();
    const { verdict } = await checkReminderCronHealth();
    // Latest = retry-ok → healthy
    expect(verdict.kind).toBe("healthy");
    if (verdict.kind === "healthy") {
      expect(verdict.run.sent).toBe(6);
    }
  });

  it("dateTW reflects 'now' in TW (UTC+8), not UTC", async () => {
    // PROBE_TIME = 2026-06-06T11:00:00.000Z → TW 2026-06-06 19:00 → dateTW = "2026-06-06"
    const { checkReminderCronHealth } = await loadHelper();
    const { dateTW } = await checkReminderCronHealth();
    expect(dateTW).toBe("2026-06-06");
  });
});

describe("checkReminderCronHealth — run summary safety", () => {
  it("run summary only contains counts + timestamps + status, no PII", async () => {
    pushRun({
      id: "r-pii-check",
      status: "OK" as CronRunStatus,
      startedAt: at("10:00:00"),
      finishedAt: at("10:00:30"),
      bookingsScanned: 6,
      sent: 6,
      skipped: 0,
      failed: 0,
    });
    const { checkReminderCronHealth } = await loadHelper();
    const { verdict } = await checkReminderCronHealth();
    expect(verdict.kind).toBe("healthy");
    if (verdict.kind === "healthy") {
      const keys = Object.keys(verdict.run).sort();
      expect(keys).toEqual([
        "bookingsScanned",
        "failed",
        "finishedAt",
        "sent",
        "skipped",
        "startedAt",
        "status",
      ]);
    }
  });

  it("startedAt / finishedAt serialised as ISO strings (JSON-safe)", async () => {
    pushRun({
      id: "r-iso",
      status: "OK" as CronRunStatus,
      startedAt: at("10:00:00"),
      finishedAt: at("10:00:30"),
    });
    const { checkReminderCronHealth } = await loadHelper();
    const { verdict } = await checkReminderCronHealth();
    if (verdict.kind === "healthy") {
      expect(typeof verdict.run.startedAt).toBe("string");
      expect(verdict.run.startedAt).toMatch(/Z$/);
      expect(typeof verdict.run.finishedAt).toBe("string");
    }
  });

  it("finishedAt is null when CronRunLog row hasn't finished", async () => {
    pushRun({
      id: "r-unfinished",
      status: "STARTED" as CronRunStatus,
      startedAt: at("10:58:00"),
      finishedAt: null,
    });
    const { checkReminderCronHealth } = await loadHelper();
    const { verdict } = await checkReminderCronHealth();
    if (verdict.kind === "running") {
      expect(verdict.run.finishedAt).toBeNull();
    }
  });
});
