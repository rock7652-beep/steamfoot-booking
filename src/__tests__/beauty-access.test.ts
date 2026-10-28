import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
const m = vi.hoisted(() => ({
  store: { findFirst: vi.fn() },
  user: { findFirst: vi.fn() },
  staff: { findFirst: vi.fn() },
  tech: { findFirst: vi.fn() },
  permission: vi.fn(),
  readStore: vi.fn(),
  writeStore: vi.fn(),
  session: vi.fn(),
  context: vi.fn(),
  member: vi.fn(),
  feature: vi.fn(),
  subscription: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  prisma: { store: m.store, user: m.user, staff: m.staff },
}));
vi.mock("@/lib/beauty-db", () => ({
  beautyPrisma: { beautyTechnician: m.tech },
}));
vi.mock("@/lib/permissions", () => ({ requirePermission: m.permission }));
vi.mock("@/lib/store", () => ({
  getActiveStoreForRead: m.readStore,
  resolveWriteStoreId: m.writeStore,
}));
vi.mock("@/lib/session", () => ({ requireSession: m.session }));
vi.mock("@/lib/store-context", () => ({ getStoreContext: m.context }));
vi.mock("@/lib/subscription-guard", () => ({
  assertStoreSubscriptionWritable: m.subscription,
}));
vi.mock("@/lib/feature-gate", () => ({ requireStoreFeature: m.feature }));
vi.mock("@/server/services/central-member-resolver", () => ({
  resolveCentralMemberCustomerForStore: m.member,
}));
import {
  requireBeauty,
  beautyManager,
  beautyMember,
  beautyWorker,
} from "@/server/beauty/access";
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("BEAUTY_MODULE_ENABLED", "1");
  m.store.findFirst.mockResolvedValue({ id: "s" });
  m.user.findFirst.mockResolvedValue({ id: "u" });
  m.staff.findFirst.mockResolvedValue({ id: "staff" });
  m.permission.mockResolvedValue({
    id: "u",
    storeId: "s",
    staffId: "staff",
    role: "MANAGER",
  });
  m.readStore.mockResolvedValue("s");
  m.writeStore.mockResolvedValue("s");
  m.session.mockResolvedValue({ id: "u" });
  m.context.mockResolvedValue({ storeId: "s" });
  m.member.mockResolvedValue({ customerId: "c" });
  m.tech.findFirst.mockResolvedValue({ id: "t", grants: ["complete"] });
});
afterEach(() => vi.unstubAllEnvs());
describe("beauty authorization boundary", () => {
  it("default-off feature switch rejects before a database lookup", async () => {
    vi.stubEnv("BEAUTY_MODULE_ENABLED", "");
    await expect(requireBeauty("s")).rejects.toThrow("尚未開放");
    expect(m.store.findFirst).not.toHaveBeenCalled();
  });
  it("authoritative store module and operating status are checked", async () => {
    m.store.findFirst.mockResolvedValue(null);
    await expect(requireBeauty("other")).rejects.toThrow();
    expect(m.store.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "other",
          industryModule: "BEAUTY",
        }),
      }),
    );
  });
  it("writes resolve the writable store and subscription before changes", async () => {
    await beautyManager("booking.create", true);
    expect(m.writeStore).toHaveBeenCalled();
    expect(m.subscription).toHaveBeenCalledWith("s");
  });
  it("a revoked backend staff cannot use an old active session", async () => {
    m.staff.findFirst.mockResolvedValue(null);
    await expect(beautyManager("booking.update", true)).rejects.toThrow("停用");
  });
  it("member identity must come from a verified store membership", async () => {
    m.member.mockResolvedValue(null);
    await expect(beautyMember()).rejects.toThrow("連結");
  });
  it("inactive users cannot reserve even when customer linkage exists", async () => {
    m.user.findFirst.mockResolvedValue(null);
    await expect(beautyMember(true)).rejects.toThrow("停用");
  });
  it("a backend login is not a technician work identity", async () => {
    m.tech.findFirst.mockResolvedValue(null);
    await expect(beautyWorker()).rejects.toThrow("技師工作");
  });
  it("work identity is scoped to the current store and linked user", async () => {
    expect(await beautyWorker()).toMatchObject({
      storeId: "s",
      userId: "u",
      technicianId: "t",
    });
    expect(m.tech.findFirst).toHaveBeenCalledWith({
      where: { storeId: "s", userId: "u", active: true },
    });
  });
});

import {withBeautyReadScope} from '@/server/beauty/request-scope';
it('keeps distinct grants while sharing one verified store/membership per request',async()=>{
 await withBeautyReadScope(async()=>{await Promise.all([beautyManager('customer.read'),beautyManager('wallet.read')]);await beautyManager('customer.read');});
 expect(m.permission.mock.calls.map(c=>c[0]).sort()).toEqual(['customer.read','wallet.read']);
 expect(m.readStore).toHaveBeenCalledTimes(1);expect(m.staff.findFirst).toHaveBeenCalledTimes(1);expect(m.store.findFirst).toHaveBeenCalledTimes(1);
 m.staff.findFirst.mockResolvedValue(null);await expect(withBeautyReadScope(()=>beautyManager('customer.read'))).rejects.toThrow('停用');
});
