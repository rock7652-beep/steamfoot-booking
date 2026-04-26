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
  voidAvailableSession,
  reconcileForManualAdjust,
  WalletSessionError,
} from "@/server/services/wallet-session";

// ────────────────────────────────────────────────
// In-memory Prisma transaction mock (only what's needed)
// ────────────────────────────────────────────────

type SessionStatus = "AVAILABLE" | "RESERVED" | "COMPLETED" | "VOIDED";

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
      findMany: async (args: { where?: Record<string, unknown>; orderBy?: { sessionNo?: "asc" | "desc" } }) => {
        const matching = args.where ? sessions.filter((s) => matches(s, args.where!)) : sessions;
        return filterByOrder(matching, args.orderBy);
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
});
