import { describe, expect, it } from "vitest";
import { STORE_AUDIT_ACTIONS, isStoreAuditTarget, storeAuditSnapshot, toStoreAuditItem } from "@/lib/store-operation-audit-policy";
const row = { id: "a", targetType: "Booking", action: "UPDATE", createdAt: new Date("2026-10-08T00:00:00Z"), actorNameSnapshot: "店主", actorRoleSnapshot: "OWNER", actor: { id: "user", name: "店主", role: "OWNER" }, module: "STEAM", beforeJson: { status: "PENDING", notes: "private", ip: "192.0.2.1" }, afterJson: { status: "COMPLETED", note: "private", loginRecordId: "secret" }, loginRecordId: "secret", summary: "private summary", session: "secret", targetId: "target" };
describe("positive store DTO policy", () => {
  it("builds a new DTO and never spreads raw audit data", () => {
    const item = toStoreAuditItem(row)!; expect(item.summary).toBe("修改 · 蒸足預約");
    expect(item.beforeJson).toEqual({ status: "PENDING" }); expect(item.afterJson).toEqual({ status: "COMPLETED" });
    expect(Object.keys(item).sort()).toEqual(["id", "action", "summary", "targetLabel", "module", "createdAt", "actorNameSnapshot", "actor", "beforeJson", "afterJson"].sort());
    expect(JSON.stringify(item)).not.toMatch(/private|secret|192\.0|targetId|loginRecordId/);
  });
  it.each(["StaffPermission", "User", "StoreView", "CustomerIdentityLink", "TrialApplication", "Unknown"])("excludes %s", targetType => { expect(isStoreAuditTarget(targetType)).toBe(false); expect(toStoreAuditItem({ ...row, targetType })).toBeNull(); });
  it.each(["PASSWORD_RESET", "LOGIN_METHOD_PHONE_REPLACED", "ACTIVATE_NOTIFICATION_PREBIND", "HQ_VIEW_STORE", "NEW_ACTION"])("excludes unapproved %s even on a Customer row", action => { expect(toStoreAuditItem({ ...row, targetType: "Customer", action })).toBeNull(); });
  it.each(["CREATE", "UPDATE", "SERVICE_NOTE_UPDATED", "CUSTOMER_LABEL_SET"])("keeps ordinary customer action %s", action => { expect(toStoreAuditItem({ ...row, targetType: "Customer", action })).not.toBeNull(); });
  it("excludes HQ actor snapshots, current HQ identities, and SYSTEM modules", () => {
    expect(toStoreAuditItem({ ...row, actorRoleSnapshot: "ADMIN" })).toBeNull();
    expect(toStoreAuditItem({ ...row, actorRoleSnapshot: null })).toBeNull();
    expect(toStoreAuditItem({ ...row, actorRoleSnapshot: "UNKNOWN" })).toBeNull();
    expect(toStoreAuditItem({ ...row, actor: { name: "HQ", role: "ADMIN" } })).toBeNull();
    expect(toStoreAuditItem({ ...row, module: "SYSTEM" })).toBeNull();
  });
  it("only permits finite numeric values and enumerated statuses, never nested/free-text payloads", () => {
    expect(storeAuditSnapshot({ amount: 20, quantity: Infinity, price: "secret", status: "secret", note: "private", nested: { amount: 5 }, paymentMethod: "CASH" })).toEqual({ amount: 20, paymentMethod: "CASH" });
    expect(storeAuditSnapshot([{ amount: 1 }])).toEqual({});
  });
  it("every listed action resolves to a store-safe item", () => { for (const [targetType, actions] of Object.entries(STORE_AUDIT_ACTIONS)) for (const action of actions) expect(toStoreAuditItem({ ...row, targetType, action })).not.toBeNull(); });
});
