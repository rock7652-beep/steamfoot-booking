import { beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
const mocks = vi.hoisted(() => ({ user: vi.fn() }));
vi.mock("@/lib/session", () => ({ getCurrentUser: mocks.user }));
import { currentAuditActor, withoutAuditActor, withAuditDatabaseContext } from "@/lib/audit-db-context";
import { auditActorData, registerAuditActor } from "@/server/services/audit-actor-context";

describe("verified audit transaction context", () => {
  beforeEach(() => vi.clearAllMocks());
  it("isolates simultaneous logins for the same user and resolves auth before transactions", async () => {
    const stamps: string[] = [];
    const tx = { $executeRaw: vi.fn(async (sql) => { stamps.push(sql.values[0]); }) };
    const base = { $executeRaw: tx.$executeRaw, $transaction: vi.fn(async (work) => work(tx)) };
    const client = withAuditDatabaseContext(base);
    mocks.user.mockResolvedValueOnce({ id: "u", role: "OWNER", loginRecordId: "login-A" })
      .mockResolvedValueOnce({ id: "u", role: "OWNER", loginRecordId: "login-B" });
    let started = 0;
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const results = await Promise.all([1, 2].map(() => client.$transaction(async () => {
      if (++started === 2) release();
      await gate;
      return currentAuditActor()?.loginRecordId;
    })));
    expect(results).toEqual(["login-A", "login-B"]);
    expect(mocks.user).toHaveBeenCalledTimes(2);
    expect(stamps.map(s => JSON.parse(s).loginRecordId)).toEqual(results);
    expect(currentAuditActor()).toBeNull();
  });
  it("never stamps a retry worker with the viewing user's login", async () => {
    mocks.user.mockResolvedValue({ id: "viewer", loginRecordId: "wrong-login" });
    const exec = vi.fn(async (query: { values: unknown[] }) => { expect(query.values).toHaveLength(1); });
    const client = withAuditDatabaseContext({ $executeRaw: exec, $transaction: async (work: (tx: { $executeRaw: typeof exec }) => Promise<unknown>) => work({ $executeRaw: exec }) });
    await withoutAuditActor(() => client.$transaction(async () => {
      expect(currentAuditActor()).toBeNull();
    }));
    expect(mocks.user).not.toHaveBeenCalled();
    expect(exec.mock.calls[0][0].values).toEqual(["null"]);
  });
  it("stops before business writes when verified auth fails", async () => {
    mocks.user.mockRejectedValueOnce(new Error("database unavailable"));
    const transaction = vi.fn();
    const client = withAuditDatabaseContext({ $transaction: transaction });
    await expect(client.$transaction(() => undefined)).rejects.toThrow("database unavailable");
    expect(transaction).not.toHaveBeenCalled();
  });
  it("preserves PrismaPromise semantics for batched audit writes", async () => {
    const original = new PrismaClient({ datasources: { db: { url: "postgresql://test:test@localhost:5432/test" } } });
    const client = withAuditDatabaseContext(original, true);
    const pending = client.auditLog.create({ data: { actorUserId: "u", targetType: "Booking", targetId: "b", action: "UPDATE" } });
    expect(Object.prototype.toString.call(pending)).toBe("[object PrismaPromise]");
    expect(mocks.user).not.toHaveBeenCalled();
    await original.$disconnect();
  });
  it("rejects serialized and foreign actor objects, preserving the original snapshot", () => {
    const actor = registerAuditActor({ id: "u", name: "原名稱", role: "OWNER", loginRecordId: "login" });
    actor.name = "改名";
    expect(auditActorData(actor, "u")).toMatchObject({ actorNameSnapshot: "原名稱", loginRecordId: "login" });
    expect(auditActorData({ ...actor }, "u")).toEqual({});
    expect(auditActorData(actor, "other")).toEqual({});
  });
});
