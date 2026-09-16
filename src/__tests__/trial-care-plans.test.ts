import { beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ store: vi.fn(), plans: vi.fn(), packages: vi.fn(), treatments: vi.fn(), payment: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { store: { findFirst: m.store }, shopConfig: { findUnique: m.payment }, servicePlan: { findMany: m.plans } } }));
vi.mock("@/lib/spa-db", () => ({ spaPrisma: { spaPackage: { findMany: m.packages }, spaTreatment: { findMany: m.treatments } } }));
import { publicPlanMessages } from "@/server/services/trial-care-plans";
vi.mock("@/lib/base-url", () => ({ deriveBaseUrl: () => "https://preview.example.test" }));
const token = "a".repeat(48);
beforeEach(() => {
  vi.resetAllMocks();
  m.store.mockResolvedValue({ name: "本店", slug: "store-a", industryModule: "STEAMFOOT" });
  m.payment.mockResolvedValue({ bankAccountNumber: "123456" });
  m.plans.mockResolvedValue([{ id: "plan-a", name: "五堂卡", price: 2000, sessionCount: 5, validityDays: 90, description: "方案內容" }]);
});
it("reads only the active store's published packages, with fresh price on every click", async () => {
  expect(JSON.stringify(await publicPlanMessages("A", token, 0))).toContain("2,000");
  expect(m.plans.mock.calls[0][0].where).toEqual({ storeId: "A", isActive: true, publicVisible: true, category: "PACKAGE" });
  m.plans.mockResolvedValue([{ name: "五堂卡", price: 2500, sessionCount: 5, validityDays: null }]);
  const next = JSON.stringify(await publicPlanMessages("A", token, 0));
  expect(next).toContain("2,500"); expect(next).toContain("無期限");
});
it("paginates without exceeding ten bubbles", async () => {
  m.plans.mockResolvedValue(Array.from({ length: 10 }, (_, i) => ({ name: `方案${i}`, price: 100, sessionCount: 1, validityDays: 30 })));
  const result = await publicPlanMessages("A", token, 1);
  if (result[0].type !== "flex") throw new Error("Expected Flex");
  const content = result[0].contents as { contents: unknown[] };
  expect(content.contents).toHaveLength(10);
  expect(JSON.stringify(result)).toContain(`trial-care:plans:${token}:2`);
  expect(m.plans.mock.calls[0][0]).toMatchObject({ skip: 9, take: 10 });
});
it("uses SPA data only and excludes inactive treatments and unpublished packages", async () => {
  m.store.mockResolvedValue({ name: "SPA店", industryModule: "SPA" });
  m.treatments.mockResolvedValue([{ id: "t" }]); m.packages.mockResolvedValue([{ name: "按摩十堂", price: 8000, uses: 10, validityDays: 180 }]);
  expect(JSON.stringify(await publicPlanMessages("S", token, 0))).toContain("按摩十堂");
  expect(m.plans).not.toHaveBeenCalled();
  expect(m.packages.mock.calls[0][0].where).toEqual({ storeId: "S", isActive: true, publicVisible: true, treatmentId: { in: ["t"] } });
  expect(m.treatments.mock.calls[0][0].where).toEqual({ storeId: "S", isActive: true });
});
it("offers contact instead of inventing plans when empty", async () => {
  m.plans.mockResolvedValue([]);
  const result = JSON.stringify(await publicPlanMessages("A", token, 0));
  expect(result).toContain("目前尚無公開方案"); expect(result).toContain("聯繫店長");
});
it("does not read another module or an inactive store", async () => {
  m.store.mockResolvedValue({ name: "課程店", industryModule: "COURSE" });
  await publicPlanMessages("C", token, 0);
  m.store.mockResolvedValue(null); await publicPlanMessages("closed", token, 0);
  expect(m.plans).not.toHaveBeenCalled(); expect(m.packages).not.toHaveBeenCalled();
});

it("links a purchase to the current store and plan without exposing the care token", async () => {
  const result = JSON.stringify(await publicPlanMessages("A", token, 0));
  expect(result).toContain("https://preview.example.test/s/store-a/liff/wallets/shop/plan-a");
  expect(result).toContain("購買此方案");
  expect(result).not.toContain(token);
  expect(m.payment).toHaveBeenCalledWith({ where: { storeId: "A" }, select: { bankAccountNumber: true } });
});
it("does not offer checkout without receiving details or for SPA packages", async () => {
  m.payment.mockResolvedValue({ bankAccountNumber: " " });
  expect(JSON.stringify(await publicPlanMessages("A", token, 0))).not.toContain("購買此方案");
  m.store.mockResolvedValue({ name: "SPA", slug: "spa", industryModule: "SPA" });
  m.treatments.mockResolvedValue([{ id: "t" }]);
  m.packages.mockResolvedValue([{ id: "p", name: "按摩", price: 100, uses: 1, validityDays: 90 }]);
  m.payment.mockClear();
  expect(JSON.stringify(await publicPlanMessages("S", token, 0))).not.toContain("購買此方案");
  expect(m.payment).not.toHaveBeenCalled();
});
