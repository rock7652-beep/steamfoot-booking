import { beforeEach, describe, expect, it, vi } from "vitest";
const plan = vi.hoisted(() => ({ findFirst: vi.fn(), create: vi.fn(), update: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { servicePlan: plan } }));
import { ensureTrialPlan } from "@/server/services/trial-plan";

describe("FIRST_TRIAL keeps its internal plan independently of ordinary plan actions", () => {
  beforeEach(() => vi.resetAllMocks());
  it("reuses an active TRIAL without writing or assigning a wallet", async () => {
    const existing = { id: "trial", category: "TRIAL" };
    plan.findFirst.mockResolvedValue(existing);
    expect(await ensureTrialPlan("store-a", 499)).toBe(existing);
    expect(plan.findFirst).toHaveBeenCalledWith({ where: { storeId: "store-a", category: "TRIAL", isActive: true }, orderBy: { createdAt: "asc" } });
    expect(plan.create).not.toHaveBeenCalled();
    expect(plan.update).not.toHaveBeenCalled();
  });
  it("creates the wallet-free internal reference when absent", async () => {
    plan.findFirst.mockResolvedValue(null);
    plan.create.mockResolvedValue({ id: "new-trial" });
    await ensureTrialPlan("store-a", 499);
    expect(plan.create).toHaveBeenCalledWith({ data: expect.objectContaining({ storeId: "store-a", name: "體驗課", category: "TRIAL", price: 499, sessionCount: 1, isActive: true, publicVisible: false }) });
    expect(plan.update).not.toHaveBeenCalled();
  });
  it("preserves the existing reference identity when reactivating its canonical record", async () => {
    plan.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "legacy-trial" });
    plan.update.mockResolvedValue({ id: "legacy-trial" });
    expect(await ensureTrialPlan("store-a", 499)).toEqual({ id: "legacy-trial" });
    expect(plan.update).toHaveBeenCalledWith({ where: { id: "legacy-trial" }, data: { isActive: true, category: "TRIAL", sessionCount: 1 } });
    expect(plan.create).not.toHaveBeenCalled();
  });
});
