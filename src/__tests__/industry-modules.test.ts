import { describe, expect, it } from "vitest";
import {
  INDUSTRY_MODULES,
  resolveIndustryModuleId,
  toPersistedIndustryModule,
} from "@/lib/industry-modules";

describe("industry module registry", () => {
  it("preserves Steamfoot as the default for unknown and legacy values", () => {
    expect(resolveIndustryModuleId(undefined)).toBe("steamfoot");
    expect(resolveIndustryModuleId("legacy-store")).toBe("steamfoot");
  });

  it("maps SPA values and keeps its resource model independent", () => {
    expect(resolveIndustryModuleId("SPA")).toBe("spa");
    expect(INDUSTRY_MODULES.spa.bookingResource).toBe("provider_availability");
    expect(INDUSTRY_MODULES.steamfoot.bookingResource).toBe("space_capacity");
    expect(toPersistedIndustryModule("spa")).toBe("SPA");
  });
});
