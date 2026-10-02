import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  session: vi.fn(), permission: vi.fn(), allowed: vi.fn(),
  transaction: vi.fn(), findUniqueOrThrow: vi.fn(), update: vi.fn(),
  updateMany: vi.fn(), audit: vi.fn(), notify: vi.fn(), revalidate: vi.fn(),
}));
vi.mock("@/lib/session", () => ({ requireAdminSession: m.session }));
vi.mock("@/lib/permissions", () => ({ requirePermission: m.permission }));
vi.mock("@/server/services/trial-application-access", () => ({ trialApplicationDatabaseAllowed: m.allowed }));
vi.mock("@/server/services/trial-application-notification", () => ({ notifyTrialApplication: m.notify }));
vi.mock("next/cache", () => ({ revalidatePath: m.revalidate }));
vi.mock("@/lib/db", () => ({ prisma: {
  $transaction: m.transaction,
  trialApplication: { updateMany: m.updateMany, update: m.update },
} }));
import { updateApplication, retryApplicationNotification } from "@/app/hq/dashboard/trial-applications/actions";
const id = "d5e15c3e-0512-4c14-ad98-04fe7ce5b44a";
const form = () => {
  const f = new FormData(); f.set("id", id); f.set("status", "CONFIGURING"); return f;
};
beforeEach(() => {
  vi.resetAllMocks();
  m.session.mockResolvedValue({ id: "admin-id", role: "ADMIN" });
  m.permission.mockResolvedValue(undefined);
  m.allowed.mockReturnValue(true);
  m.findUniqueOrThrow.mockResolvedValue({ status: "RECEIVED" });
  m.transaction.mockImplementation(async (fn) => fn({
    trialApplication: { findUniqueOrThrow: m.findUniqueOrThrow, update: m.update },
    auditLog: { create: m.audit },
  }));
  m.updateMany.mockResolvedValue({ count: 1 });
  m.notify.mockResolvedValue("SENT");
});
describe("HQ trial application authorization", () => {
  it.each([updateApplication, retryApplicationNotification])("rejects unauthenticated actions before data access", async (action) => {
    m.session.mockRejectedValue(new Error("admin required"));
    await expect(action(form())).rejects.toThrow("admin required");
    expect(m.transaction).not.toHaveBeenCalled();
    expect(m.updateMany).not.toHaveBeenCalled();
    expect(m.notify).not.toHaveBeenCalled();
  });
  it.each([updateApplication, retryApplicationNotification])("requires staff.manage before data access", async (action) => {
    m.permission.mockRejectedValue(new Error("permission denied"));
    await expect(action(form())).rejects.toThrow("permission denied");
    expect(m.permission).toHaveBeenCalledWith("staff.manage");
    expect(m.transaction).not.toHaveBeenCalled();
    expect(m.updateMany).not.toHaveBeenCalled();
  });
  it.each([updateApplication, retryApplicationNotification])("blocks unsafe Preview database access", async (action) => {
    m.allowed.mockReturnValue(false);
    await expect(action(form())).rejects.toThrow("預覽收件資料庫尚未設定");
    expect(m.transaction).not.toHaveBeenCalled();
    expect(m.updateMany).not.toHaveBeenCalled();
  });
  it("records progress and its operator in the same transaction", async () => {
    await updateApplication(form());
    expect(m.update).toHaveBeenCalledWith({ where: { id }, data: { status: "CONFIGURING" } });
    expect(m.audit).toHaveBeenCalledWith({ data: {
      actorUserId: "admin-id", targetType: "TrialApplication", targetId: id,
      action: "UPDATE", module: "trial-applications",
      beforeJson: { status: "RECEIVED" }, afterJson: { status: "CONFIGURING" },
    } });
  });
  it("does not resend when another request already claimed the notification", async () => {
    m.updateMany.mockResolvedValue({ count: 0 });
    await retryApplicationNotification(form());
    expect(m.notify).not.toHaveBeenCalled();
    expect(m.update).not.toHaveBeenCalled();
  });
  it("stores failed notification status so HQ can retry it", async () => {
    m.notify.mockResolvedValue("FAILED");
    await retryApplicationNotification(form());
    expect(m.update).toHaveBeenCalledWith({ where: { id }, data: { notificationStatus: "FAILED" } });
  });
});
