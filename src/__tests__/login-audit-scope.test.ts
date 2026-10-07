import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  auditLog: { findFirst: vi.fn() },
  staffLoginRecord: { findMany: vi.fn(), count: vi.fn() },
  store: { findMany: vi.fn() },
}));
vi.mock("@/lib/db", () => ({ prisma: db }));
vi.mock("@/components/dashboard-link", () => ({ DashboardLink: () => null }));
vi.mock("@/components/desktop", () => ({ PageHeader: () => null, PageShell: () => null }));
import { LoginAuditView } from "@/app/(dashboard)/dashboard/operation-audits/login-audit-view";

const input = {
  storeId: "own-store", dateFrom: "2026-10-07", dateTo: "2026-10-07",
  from: new Date("2026-10-06T16:00:00Z"), to: new Date("2026-10-07T15:59:59Z"), page: 1,
};
beforeEach(() => {
  vi.resetAllMocks();
  db.auditLog.findFirst.mockResolvedValue(null);
  db.staffLoginRecord.findMany.mockResolvedValue([]);
  db.staffLoginRecord.count.mockResolvedValue(0);
  db.store.findMany.mockResolvedValue([]);
});

describe("login audit query authorization", () => {
  it("requires the own store for a direct login without an own-store operation", async () => {
    await LoginAuditView({ ...input, login: "foreign-login" });
    expect(db.staffLoginRecord.count).toHaveBeenCalledWith({ where: { storeId: "own-store", id: "foreign-login" } });
    expect(db.auditLog.findFirst).toHaveBeenCalledWith({ where: { storeId: "own-store", loginRecordId: "foreign-login" }, select: { id: true } });
  });

  it("allows only own-store or storeless HQ logins for a linked operation, retaining all filters", async () => {
    db.auditLog.findFirst.mockResolvedValue({ id: "own-operation" });
    await LoginAuditView({ ...input, login: "linked-login", actor: "actor", outcome: "SUCCESS" });
    const where = { id: "linked-login", actorUserId: "actor", outcome: "SUCCESS", OR: [
      { storeId: "own-store" }, { storeId: null, actorRoleSnapshot: "ADMIN" },
    ] };
    expect(db.staffLoginRecord.count).toHaveBeenCalledWith({ where });
    expect(db.staffLoginRecord.findMany).toHaveBeenLastCalledWith({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: 0, take: 50 });
    expect(db.staffLoginRecord.findMany.mock.calls[0][0].where.storeId).toBe("own-store");
  });

  it("keeps normal lists scoped and does not look up linked operations", async () => {
    await LoginAuditView(input);
    expect(db.auditLog.findFirst).not.toHaveBeenCalled();
    expect(db.staffLoginRecord.count).toHaveBeenCalledWith({ where: { storeId: "own-store", createdAt: { gte: input.from, lte: input.to } } });
  });

  it("retains authorized HQ global scope", async () => {
    await LoginAuditView({ ...input, storeId: null, login: "any-login" });
    expect(db.auditLog.findFirst).not.toHaveBeenCalled();
    expect(db.staffLoginRecord.count).toHaveBeenCalledWith({ where: { id: "any-login" } });
  });
});
