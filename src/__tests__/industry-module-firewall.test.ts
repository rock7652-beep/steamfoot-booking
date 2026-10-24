import { beforeEach, describe, expect, it, vi } from "vitest";

const queryRaw = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: { $queryRaw: (...args: unknown[]) => queryRaw(...args) },
}));

describe("store industry module firewall", () => {
  beforeEach(() => queryRaw.mockReset());

  it("isolates COURSE from both existing modules", async () => {
    queryRaw.mockResolvedValue([{ industryModule: "COURSE" }]);
    const { requireCourseStore, requireSteamfootStore } = await import("@/lib/industry-module-server");
    await expect(requireCourseStore("course")).resolves.toBeUndefined();
    await expect(requireSteamfootStore("course")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it.each(["STEAMFOOT", "SPA", "UNKNOWN"])("rejects course operations for %s", async industryModule => {
    queryRaw.mockResolvedValue([{ industryModule }]);
    const { requireCourseStore } = await import("@/lib/industry-module-server");
    await expect(requireCourseStore("other")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows Steamfoot actions only for a STEAMFOOT store", async () => {
    queryRaw.mockResolvedValue([{ industryModule: "STEAMFOOT" }]);
    const { requireSteamfootStore } = await import("@/lib/industry-module-server");
    await expect(requireSteamfootStore("store-steamfoot")).resolves.toBeUndefined();
  });

  it("does not expose legacy SPA provisioning helpers", async () => {
    const industry = await import("@/lib/industry-module-server");
    expect(industry).not.toHaveProperty("requireSpaStore");
  });

  it("rejects Steamfoot actions for a SPA store", async () => {
    queryRaw.mockResolvedValue([{ industryModule: "SPA" }]);
    const { requireSteamfootStore } = await import("@/lib/industry-module-server");
    await expect(requireSteamfootStore("store-spa")).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("rejects the retired SPA module even for its own store", async () => {
    queryRaw.mockResolvedValue([{ industryModule: "SPA" }]);
    const { getStoreIndustryModule } = await import("@/lib/industry-module-server");
    await expect(getStoreIndustryModule("archived-spa")).rejects.toMatchObject({ code: "FORBIDDEN", message: "SPA 模組已移除" });
  });

  it("fails closed when the store does not exist", async () => {
    queryRaw.mockResolvedValue([]);
    const { getStoreIndustryModule } = await import("@/lib/industry-module-server");
    await expect(getStoreIndustryModule("missing")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

it("preserves Beauty identity and rejects routing it through Steamfoot or Course operations",async()=>{
 queryRaw.mockResolvedValue([{industryModule:"BEAUTY"}]);
 const {getStoreIndustryModule,requireSteamfootStore,requireCourseStore,requireStoreIndustryModule}=await import("@/lib/industry-module-server");
 expect(await getStoreIndustryModule("beauty-store")).toBe("beauty");
 await expect(requireStoreIndustryModule("beauty-store","beauty")).resolves.toBeUndefined();
 await expect(requireSteamfootStore("beauty-store")).rejects.toMatchObject({code:"FORBIDDEN"});
 await expect(requireCourseStore("beauty-store")).rejects.toMatchObject({code:"FORBIDDEN"});
});
