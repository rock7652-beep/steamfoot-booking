import { beforeEach, expect, it, vi } from "vitest";
const m=vi.hoisted(()=>({store:vi.fn(),module:vi.fn(),feature:vi.fn()}));
vi.mock("@/lib/store-resolver",()=>({resolveStorePresentation:m.store}));
vi.mock("@/lib/industry-module-server",()=>({getStoreIndustryModule:m.module}));
vi.mock("@/lib/feature-gate",()=>({hasStoreFeature:m.feature}));
import { readLiffPublicContext } from "@/server/queries/liff-public-context";
beforeEach(()=>{vi.resetAllMocks();m.store.mockResolvedValue({id:"store-a",slug:"a"});m.module.mockResolvedValue("steamfoot");m.feature.mockResolvedValue(true)});
it("keeps missing stores closed before module/feature reads",async()=>{
 m.store.mockResolvedValue(null);expect(await readLiffPublicContext("missing")).toBeNull();expect(m.module).not.toHaveBeenCalled();expect(m.feature).not.toHaveBeenCalled();
});
it("reads the authoritative module and feature for the resolved store",async()=>{
 const result=await readLiffPublicContext("a");expect(m.module).toHaveBeenCalledWith("store-a");expect(m.feature).toHaveBeenCalledWith("store-a","ai_health_summary");expect(result?.healthEnabled).toBe(true);
});
it("fails closed when module authorization fails",async()=>{
 m.module.mockRejectedValue(new Error("removed module"));await expect(readLiffPublicContext("a")).rejects.toThrow("removed module");expect(m.feature).not.toHaveBeenCalled();
});
