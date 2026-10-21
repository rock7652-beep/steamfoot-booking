import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ find: vi.fn(), count: vi.fn(), create: vi.fn(), update: vi.fn(), updateSub: vi.fn(), log: vi.fn(), history: vi.fn(), lock: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: {} }));
import { openSingleStoreTrialInTransaction } from "@/server/services/single-store-trial";
import type { Prisma } from "@prisma/client";
const tx = { $executeRaw: m.lock, store: { findUnique: m.find, update: m.update }, staff: { count: m.count }, storeSubscription: { create: m.create, update: m.updateSub }, storePlanChange: { create: m.log, findFirst: m.history } } as unknown as Prisma.TransactionClient;
const input = { storeId: "new-store", actorId: "admin", startDate: "2026-09-13" };
beforeEach(() => {
  vi.clearAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-13T04:00:00Z"));
  m.find.mockResolvedValue({ id: "new-store", plan: "BASIC", planStatus: "TRIAL", moduleInstallation: { status: "ACTIVE" }, currentSubscriptionId: null });
  m.history.mockResolvedValue(null);
  m.count.mockResolvedValue(1); m.create.mockImplementation(async ({ data }) => ({ id: "trial-1", ...data }));
});
describe("trial opening transaction", () => {
  it("synchronizes the original store with one dated trial subscription", async () => {
    expect(await openSingleStoreTrialInTransaction(tx, input)).toEqual({ id: "trial-1" });
    expect(m.create).toHaveBeenCalledWith({ data: expect.objectContaining({ storeId: "new-store", plan: "EXPERIENCE", status: "TRIAL", billingStatus: "NOT_REQUIRED", expiresAt: new Date("2026-10-12T00:00:00Z") }) });
    expect(m.update).toHaveBeenCalledWith({ where: { id: "new-store" }, data: expect.objectContaining({ currentSubscriptionId: "trial-1", plan: "EXPERIENCE", planStatus: "TRIAL" }) });
    expect(m.log).toHaveBeenCalledTimes(1);
  });
  it("rejects a paid store before modifying its subscription", async () => {
    m.find.mockResolvedValue({ id: "new-store", plan: "GROWTH", planStatus: "ACTIVE", moduleInstallation: { status: "ACTIVE" } });
    await expect(openSingleStoreTrialInTransaction(tx, input)).rejects.toThrow("正式方案");
    expect(m.create).not.toHaveBeenCalled(); expect(m.update).not.toHaveBeenCalled();
  });
  it("opens trial for a larger team without deactivating anyone", async () => {
    m.count.mockResolvedValue(4);
    await expect(openSingleStoreTrialInTransaction(tx, input)).resolves.toEqual({ id: "trial-1" });
    expect(m.count).not.toHaveBeenCalled();
  });
  it("starts only on the actual opening day", async () => {
    await expect(openSingleStoreTrialInTransaction(tx, { ...input, startDate: "2026-09-12" })).rejects.toThrow("今天");
    expect(m.find).not.toHaveBeenCalled();
  });
});


describe("course backend trial activation", () => {
  const course = { id: "new-store", industryModule: "COURSE", plan: "EXPERIENCE", planStatus: "TRIAL", liffId: "123-app", moduleInstallation: { status: "ACTIVE" }, currentSubscriptionId: null };
  it("starts without LINE or LIFF setup or entry acceptance", async () => {
    m.find.mockResolvedValue({ ...course, liffId: null });
    await expect(openSingleStoreTrialInTransaction(tx, input)).resolves.toEqual({ id: "trial-1" });
    expect(m.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      status: "TRIAL", isTrial: true,
      note: expect.not.stringContaining("驗收完成"),
    }) });
  });
  it("still requires an active module before opening a backend trial", async () => {
    m.find.mockResolvedValue({ ...course, liffId: null, moduleInstallation: { status: "PENDING" } });
    await expect(openSingleStoreTrialInTransaction(tx, input)).rejects.toThrow("模組佈建");
    expect(m.create).not.toHaveBeenCalled();
  });
  it("starts thirty days once and refuses a replay without touching the original", async () => {
    m.find.mockResolvedValue(course);
    await openSingleStoreTrialInTransaction(tx, input);
    m.find.mockResolvedValue({ ...course, currentSubscriptionId: "trial-1" });
    await expect(openSingleStoreTrialInTransaction(tx, input)).rejects.toThrow("不可重新起算");
    expect(m.create).toHaveBeenCalledTimes(1);
    expect(m.updateSub).not.toHaveBeenCalled();
    expect(m.log).toHaveBeenCalledTimes(1);
  });
  it("protects historical trials even when the current subscription pointer is absent", async () => {
    m.find.mockResolvedValue(course); m.history.mockResolvedValue({ id: "old" });
    await expect(openSingleStoreTrialInTransaction(tx, input)).rejects.toThrow("不可重新起算");
    expect(m.create).not.toHaveBeenCalled();
  });
  it("does not accept customized course trial lengths", async () => {
    m.find.mockResolvedValue(course);
    await expect(openSingleStoreTrialInTransaction(tx, { ...input, days: 60 })).rejects.toThrow("30 天");
    expect(m.create).not.toHaveBeenCalled();
  });
});
