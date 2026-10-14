import { describe, expect, it } from "vitest";
import {
  getIndustryModule,
  toPersistedIndustryModule,
  getIndustryService,
  resolveIndustryModuleId,
  SPA_INDUSTRY_MODULE,
  STEAMFOOT_INDUSTRY_MODULE,
} from "@/lib/industry-modules";

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
    expect(SPA_INDUSTRY_MODULE.customer).toMatchObject({
      summaryTitle: "療程摘要",
      sessionUnit: "次",
      walletLabel: "我的療程",
      buyLabel: "購買療程",
    });
    expect(SPA_INDUSTRY_MODULE.roles.provider).toBe("芳療師");
    expect(SPA_INDUSTRY_MODULE.booking.resourceModel).toBe("provider_availability");
    expect(SPA_INDUSTRY_MODULE.booking.defaultCapacity).toBe(1);
    expect(STEAMFOOT_INDUSTRY_MODULE.booking.resourceModel).toBe("space_capacity");
    expect(SPA_INDUSTRY_MODULE.features.healthAssessment).toBe(false);
    expect(STEAMFOOT_INDUSTRY_MODULE.features.healthAssessment).toBe(true);
  });

  it("contains a complete, internally consistent SPA service catalog", () => {
    const keys = SPA_INDUSTRY_MODULE.services.map((service) => service.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toEqual([
      "trial",
      "single",
      "package_3",
      "package_5",
      "package_10",
      "package_annual",
    ]);
    expect(
      SPA_INDUSTRY_MODULE.services.every(
        (service) =>
          service.price > 0 &&
          service.durationMinutes > 0 &&
          service.sessions > 0,
      ),
    ).toBe(true);
  });

  it("resolves seeded services by stable keys", () => {
    expect(getIndustryService(SPA_INDUSTRY_MODULE, "trial")).toMatchObject({
      name: "新客舒壓體驗 60 分鐘",
      price: 899,
      sessions: 1,
    });
    expect(getIndustryService(SPA_INDUSTRY_MODULE, "package_10")).toMatchObject({
      name: "深層芳療 10 次",
      sessions: 10,
      validityDays: 180,
    });
  });

  it("fails closed when a module has no requested service", () => {
    expect(() => getIndustryService(STEAMFOOT_INDUSTRY_MODULE, "trial")).toThrow(
      "產業模組 steamfoot 缺少服務設定：trial",
    );
  });
});
