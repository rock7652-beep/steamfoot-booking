import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ findMany: vi.fn(), count: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { auditLog: m } }));
import { readStoreOperationAudits, storeOperationAuditWhere } from "@/server/services/store-operation-audit-reader";
import { STORE_AUDIT_ACTOR_ROLES } from "@/lib/store-operation-audit-policy";
beforeEach(() => { vi.clearAllMocks(); m.findMany.mockResolvedValue([]); m.count.mockResolvedValue(0); });
it("uses identical fail-closed row filters for totals and records", async () => {
  const from = new Date("2026-10-01T00:00:00Z"), to = new Date("2026-10-08T00:00:00Z");
  await readStoreOperationAudits({ storeId: "own", dateFrom: from, dateTo: to, page: 2, limit: 999, targetType: "Booking", targetId: "foreign" });
  const read = m.findMany.mock.calls[0][0], count = m.count.mock.calls[0][0];
  expect(read.where).toEqual(count.where); expect(read.where).toEqual({ ...storeOperationAuditWhere("own"), createdAt: { gte: from, lte: to }, targetType: "Booking", targetId: "foreign" });
  expect(read.where.AND).toContainEqual({ actorRoleSnapshot: { in: [...STORE_AUDIT_ACTOR_ROLES] } });
  expect(read.take).toBe(50); expect(read.skip).toBe(50);
  expect(read.select).not.toHaveProperty("summary"); expect(read.select).not.toHaveProperty("loginRecordId"); expect(read.select).not.toHaveProperty("actorUserId");
});
it("drops unknown provenance and uses fresh DTOs even if a query adapter returns extra fields", async () => {
  const row = { id: "a", targetType: "Customer", action: "SERVICE_NOTE_UPDATED", createdAt: new Date(), actorNameSnapshot: null, actorRoleSnapshot: "OWNER", actor: { name: "Owner", role: "OWNER" }, module: "SHARED", summary: "private", loginRecordId: "secret", beforeJson: { serviceNote: "private" }, afterJson: { serviceNote: "private-new" } };
  m.findMany.mockResolvedValue([row, { ...row, actorRoleSnapshot: null }]);
  const result = await readStoreOperationAudits({ storeId: "own" });
  expect(result.items).toHaveLength(1); expect(JSON.stringify(result.items)).not.toMatch(/private|secret/);
});
