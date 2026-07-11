import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PRICING_PLAN_INFO } from "@/lib/feature-flags";

const ROOT = process.cwd();

function readSource(path: string): string {
  return readFileSync(resolve(ROOT, path), "utf8");
}

describe("Brand Copy Consistency：蒸管家品牌統一", () => {
  it("brands the dashboard sidebar header as 蒸管家 and keeps store name for store context", () => {
    const source = readSource("src/components/sidebar.tsx");

    expect(source).toContain('const headerTitle = "蒸管家"');
    expect(source).not.toContain('"蒸足管理"');
    expect(source).toContain("{activeStoreName}");
    expect(source).toContain("`${activeStoreName} 後台`");
  });

  it("brands the dashboard mobile breadcrumb fallback as 蒸管家", () => {
    const source = readSource("src/components/breadcrumb.tsx");

    expect(source).toContain(">蒸管家</span>");
    expect(source).not.toContain("蒸足管理");
  });

  it("brands the signed-in customer sidebar/drawer as 蒸管家 while preserving store brand in the top header", () => {
    const layout = readSource("src/app/(customer)/layout.tsx");
    const mobileNav = readSource("src/app/(customer)/mobile-nav.tsx");

    expect(layout).toContain("蒸管家");
    expect(layout).toContain("customerFacingStoreName");
    expect(mobileNav).toContain(">蒸管家</p>");
    expect(mobileNav).toContain("{storeName}");
  });

  it("uses Chinese plan labels for visible plan versions", () => {
    expect(PRICING_PLAN_INFO.EXPERIENCE.label).toBe("體驗版");
    expect(PRICING_PLAN_INFO.BASIC.label).toBe("基本版");
    expect(PRICING_PLAN_INFO.GROWTH.label).toBe("專業版");
    expect(PRICING_PLAN_INFO.ALLIANCE.label).toBe("展店版");
  });

  it("uses Chinese plan labels on public and admin pricing pages", () => {
    const pricing = readSource("src/app/pricing/page.tsx");
    const plans = readSource("src/app/(dashboard)/dashboard/settings/plans/page.tsx");
    const subscriptionConstants = readSource("src/app/hq/dashboard/stores/subscriptions/constants.ts");

    for (const source of [pricing, plans, subscriptionConstants]) {
      expect(source).toContain("基本版");
      expect(source).toContain("專業版");
      expect(source).toContain("展店版");
      expect(source).not.toContain("基礎版");
    }
    expect(pricing).not.toContain(">BASIC</th>");
    expect(pricing).not.toContain(">PRO</th>");
    expect(pricing).not.toContain(">ALLIANCE</th>");
  });
});
