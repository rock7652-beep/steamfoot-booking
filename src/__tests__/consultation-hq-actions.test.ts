import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ session: vi.fn(), permission: vi.fn(), allowed: vi.fn(), transaction: vi.fn(), findLead: vi.fn(), updateLead: vi.fn(), application: vi.fn(), activity: vi.fn(), audit: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/session", () => ({ requireAdminSession: m.session }));
vi.mock("@/lib/permissions", () => ({ requirePermission: m.permission }));
vi.mock("@/server/services/trial-application-access", () => ({ trialApplicationDatabaseAllowed: m.allowed }));
vi.mock("next/cache", () => ({ revalidatePath: m.revalidate }));
vi.mock("@/lib/db", () => ({ prisma: { $transaction: m.transaction } }));
import { updateConsultationLead } from "@/app/hq/dashboard/trial-applications/consultation-actions";
const id = "d5e15c3e-0512-4c14-ad98-04fe7ce5b44a";
const applicationId = "6613bac6-7d97-485c-92c4-c59d71e1cba2";
function form(operation = "note", extra: Record<string, string | undefined> = {}) {
  const data = new FormData();
  for (const [key, value] of Object.entries({ id, revision: "2", operation, note: "已與原留聯絡人核對需求", status: "CONTACTED", applicationId, verified: "yes", ...extra })) if (value !== undefined) data.set(key, value);
  return data;
}
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv("CONSULTATION_HQ_ENABLED", "true");
  m.session.mockResolvedValue({ id: "admin-id", role: "ADMIN" });
  m.permission.mockResolvedValue(undefined); m.allowed.mockReturnValue(true);
  m.findLead.mockResolvedValue({ id, revision: 2, status: "NEW", trialApplicationId: null });
  m.updateLead.mockResolvedValue({ count: 1 }); m.application.mockResolvedValue({ id: applicationId });
  m.activity.mockResolvedValue({ id: "activity-id" }); m.audit.mockResolvedValue({});
  m.transaction.mockImplementation(async (fn) => fn({ consultationLead: { findUniqueOrThrow: m.findLead, updateMany: m.updateLead }, trialApplication: { findUnique: m.application }, consultationLeadActivity: { create: m.activity }, auditLog: { create: m.audit } }));
});
describe("HQ consultation mutation boundaries", () => {
  it.each(["status", "note", "link"])("requires authenticated ADMIN for %s before data access", async operation => {
    m.session.mockRejectedValue(new Error("admin required"));
    await expect(updateConsultationLead(form(operation))).rejects.toThrow("admin required");
    expect(m.transaction).not.toHaveBeenCalled();
  });
  it("rejects a non-ADMIN result defensively", async () => {
    m.session.mockResolvedValue({ id: "owner", role: "OWNER" });
    await expect(updateConsultationLead(form())).rejects.toThrow("僅限總部");
    expect(m.transaction).not.toHaveBeenCalled();
  });
  it("requires staff.manage before reading any record", async () => {
    m.permission.mockRejectedValue(new Error("permission denied"));
    await expect(updateConsultationLead(form())).rejects.toThrow("permission denied");
    expect(m.permission).toHaveBeenCalledWith("staff.manage"); expect(m.transaction).not.toHaveBeenCalled();
  });
  it("fails closed on an unsafe preview database", async () => {
    m.allowed.mockReturnValue(false);
    await expect(updateConsultationLead(form())).rejects.toThrow("預覽收件資料庫尚未設定");
    expect(m.transaction).not.toHaveBeenCalled();
  });
  it.each(["", "false", "1", "TRUE"])("makes no new-table query when rollout flag is %s", async flag => {
    vi.stubEnv("CONSULTATION_HQ_ENABLED", flag);
    await expect(updateConsultationLead(form())).rejects.toThrow("尚未啟用");
    expect(m.transaction).not.toHaveBeenCalled();
  });
  it.each([{ revision: "0" }, { revision: "NaN" }, { revision: "1.5" }, { id: "bad" }, { note: " " }, { note: "a".repeat(2001) }])("rejects malformed input before transaction (%j)", async extra => {
    expect((await updateConsultationLead(form("note", extra))).success).toBe(false);
    expect(m.transaction).not.toHaveBeenCalled();
  });
  it("does not accept prototype names as statuses", async () => {
    expect((await updateConsultationLead(form("status", { status: "toString" }))).success).toBe(false);
    expect(m.transaction).not.toHaveBeenCalled();
  });
  it("appends a note and private-data-free audit in the same transaction", async () => {
    const result = await updateConsultationLead(form());
    expect(result).toMatchObject({ success: true, revision: 3 });
    expect(m.updateLead).toHaveBeenCalledWith({ where: { id, revision: 2 }, data: { revision: { increment: 1 } } });
    expect(m.activity).toHaveBeenCalledWith({ data: { leadId: id, actorId: "admin-id", type: "NOTE", note: "已與原留聯絡人核對需求" } });
    const audit = m.audit.mock.calls[0][0].data;
    expect(audit.beforeJson).toEqual({ revision: 2 }); expect(audit.afterJson).toEqual({ revision: 3, activityId: "activity-id" });
    expect(JSON.stringify(audit)).not.toContain("原留聯絡人"); expect(m.transaction).toHaveBeenCalledOnce();
  });
  it("persists status with revision and a status-only audit", async () => {
    expect((await updateConsultationLead(form("status"))).success).toBe(true);
    expect(m.updateLead).toHaveBeenCalledWith({ where: { id, revision: 2 }, data: { revision: { increment: 1 }, status: "CONTACTED" } });
    expect(m.audit.mock.calls[0][0].data.afterJson.status).toBe("CONTACTED");
  });
  it("requires explicit manual verification before a link lookup", async () => {
    expect((await updateConsultationLead(form("link", { verified: "" }))).success).toBe(false);
    expect(m.application).not.toHaveBeenCalled(); expect(m.transaction).not.toHaveBeenCalled();
  });
  it("links only an exact existing application id and audits that association", async () => {
    expect((await updateConsultationLead(form("link"))).success).toBe(true);
    expect(m.application).toHaveBeenCalledWith({ where: { id: applicationId }, select: { id: true } });
    expect(m.updateLead).toHaveBeenCalledWith({ where: { id, revision: 2 }, data: { revision: { increment: 1 }, trialApplicationId: applicationId, trialLinkedAt: expect.any(Date), trialLinkedBy: "admin-id" } });
    expect(m.audit.mock.calls[0][0].data.beforeJson).toEqual({ revision: 2, trialApplicationId: null });
    expect(m.audit.mock.calls[0][0].data.afterJson.trialApplicationId).toBe(applicationId);
  });
  it("does not change a lead if the specified application does not exist", async () => {
    m.application.mockResolvedValue(null);
    expect((await updateConsultationLead(form("link"))).message).toContain("找不到");
    expect(m.updateLead).not.toHaveBeenCalled(); expect(m.activity).not.toHaveBeenCalled();
  });
  it.each(["note", "link", "status"])("returns a revision conflict without overwriting stale %s", async operation => {
    m.findLead.mockResolvedValue({ revision: 4, status: "FOLLOW_UP", trialApplicationId: applicationId });
    expect(await updateConsultationLead(form(operation))).toMatchObject({ success: false, conflict: { revision: 4, status: "FOLLOW_UP", applicationId } });
    expect(m.updateLead).not.toHaveBeenCalled(); expect(m.activity).not.toHaveBeenCalled(); expect(m.audit).not.toHaveBeenCalled();
  });
  it("handles a compare-and-swap race without adding a stale note or audit", async () => {
    m.updateLead.mockResolvedValue({ count: 0 });
    m.findLead.mockResolvedValueOnce({ revision: 2, status: "NEW", trialApplicationId: null }).mockResolvedValueOnce({ revision: 3, status: "CONTACTED", trialApplicationId: null });
    expect(await updateConsultationLead(form())).toMatchObject({ success: false, conflict: { revision: 3 } });
    expect(m.activity).not.toHaveBeenCalled(); expect(m.audit).not.toHaveBeenCalled();
  });
  it("does not report success when transaction or audit fails", async () => {
    m.audit.mockRejectedValue(new Error("database contains private payload"));
    const result = await updateConsultationLead(form());
    expect(result.success).toBe(false); expect(result.message).not.toContain("private payload"); expect(m.revalidate).not.toHaveBeenCalled();
  });
});
