/**
 * wallet-session service — 狀態機與 invariant 測試
 *
 * 用最薄的 in-memory Prisma transaction mock 驗證：
 *   1. seed → N 個 AVAILABLE rows
 *   2. allocate → AVAILABLE → RESERVED；同 wallet 多次 allocate 取最小 sessionNo
 *   3. release → RESERVED → AVAILABLE
 *   4. complete → RESERVED → COMPLETED；uncomplete 反向
 *   5. void → AVAILABLE → VOIDED；其他狀態拒絕
 *   6. invariant：refreshWalletCounter 後 wallet.remainingSessions == count(AVAILABLE) + count(RESERVED)
 *   7. reconcile: 增加堂數補 AVAILABLE / 減少堂數 void 多餘 / 不可低於 RESERVED
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  seedWalletSessions,
  allocateSession,
  releaseSession,
  completeSession,
  uncompleteSession,
  allocateSessions,
  releaseSessions,
  completeSessions,
  uncompleteSessions,
  reReserveSessions,
  voidAvailableSession,
  reconcileForManualAdjust,
  backfillAvailableSessions,
  WalletSessionError,
} from "@/server/services/wallet-session";

// ────────────────────────────────────────────────
// In-memory Prisma transaction mock (only what's needed)
// ────────────────────────────────────────────────

type SessionStatus = "AVAILABLE" | "RESERVED" | "COMPLETED" | "VOIDED" | "BACKFILLED";

interface SessionRow {
  id: string;
  walletId: string;
  sessionNo: number;
  status: SessionStatus;
  bookingId: string | null;
  reservedAt: Date | null;
  completedAt: Date | null;
  voidedAt: Date | null;
  voidReason: string | null;
  voidedByStaffId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface WalletRow {
  id: string;
  remainingSessions: number;
  status: "ACTIVE" | "USED_UP" | "EXPIRED" | "CANCELLED";
}

function makeTx(initialWallets: WalletRow[]) {
  const sessions: SessionRow[] = [];
  const wallets: WalletRow[] = initialWallets.map((w) => ({ ...w }));
  let idSeq = 0;
  const nextId = () => `s${++idSeq}`;

  const matches = (row: SessionRow, where: Record<string, unknown>): boolean => {
    const r = row as unknown as Record<string, unknown>;
    for (const [k, v] of Object.entries(where)) {
      if (k === "id" && typeof v === "object" && v !== null && "in" in (v as Record<string, unknown>)) {
        if (!(v as { in: string[] }).in.includes(row.id)) return false;
      } else if (r[k] !== v) {
        return false;
      }
    }
    return true;
  };

  const filterByOrder = (
    rows: SessionRow[],
    orderBy?: { sessionNo?: "asc" | "desc" }
  ): SessionRow[] => {
    if (!orderBy?.sessionNo) return rows;
    const dir = orderBy.sessionNo === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => (a.sessionNo - b.sessionNo) * dir);
  };

  const tx = {
    walletSession: {
      createMany: async ({ data }: { data: Array<Partial<SessionRow>> }) => {
        const list = Array.isArray(data) ? data : [data];
        for (const d of list) {
          sessions.push({
            id: nextId(),
            walletId: d.walletId!,
            sessionNo: d.sessionNo!,
            status: (d.status ?? "AVAILABLE") as SessionStatus,
            bookingId: d.bookingId ?? null,
            reservedAt: d.reservedAt ?? null,
            completedAt: d.completedAt ?? null,
            voidedAt: d.voidedAt ?? null,
            voidReason: d.voidReason ?? null,
            voidedByStaffId: d.voidedByStaffId ?? null,
            createdAt: new Date(),
            updatedAt: new Date(),
          });
        }
        return { count: list.length };
      },
      findFirst: async (args: { where: Record<string, unknown>; orderBy?: { sessionNo?: "asc" | "desc" } }) => {
        const matching = sessions.filter((s) => matches(s, args.where));
        const ordered = filterByOrder(matching, args.orderBy);
        return ordered[0] ?? null;
      },
      findMany: async (args: {
        where?: Record<string, unknown>;
        orderBy?: { sessionNo?: "asc" | "desc" };
        take?: number;
      }) => {
        const matching = args.where ? sessions.filter((s) => matches(s, args.where!)) : sessions;
        const ordered = filterByOrder(matching, args.orderBy);
        return typeof args.take === "number" ? ordered.slice(0, args.take) : ordered;
      },
      findUnique: async (args: { where: { id: string } }) => {
        return sessions.find((s) => s.id === args.where.id) ?? null;
      },
      update: async (args: { where: { id: string }; data: Partial<SessionRow> }) => {
        const row = sessions.find((s) => s.id === args.where.id);
        if (!row) throw new Error("not found");
        Object.assign(row, args.data, { updatedAt: new Date() });
        return row;
      },
      updateMany: async (args: { where: Record<string, unknown>; data: Partial<SessionRow> }) => {
        const matching = sessions.filter((s) => matches(s, args.where));
        for (const r of matching) Object.assign(r, args.data, { updatedAt: new Date() });
        return { count: matching.length };
      },
      groupBy: async (args: {
        by: ["status"];
        where: { walletId: string };
        _count: { _all: true };
      }) => {
        const filtered = sessions.filter((s) => s.walletId === args.where.walletId);
        const map = new Map<SessionStatus, number>();
        for (const s of filtered) map.set(s.status, (map.get(s.status) ?? 0) + 1);
        return [...map.entries()].map(([status, count]) => ({
          status,
          _count: { _all: count },
        }));
      },
    },
    customerPlanWallet: {
      findUnique: async (args: { where: { id: string }; select?: unknown }) => {
        const w = wallets.find((x) => x.id === args.where.id);
        return w ?? null;
      },
      update: async (args: { where: { id: string }; data: Partial<WalletRow> }) => {
        const w = wallets.find((x) => x.id === args.where.id);
        if (!w) throw new Error("not found");
        Object.assign(w, args.data);
        return w;
      },
    },
    _wallets: wallets,
    _sessions: sessions,
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return tx as any;
}

const W = "wallet-1";

function invariant(tx: ReturnType<typeof makeTx>) {
  const wallet = tx._wallets.find((w: WalletRow) => w.id === W)!;
  const available = tx._sessions.filter((s: SessionRow) => s.walletId === W && s.status === "AVAILABLE").length;
  const reserved = tx._sessions.filter((s: SessionRow) => s.walletId === W && s.status === "RESERVED").length;
  return { remaining: wallet.remainingSessions, available, reserved };
}

// ────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────

describe("wallet-session service", () => {
  let tx: ReturnType<typeof makeTx>;

  beforeEach(() => {
    tx = makeTx([{ id: W, remainingSessions: 0, status: "ACTIVE" }]);
  });

  it("seedWalletSessions creates N AVAILABLE rows numbered 1..N", async () => {
    await seedWalletSessions(tx, W, 5);
    expect(tx._sessions).toHaveLength(5);
    expect(tx._sessions.map((s: SessionRow) => s.sessionNo)).toEqual([1, 2, 3, 4, 5]);
    expect(tx._sessions.every((s: SessionRow) => s.status === "AVAILABLE")).toBe(true);
  });

  it("allocateSession picks smallest sessionNo and refreshes counter", async () => {
    await seedWalletSessions(tx, W, 3);
    // seed 不刷 counter（呼叫端負責），測試前手動設一致
    tx._wallets[0].remainingSessions = 3;

    const s1 = await allocateSession(tx, W, "booking-A");
    expect(s1?.sessionNo).toBe(1);
    expect(s1?.status).toBe("RESERVED");
    expect(s1?.bookingId).toBe("booking-A");

    const s2 = await allocateSession(tx, W, "booking-B");
    expect(s2?.sessionNo).toBe(2);

    const inv = invariant(tx);
    expect(inv.remaining).toBe(3); // AVAILABLE 1 + RESERVED 2
    expect(inv.available).toBe(1);
    expect(inv.reserved).toBe(2);
  });

  it("allocateSession returns null when no AVAILABLE rows exist (legacy wallet)", async () => {
    // 完全沒 seed → 模擬 backfill 前的舊 wallet
    const result = await allocateSession(tx, W, "booking-X");
    expect(result).toBeNull();
  });

  it("releaseSession reverts RESERVED → AVAILABLE", async () => {
    await seedWalletSessions(tx, W, 2);
    tx._wallets[0].remainingSessions = 2;
    await allocateSession(tx, W, "booking-A");

    const released = await releaseSession(tx, "booking-A");
    expect(released).toBe(true);

    const inv = invariant(tx);
    expect(inv.available).toBe(2);
    expect(inv.reserved).toBe(0);
    expect(inv.remaining).toBe(2);
  });

  it("releaseSession returns false when no matching RESERVED row (no-op for legacy)", async () => {
    const released = await releaseSession(tx, "booking-nonexistent");
    expect(released).toBe(false);
  });

  it("completeSession reverts RESERVED → COMPLETED, decrements counter", async () => {
    await seedWalletSessions(tx, W, 3);
    tx._wallets[0].remainingSessions = 3;
    await allocateSession(tx, W, "booking-A");

    const ok = await completeSession(tx, "booking-A", new Date("2026-04-26"));
    expect(ok).toBe(true);

    const completedRow = tx._sessions.find((s: SessionRow) => s.bookingId === "booking-A");
    expect(completedRow?.status).toBe("COMPLETED");
    expect(completedRow?.completedAt).toBeInstanceOf(Date);

    const inv = invariant(tx);
    expect(inv.remaining).toBe(2); // AVAILABLE 2 + RESERVED 0
  });

  it("uncompleteSession reverts COMPLETED → RESERVED", async () => {
    await seedWalletSessions(tx, W, 2);
    tx._wallets[0].remainingSessions = 2;
    await allocateSession(tx, W, "booking-A");
    await completeSession(tx, "booking-A");

    const ok = await uncompleteSession(tx, "booking-A");
    expect(ok).toBe(true);

    const row = tx._sessions.find((s: SessionRow) => s.bookingId === "booking-A");
    expect(row?.status).toBe("RESERVED");
    expect(row?.completedAt).toBeNull();

    const inv = invariant(tx);
    expect(inv.remaining).toBe(2);
  });

  it("voidAvailableSession marks AVAILABLE → VOIDED + decrements counter", async () => {
    await seedWalletSessions(tx, W, 3);
    tx._wallets[0].remainingSessions = 3;
    const target = tx._sessions.find((s: SessionRow) => s.sessionNo === 3)!;

    const result = await voidAvailableSession(tx, {
      sessionId: target.id,
      voidReason: "顧客退費剩 1 堂",
      voidedByStaffId: "staff-1",
    });

    expect(result.sessionNo).toBe(3);
    expect(target.status).toBe("VOIDED");
    expect(target.voidReason).toBe("顧客退費剩 1 堂");
    expect(target.voidedByStaffId).toBe("staff-1");

    const inv = invariant(tx);
    expect(inv.remaining).toBe(2); // 3 - 1 voided
  });

  it("voidAvailableSession refuses RESERVED row", async () => {
    await seedWalletSessions(tx, W, 2);
    tx._wallets[0].remainingSessions = 2;
    await allocateSession(tx, W, "booking-A");
    const reserved = tx._sessions.find((s: SessionRow) => s.bookingId === "booking-A")!;

    await expect(
      voidAvailableSession(tx, {
        sessionId: reserved.id,
        voidReason: "test",
        voidedByStaffId: "staff-1",
      })
    ).rejects.toThrow(WalletSessionError);
  });

  it("voidAvailableSession refuses COMPLETED row", async () => {
    await seedWalletSessions(tx, W, 1);
    tx._wallets[0].remainingSessions = 1;
    await allocateSession(tx, W, "booking-A");
    await completeSession(tx, "booking-A");
    const done = tx._sessions[0];

    await expect(
      voidAvailableSession(tx, {
        sessionId: done.id,
        voidReason: "test",
        voidedByStaffId: "staff-1",
      })
    ).rejects.toThrow(/已使用/);
  });

  it("voidAvailableSession refuses already-voided row", async () => {
    await seedWalletSessions(tx, W, 1);
    tx._wallets[0].remainingSessions = 1;
    const target = tx._sessions[0];
    await voidAvailableSession(tx, { sessionId: target.id, voidReason: "first", voidedByStaffId: "s" });

    await expect(
      voidAvailableSession(tx, { sessionId: target.id, voidReason: "second", voidedByStaffId: "s" })
    ).rejects.toThrow(/已註銷/);
  });

  it("voidAvailableSession requires non-empty reason", async () => {
    await seedWalletSessions(tx, W, 1);
    tx._wallets[0].remainingSessions = 1;
    const target = tx._sessions[0];

    await expect(
      voidAvailableSession(tx, { sessionId: target.id, voidReason: "   ", voidedByStaffId: "s" })
    ).rejects.toThrow(/原因/);
  });

  it("invariant remainingSessions == AVAILABLE+RESERVED across mixed lifecycle", async () => {
    await seedWalletSessions(tx, W, 5);
    tx._wallets[0].remainingSessions = 5;

    await allocateSession(tx, W, "B1");
    await allocateSession(tx, W, "B2");
    await completeSession(tx, "B1"); // RESERVED → COMPLETED
    await releaseSession(tx, "B2"); // RESERVED → AVAILABLE
    await voidAvailableSession(tx, {
      sessionId: tx._sessions.find((s: SessionRow) => s.sessionNo === 5)!.id,
      voidReason: "退費",
      voidedByStaffId: "s",
    });

    const inv = invariant(tx);
    // 1 COMPLETED, 0 RESERVED, 3 AVAILABLE (sessionNo 2/3/4), 1 VOIDED (sessionNo 5)
    expect(inv.available).toBe(3);
    expect(inv.reserved).toBe(0);
    expect(inv.remaining).toBe(3);
  });

  it("reconcileForManualAdjust adds AVAILABLE rows when increasing", async () => {
    await seedWalletSessions(tx, W, 3);
    tx._wallets[0].remainingSessions = 3;

    await reconcileForManualAdjust(tx, {
      walletId: W,
      newRemaining: 5,
      voidedByStaffId: "s",
    });

    expect(tx._sessions).toHaveLength(5);
    const sessionNos = tx._sessions.map((s: SessionRow) => s.sessionNo).sort((a: number, b: number) => a - b);
    expect(sessionNos).toEqual([1, 2, 3, 4, 5]);
    expect(invariant(tx).remaining).toBe(5);
  });

  it("reconcileForManualAdjust voids excess AVAILABLE when decreasing", async () => {
    await seedWalletSessions(tx, W, 5);
    tx._wallets[0].remainingSessions = 5;

    await reconcileForManualAdjust(tx, {
      walletId: W,
      newRemaining: 2,
      voidedByStaffId: "staff-X",
    });

    const voided = tx._sessions.filter((s: SessionRow) => s.status === "VOIDED");
    expect(voided).toHaveLength(3);
    // 從最大 sessionNo 往回 void
    expect(voided.map((v: SessionRow) => v.sessionNo).sort()).toEqual([3, 4, 5]);
    expect(voided[0].voidReason).toMatch(/管理員手動調整/);
    expect(invariant(tx).remaining).toBe(2);
  });

  it("reconcileForManualAdjust refuses to drop below RESERVED count", async () => {
    await seedWalletSessions(tx, W, 5);
    tx._wallets[0].remainingSessions = 5;
    await allocateSession(tx, W, "B1");
    await allocateSession(tx, W, "B2");
    await allocateSession(tx, W, "B3");
    // now: 3 RESERVED + 2 AVAILABLE

    await expect(
      reconcileForManualAdjust(tx, { walletId: W, newRemaining: 2, voidedByStaffId: "s" })
    ).rejects.toThrow(/已預約/);
  });

  // ──────────────────────────────────────────────
  // backfillAvailableSessions — 補登已使用堂數
  // ──────────────────────────────────────────────

  describe("backfillAvailableSessions", () => {
    const occurredAt = new Date("2026-04-01");

    it("marks N AVAILABLE rows as BACKFILLED with FIFO order", async () => {
      await seedWalletSessions(tx, W, 5);
      tx._wallets[0].remainingSessions = 5;

      const { backfilledSessionNos } = await backfillAvailableSessions(tx, {
        walletId: W,
        count: 3,
        occurredAt,
        reason: "紙本卡轉線上",
        operatorStaffId: "staff-1",
      });

      expect(backfilledSessionNos).toEqual([1, 2, 3]); // FIFO smallest first
      const backfilled = tx._sessions.filter(
        (s: SessionRow) => s.status === "BACKFILLED",
      );
      expect(backfilled).toHaveLength(3);
      for (const s of backfilled) {
        expect(s.completedAt).toEqual(occurredAt);
        expect(s.voidReason).toBe("紙本卡轉線上");
        expect(s.voidedByStaffId).toBe("staff-1");
      }
      const inv = invariant(tx);
      expect(inv.available).toBe(2);
      expect(inv.reserved).toBe(0);
      expect(inv.remaining).toBe(2); // 5 - 3 backfilled
    });

    it("does not touch RESERVED / COMPLETED / VOIDED rows", async () => {
      await seedWalletSessions(tx, W, 5);
      tx._wallets[0].remainingSessions = 5;
      // session 1 → RESERVED via booking-A
      await allocateSession(tx, W, "booking-A");
      // session 2 → COMPLETED via booking-B
      await allocateSession(tx, W, "booking-B");
      await completeSession(tx, "booking-B");
      // session 3 → VOIDED
      const s3 = tx._sessions.find((s: SessionRow) => s.sessionNo === 3)!;
      await voidAvailableSession(tx, {
        sessionId: s3.id,
        voidReason: "test",
        voidedByStaffId: "staff-x",
      });
      // remaining AVAILABLE: sessionNo 4, 5

      const { backfilledSessionNos } = await backfillAvailableSessions(tx, {
        walletId: W,
        count: 2,
        occurredAt,
        reason: "transfer",
        operatorStaffId: "staff-1",
      });

      expect(backfilledSessionNos).toEqual([4, 5]); // skipped RESERVED/COMPLETED/VOIDED
      const reserved = tx._sessions.find((s: SessionRow) => s.sessionNo === 1)!;
      const completed = tx._sessions.find((s: SessionRow) => s.sessionNo === 2)!;
      const voided = tx._sessions.find((s: SessionRow) => s.sessionNo === 3)!;
      expect(reserved.status).toBe("RESERVED");
      expect(completed.status).toBe("COMPLETED");
      expect(voided.status).toBe("VOIDED");
    });

    it("rejects when count > availableCount (protects RESERVED)", async () => {
      await seedWalletSessions(tx, W, 3);
      tx._wallets[0].remainingSessions = 3;
      await allocateSession(tx, W, "booking-A"); // 1 RESERVED, 2 AVAILABLE

      await expect(
        backfillAvailableSessions(tx, {
          walletId: W,
          count: 3, // > 2 available
          occurredAt,
          reason: "x",
          operatorStaffId: "staff-1",
        }),
      ).rejects.toThrow(WalletSessionError);
    });

    it("rejects count <= 0", async () => {
      await seedWalletSessions(tx, W, 3);
      tx._wallets[0].remainingSessions = 3;

      await expect(
        backfillAvailableSessions(tx, {
          walletId: W,
          count: 0,
          occurredAt,
          reason: "x",
          operatorStaffId: "staff-1",
        }),
      ).rejects.toThrow(/正整數/);

      await expect(
        backfillAvailableSessions(tx, {
          walletId: W,
          count: -1,
          occurredAt,
          reason: "x",
          operatorStaffId: "staff-1",
        }),
      ).rejects.toThrow(/正整數/);
    });

    it("rejects empty reason", async () => {
      await seedWalletSessions(tx, W, 3);
      tx._wallets[0].remainingSessions = 3;

      await expect(
        backfillAvailableSessions(tx, {
          walletId: W,
          count: 1,
          occurredAt,
          reason: "   ",
          operatorStaffId: "staff-1",
        }),
      ).rejects.toThrow(/原因/);
    });

    it("flips wallet.status to USED_UP when all available consumed via backfill", async () => {
      await seedWalletSessions(tx, W, 2);
      tx._wallets[0].remainingSessions = 2;

      await backfillAvailableSessions(tx, {
        walletId: W,
        count: 2,
        occurredAt,
        reason: "all used",
        operatorStaffId: "staff-1",
      });

      const inv = invariant(tx);
      expect(inv.remaining).toBe(0);
      expect(tx._wallets[0].status).toBe("USED_UP");
    });
  });

  // ──────────────────────────────────────────────
  // multi-person (people>1) — plural helpers
  // ──────────────────────────────────────────────

  describe("multi-person plural helpers", () => {
    it("allocateSessions reserves N rows for one bookingId, smallest sessionNo first", async () => {
      await seedWalletSessions(tx, W, 5);
      tx._wallets[0].remainingSessions = 5;

      const result = await allocateSessions(tx, W, "booking-A", 2);
      expect(result.allocated).toBe(2);

      const reserved = tx._sessions.filter(
        (s: SessionRow) => s.bookingId === "booking-A",
      );
      expect(reserved).toHaveLength(2);
      expect(reserved.every((s: SessionRow) => s.status === "RESERVED")).toBe(true);
      expect(reserved.map((s: SessionRow) => s.sessionNo).sort()).toEqual([1, 2]);

      const inv = invariant(tx);
      expect(inv.reserved).toBe(2);
      expect(inv.available).toBe(3);
      expect(inv.remaining).toBe(5); // 不變
    });

    it("allocateSessions returns { allocated: 0 } when no AVAILABLE rows (legacy fallback)", async () => {
      const result = await allocateSessions(tx, W, "booking-X", 2);
      expect(result.allocated).toBe(0);
    });

    it("allocateSessions throws WalletSessionError if can only partially fill", async () => {
      await seedWalletSessions(tx, W, 1); // 只有 1 堂 AVAILABLE
      tx._wallets[0].remainingSessions = 1;

      await expect(allocateSessions(tx, W, "booking-A", 2)).rejects.toThrow(
        WalletSessionError,
      );
    });

    it("allocateSessions rejects count <= 0", async () => {
      await seedWalletSessions(tx, W, 5);
      tx._wallets[0].remainingSessions = 5;

      await expect(allocateSessions(tx, W, "booking-A", 0)).rejects.toThrow(
        /正整數/,
      );
      await expect(allocateSessions(tx, W, "booking-A", -1)).rejects.toThrow(
        /正整數/,
      );
    });

    it("completeSessions marks ALL RESERVED rows for the booking as COMPLETED", async () => {
      await seedWalletSessions(tx, W, 5);
      tx._wallets[0].remainingSessions = 5;
      await allocateSessions(tx, W, "booking-multi", 3);

      const result = await completeSessions(
        tx,
        "booking-multi",
        new Date("2026-05-25"),
      );
      expect(result.completed).toBe(3);

      const rows = tx._sessions.filter(
        (s: SessionRow) => s.bookingId === "booking-multi",
      );
      expect(rows).toHaveLength(3);
      expect(rows.every((s: SessionRow) => s.status === "COMPLETED")).toBe(true);
      expect(rows.every((s: SessionRow) => s.completedAt !== null)).toBe(true);

      const inv = invariant(tx);
      expect(inv.remaining).toBe(2); // 5 - 3 completed
    });

    it("releaseSessions reverts ALL RESERVED rows for the booking", async () => {
      await seedWalletSessions(tx, W, 5);
      tx._wallets[0].remainingSessions = 5;
      await allocateSessions(tx, W, "booking-cancel", 2);

      const result = await releaseSessions(tx, "booking-cancel");
      expect(result.released).toBe(2);

      const rows = tx._sessions.filter(
        (s: SessionRow) => s.bookingId === "booking-cancel",
      );
      expect(rows).toHaveLength(0); // bookingId 已清空
      const inv = invariant(tx);
      expect(inv.available).toBe(5);
      expect(inv.reserved).toBe(0);
      expect(inv.remaining).toBe(5);
    });

    it("uncompleteSessions reverts ALL COMPLETED rows back to RESERVED", async () => {
      await seedWalletSessions(tx, W, 5);
      tx._wallets[0].remainingSessions = 5;
      await allocateSessions(tx, W, "booking-revert", 2);
      await completeSessions(tx, "booking-revert");

      const result = await uncompleteSessions(tx, "booking-revert");
      expect(result.uncompleted).toBe(2);

      const rows = tx._sessions.filter(
        (s: SessionRow) => s.bookingId === "booking-revert",
      );
      expect(rows).toHaveLength(2);
      expect(rows.every((s: SessionRow) => s.status === "RESERVED")).toBe(true);
      expect(rows.every((s: SessionRow) => s.completedAt === null)).toBe(true);

      const inv = invariant(tx);
      expect(inv.remaining).toBe(5);
    });

    it("reReserveSessions re-grabs N AVAILABLE rows after release", async () => {
      await seedWalletSessions(tx, W, 5);
      tx._wallets[0].remainingSessions = 5;
      await allocateSessions(tx, W, "booking-X", 2);
      await releaseSessions(tx, "booking-X");

      const result = await reReserveSessions(tx, W, "booking-X", 2);
      expect(result.reReserved).toBe(2);

      const rows = tx._sessions.filter(
        (s: SessionRow) => s.bookingId === "booking-X" && s.status === "RESERVED",
      );
      expect(rows).toHaveLength(2);
    });

    it("end-to-end: people=2 create → complete → 扣 2 堂", async () => {
      // 模擬一張 5 堂 wallet，第 5 堂被人 void 掉，剩 4 AVAILABLE
      await seedWalletSessions(tx, W, 5);
      tx._wallets[0].remainingSessions = 5;
      const fifth = tx._sessions.find((s: SessionRow) => s.sessionNo === 5)!;
      await voidAvailableSession(tx, {
        sessionId: fifth.id,
        voidReason: "test void",
        voidedByStaffId: "s",
      });
      // 現在：4 AVAILABLE + 1 VOIDED，remaining=4

      // people=2 booking
      await allocateSessions(tx, W, "booking-2p", 2);
      let inv = invariant(tx);
      expect(inv.reserved).toBe(2);
      expect(inv.available).toBe(2);
      expect(inv.remaining).toBe(4);

      // 出席完成
      const { completed } = await completeSessions(tx, "booking-2p", new Date());
      expect(completed).toBe(2);

      inv = invariant(tx);
      expect(inv.reserved).toBe(0);
      expect(inv.available).toBe(2);
      expect(inv.remaining).toBe(2); // 4 - 2
    });

    it("end-to-end: people=2 取消 → 2 堂回 AVAILABLE", async () => {
      await seedWalletSessions(tx, W, 5);
      tx._wallets[0].remainingSessions = 5;

      await allocateSessions(tx, W, "booking-2p", 2);
      await releaseSessions(tx, "booking-2p");

      const inv = invariant(tx);
      expect(inv.available).toBe(5);
      expect(inv.reserved).toBe(0);
      expect(inv.remaining).toBe(5);
    });

    it("end-to-end: people=2 revert COMPLETED → 2 堂回 RESERVED", async () => {
      await seedWalletSessions(tx, W, 5);
      tx._wallets[0].remainingSessions = 5;

      await allocateSessions(tx, W, "booking-2p", 2);
      await completeSessions(tx, "booking-2p");
      // 此時：3 AVAILABLE + 2 COMPLETED；remaining=3

      const { uncompleted } = await uncompleteSessions(tx, "booking-2p");
      expect(uncompleted).toBe(2);

      const inv = invariant(tx);
      expect(inv.reserved).toBe(2);
      expect(inv.available).toBe(3);
      expect(inv.remaining).toBe(5); // 退回後恢復
    });

    it("混合 people 場景：people=2 + people=1 同 wallet 各自獨立", async () => {
      await seedWalletSessions(tx, W, 5);
      tx._wallets[0].remainingSessions = 5;

      await allocateSessions(tx, W, "booking-A", 2); // 取 sessionNo 1,2
      await allocateSessions(tx, W, "booking-B", 1); // 取 sessionNo 3

      // A 完成、B 取消
      await completeSessions(tx, "booking-A");
      await releaseSessions(tx, "booking-B");

      const completedA = tx._sessions.filter(
        (s: SessionRow) => s.bookingId === "booking-A",
      );
      expect(completedA).toHaveLength(2);
      expect(completedA.every((s: SessionRow) => s.status === "COMPLETED")).toBe(
        true,
      );

      const inv = invariant(tx);
      // 1 COMPLETED:2, 3 AVAILABLE (sessionNo 3,4,5)
      expect(inv.reserved).toBe(0);
      expect(inv.available).toBe(3);
      expect(inv.remaining).toBe(3);
    });

    it("singleton wrappers (allocateSession/completeSession/...) 行為與 people=1 一致", async () => {
      // 用舊 singleton wrapper 走一遍，確保 backward compat
      await seedWalletSessions(tx, W, 3);
      tx._wallets[0].remainingSessions = 3;

      const allocated = await allocateSession(tx, W, "booking-legacy");
      expect(allocated).not.toBeNull();
      expect(allocated?.sessionNo).toBe(1);
      expect(allocated?.status).toBe("RESERVED");

      const completed = await completeSession(tx, "booking-legacy");
      expect(completed).toBe(true);

      const uncompleted = await uncompleteSession(tx, "booking-legacy");
      expect(uncompleted).toBe(true);

      const released = await releaseSession(tx, "booking-legacy");
      expect(released).toBe(true);

      const inv = invariant(tx);
      expect(inv.available).toBe(3);
      expect(inv.remaining).toBe(3);
    });
  });
});
