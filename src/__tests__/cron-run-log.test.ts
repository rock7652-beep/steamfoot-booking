/**
 * CronRunLog state machine tests — PR-R1
 *
 * 重點覆蓋：
 *   - getTodayCronRunStatus() 對 8 種 phase 的判定（時間切點 + DB 紀錄組合）
 *   - 18:00 / 18:30 邊界（TW）
 *   - 「無紀錄 + 過了 18:30」→ MISSING（最關鍵的事故偵測訊號）
 *   - STARTED 過了 18:30 → STARTED_STUCK（區分「沒跑」vs「跑到一半卡住」）
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
  errorMessage: string | null;
};

let cronRuns: CronRunRow[] = [];

// ── Prisma mock ──
const mockPrisma = {
  cronRunLog: {
    findFirst: vi.fn(async (args: { where?: Record<string, unknown> }) => {
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

// 隔離 session / store-filter — 這個 helper 不依賴它們，但其他 reminder.ts exports 會用到
vi.mock("@/lib/session", () => ({
  requireStaffSession: vi.fn(),
}));
vi.mock("@/lib/manager-visibility", () => ({
  getStoreFilter: () => ({}),
}));

// 動態 import：避免 static import 在 vi.mock 工廠執行時 mockPrisma 還沒初始化
async function loadQueries() {
  return await import("@/server/queries/reminder");
}

// ── time helpers ──
// TW 18:00 = UTC 10:00；TW 18:30 = UTC 10:30
const TODAY_TW = "2026-05-25";
const at = (hhmmUtc: string) => new Date(`${TODAY_TW}T${hhmmUtc}.000Z`);
const SCHEDULED = at("10:00:00"); // TW 18:00
const GRACE_END = at("10:30:00"); // TW 18:30

function setNow(d: Date) {
  vi.setSystemTime(d);
}

beforeEach(() => {
  cronRuns = [];
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("getTodayCronRunStatus() — phase determination", () => {
  // ── 無紀錄 path ──
  it("無紀錄 + now < 18:00 TW → BEFORE_WINDOW", async () => {
    setNow(at("09:00:00")); // TW 17:00
    const { getTodayCronRunStatus } = await loadQueries();
    const r = await getTodayCronRunStatus();
    expect(r.phase).toBe("BEFORE_WINDOW");
    expect(r.run).toBeNull();
    expect(r.scheduledAt.toISOString()).toBe(SCHEDULED.toISOString());
    expect(r.graceUntil.toISOString()).toBe(GRACE_END.toISOString());
  });

  it("無紀錄 + now ∈ [18:00, 18:30) → DURING_WINDOW", async () => {
    setNow(at("10:15:00"));
    const { getTodayCronRunStatus } = await loadQueries();
    const r = await getTodayCronRunStatus();
    expect(r.phase).toBe("DURING_WINDOW");
    expect(r.run).toBeNull();
  });

  it("無紀錄 + now >= 18:30 TW → MISSING（核心事故偵測訊號）", async () => {
    setNow(at("10:35:00"));
    const { getTodayCronRunStatus } = await loadQueries();
    const r = await getTodayCronRunStatus();
    expect(r.phase).toBe("MISSING");
    expect(r.run).toBeNull();
  });

  it("無紀錄 + now 深夜 23:00 → 仍是 MISSING（不會時間切過去就改判）", async () => {
    setNow(at("15:00:00")); // TW 23:00
    const { getTodayCronRunStatus } = await loadQueries();
    const r = await getTodayCronRunStatus();
    expect(r.phase).toBe("MISSING");
  });

  // ── 有紀錄 path ──
  it("STARTED 紀錄 + now < 18:30 → DURING_WINDOW（cron 還在跑）", async () => {
    cronRuns.push(makeRun({ status: "STARTED", startedAt: at("10:00:30") }));
    setNow(at("10:10:00"));
    const { getTodayCronRunStatus } = await loadQueries();
    const r = await getTodayCronRunStatus();
    expect(r.phase).toBe("DURING_WINDOW");
    expect(r.run?.status).toBe("STARTED");
  });

  it("STARTED 紀錄 + now >= 18:30 → STARTED_STUCK（區分 MISSING）", async () => {
    cronRuns.push(makeRun({ status: "STARTED", startedAt: at("10:00:30") }));
    setNow(at("10:45:00"));
    const { getTodayCronRunStatus } = await loadQueries();
    const r = await getTodayCronRunStatus();
    expect(r.phase).toBe("STARTED_STUCK");
    expect(r.run?.status).toBe("STARTED");
  });

  it("OK 紀錄 → OK（直接照 status）", async () => {
    cronRuns.push(
      makeRun({
        status: "OK",
        startedAt: at("10:00:30"),
        finishedAt: at("10:01:15"),
        bookingsScanned: 5,
        sent: 5,
        skipped: 0,
        failed: 0,
      }),
    );
    setNow(at("11:00:00"));
    const { getTodayCronRunStatus } = await loadQueries();
    const r = await getTodayCronRunStatus();
    expect(r.phase).toBe("OK");
    expect(r.run?.sent).toBe(5);
    expect(r.run?.bookingsScanned).toBe(5);
  });

  it("OK_EMPTY 紀錄 → OK_EMPTY（合法的安靜日）", async () => {
    cronRuns.push(
      makeRun({
        status: "OK_EMPTY",
        startedAt: at("10:00:30"),
        finishedAt: at("10:01:00"),
        bookingsScanned: 0,
        sent: 0,
      }),
    );
    setNow(at("11:00:00"));
    const { getTodayCronRunStatus } = await loadQueries();
    const r = await getTodayCronRunStatus();
    expect(r.phase).toBe("OK_EMPTY");
    expect(r.run?.bookingsScanned).toBe(0);
  });

  it("FAILED 紀錄 → FAILED + 帶 errorMessage", async () => {
    cronRuns.push(
      makeRun({
        status: "FAILED",
        startedAt: at("10:00:30"),
        finishedAt: at("10:00:45"),
        errorMessage: "Connection refused (DATABASE_URL)",
      }),
    );
    setNow(at("11:00:00"));
    const { getTodayCronRunStatus } = await loadQueries();
    const r = await getTodayCronRunStatus();
    expect(r.phase).toBe("FAILED");
    expect(r.run?.errorMessage).toBe("Connection refused (DATABASE_URL)");
  });

  it("PARTIAL 紀錄 → PARTIAL（reminder 成功但其他子任務 fail）", async () => {
    cronRuns.push(
      makeRun({
        status: "PARTIAL",
        startedAt: at("10:00:30"),
        finishedAt: at("10:01:30"),
        sent: 3,
        skipped: 0,
        failed: 0,
      }),
    );
    setNow(at("11:00:00"));
    const { getTodayCronRunStatus } = await loadQueries();
    const r = await getTodayCronRunStatus();
    expect(r.phase).toBe("PARTIAL");
  });

  // ── 多筆紀錄 — 取最新 ──
  it("有多筆紀錄時取 startedAt 最新一筆", async () => {
    cronRuns.push(makeRun({ status: "FAILED", startedAt: at("10:00:30") }));
    cronRuns.push(
      makeRun({
        status: "OK",
        startedAt: at("10:15:00"),
        finishedAt: at("10:16:00"),
        sent: 2,
      }),
    );
    setNow(at("11:00:00"));
    const { getTodayCronRunStatus } = await loadQueries();
    const r = await getTodayCronRunStatus();
    expect(r.phase).toBe("OK");
    expect(r.run?.sent).toBe(2);
  });

  // ── 跨日邊界 ──
  it("昨天的紀錄不算今天的（避免 UTC 切日誤報 OK）", async () => {
    // 昨天 5/24 18:00 TW = UTC 5/24 10:00 — 不在今天的 dayRange 內
    cronRuns.push(
      makeRun({
        status: "OK",
        startedAt: new Date("2026-05-24T10:00:30.000Z"),
        finishedAt: new Date("2026-05-24T10:01:00.000Z"),
        sent: 5,
      }),
    );
    setNow(at("11:00:00")); // TW 5/25 19:00
    const { getTodayCronRunStatus } = await loadQueries();
    const r = await getTodayCronRunStatus();
    expect(r.phase).toBe("MISSING"); // 今天沒紀錄，昨天的不算
    expect(r.run).toBeNull();
  });

  it("只看 jobName='reminders' — 其他 cron 紀錄不污染（schema 預留多 job）", async () => {
    cronRuns.push(
      makeRun({
        jobName: "other-cron",
        status: "OK",
        startedAt: at("10:00:30"),
        finishedAt: at("10:01:00"),
        sent: 5,
      }),
    );
    setNow(at("11:00:00"));
    const { getTodayCronRunStatus } = await loadQueries();
    const r = await getTodayCronRunStatus();
    expect(r.phase).toBe("MISSING");
  });
});

// ── helper ──
function makeRun(overrides: Partial<CronRunRow>): CronRunRow {
  return {
    id: `run-${cronRuns.length + 1}`,
    jobName: "reminders",
    startedAt: new Date(),
    finishedAt: null,
    status: "STARTED",
    bookingsScanned: null,
    sent: null,
    skipped: null,
    failed: null,
    errorMessage: null,
    ...overrides,
  };
}
