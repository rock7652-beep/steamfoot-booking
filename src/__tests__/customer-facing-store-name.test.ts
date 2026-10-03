import { describe, expect, it } from "vitest";
import { getCustomerFacingStoreName } from "@/lib/customer-facing-store-name";

describe("getCustomerFacingStoreName", () => {
  it.each([
    ["zhubei", "竹北店", "暖暖蒸足"],
    ["hsinchu", "新竹店", "以斯帖蒸足坊"],
    ["taichung", "台中店", "暖沐蒸足"],
  ])("%s uses the customer-facing storefront name", (slug, storeName, expected) => {
    expect(getCustomerFacingStoreName({ slug, name: storeName })).toBe(expected);
  });

  it("renamed legacy stores show the saved display name", () => {
    expect(getCustomerFacingStoreName({ slug: "zhubei", name: "竹北新品牌" })).toBe("竹北新品牌");
    expect(getCustomerFacingStoreName({ slug: "hsinchu", name: "新竹新品牌" })).toBe("新竹新品牌");
  });

  it("unknown stores fall back to Store.name", () => {
    expect(getCustomerFacingStoreName({ slug: "demo", name: "Demo 店" })).toBe("Demo 店");
  });

  it("only falls back to the legacy brand when no store name is available", () => {
    expect(getCustomerFacingStoreName({ slug: "demo", name: "  " })).toBe("蒸足健康站");
    expect(getCustomerFacingStoreName(null)).toBe("蒸足健康站");
  });
});
