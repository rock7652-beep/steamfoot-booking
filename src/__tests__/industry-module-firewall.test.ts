import { beforeEach, describe, expect, it, vi } from "vitest";

const queryRaw = vi.fn();
const nativeGate=vi.hoisted(()=>vi.fn(async()=>false));
vi.mock("@/lib/sports-native-preview",()=>({sportsNativePreview:nativeGate}));

vi.mock("@/lib/db", () => ({
  prisma: { $queryRaw: (...args: unknown[]) => queryRaw(...args) },
}));

describe("store industry module firewall", () => {
  beforeEach(() => {queryRaw.mockReset();nativeGate.mockReset().mockResolvedValue(false);});

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

import {withReadRequestMemo,rememberVerifiedStaffRead} from "@/server/services/read-request-memo";
it("validates the same-request live auth store module, keeps another store fresh, and rechecks next request",async()=>{
 queryRaw.mockReset();queryRaw.mockResolvedValue([{industryModule:"BEAUTY"}]);
 const {getStoreIndustryModule}=await import("@/lib/industry-module-server");
 await withReadRequestMemo(async()=>{
  rememberVerifiedStaffRead({userId:"u",role:"OWNER",staffId:"st",storeId:"s",industryModule:"COURSE"});
  expect(await getStoreIndustryModule("s")).toBe("course");expect(queryRaw).not.toHaveBeenCalled();
  expect(await getStoreIndustryModule("another")).toBe("beauty");expect(queryRaw).toHaveBeenCalledOnce();
 });
 expect(await withReadRequestMemo(()=>getStoreIndustryModule("s"))).toBe("beauty");expect(queryRaw).toHaveBeenCalledTimes(2);
});
it.each(["SPA","UNKNOWN"])("retains module denial for authenticated metadata %s",async industryModule=>{
 const {getStoreIndustryModule}=await import("@/lib/industry-module-server");
 await expect(withReadRequestMemo(async()=>{rememberVerifiedStaffRead({userId:"u",role:"OWNER",staffId:"st",storeId:"s",industryModule});return getStoreIndustryModule("s");})).rejects.toMatchObject({code:"FORBIDDEN"});
});
it("keeps production activation and preview isolation denial ahead of verified metadata reuse",async()=>{
 queryRaw.mockClear();nativeGate.mockClear();nativeGate.mockRejectedValueOnce(new Error("module activation denied"));
 const {getStoreIndustryModule}=await import("@/lib/industry-module-server");
 await expect(withReadRequestMemo(async()=>{rememberVerifiedStaffRead({userId:"u",role:"OWNER",staffId:"st",storeId:"s",industryModule:"COURSE"});return getStoreIndustryModule("s");})).rejects.toThrow("module activation denied");
 expect(nativeGate).toHaveBeenCalledWith("s");expect(queryRaw).not.toHaveBeenCalled();
});
