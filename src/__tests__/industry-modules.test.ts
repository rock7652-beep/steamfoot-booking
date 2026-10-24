import { describe, expect, it } from "vitest";
import { getIndustryModule, toPersistedIndustryModule, getIndustryService, resolveIndustryModuleId, STEAMFOOT_INDUSTRY_MODULE } from "@/lib/industry-modules";

describe("industry modules", () => {
  it("keeps the existing Steamfoot terminology as the safe default", () => {
    expect(resolveIndustryModuleId(undefined)).toBe("steamfoot");
    expect(resolveIndustryModuleId("unknown")).toBe("steamfoot");
    expect(getIndustryModule("steamfoot").customer).toMatchObject({
      summaryTitle: "方案摘要",
      sessionUnit: "堂",
      walletLabel: "我的方案",
    });
  });

  it("preserves legacy SPA identifiers but refuses runtime access", () => {
    expect(resolveIndustryModuleId("spa")).toBe("spa");
    expect(() => getIndustryModule("spa")).toThrow("SPA 模組已移除");
    expect(() => toPersistedIndustryModule("spa")).toThrow("SPA 模組已移除");
    expect(getIndustryModule("course").id).toBe("course");
    expect(toPersistedIndustryModule("steamfoot")).toBe("STEAMFOOT");
    expect(toPersistedIndustryModule("course")).toBe("COURSE");
    expect(STEAMFOOT_INDUSTRY_MODULE.booking.resourceModel).toBe("space_capacity");
    expect(STEAMFOOT_INDUSTRY_MODULE.features.healthAssessment).toBe(true);
  });

  it("fails closed when a module has no requested service", () => {
    expect(() => getIndustryService(STEAMFOOT_INDUSTRY_MODULE, "trial")).toThrow(
      "產業模組 steamfoot 缺少服務設定：trial",
    );
  });
});
