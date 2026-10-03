import { describe, expect, it } from "vitest";
import { buildHqBrandRegions } from "@/lib/hq-brand-regions";

const store = (id: string, address: string | null, name = "門市") => ({ id, name, slug: id, shopConfig: { address } });
describe("HQ Taiwan distribution", () => {
  it("lists all 22 counties even without stores", () => {
    const result = buildHqBrandRegions([]);
    expect(result).toHaveLength(22);
    expect(result.every(item => item.count === 0)).toBe(true);
  });
  it("groups districts from normalized addresses without losing store counts", () => {
    const result = buildHqBrandRegions([store("a", "302新竹縣竹北市科大一路"), store("b", "新竹縣竹北市文興路"), store("c", "臺北市大安區信義路")]);
    expect(result.find(item => item.county === "新竹縣")).toMatchObject({ count: 2, districts: [{ district: "竹北市", stores: [{id:"a"},{id:"b"}] }] });
    expect(result.find(item => item.county === "台北市")?.districts[0].district).toBe("大安區");
    expect(result.reduce((sum,item) => sum+item.count,0)).toBe(3);
  });
  it("retains missing addresses without guessing a district", () => {
    const result = buildHqBrandRegions([store("zhubei", null),store("unknown", null)]);
    expect(result.find(item => item.county === "新竹縣")?.districts[0].district).toBe("待補行政區");
    expect(result.find(item => item.county === "未分類")?.count).toBe(1);
  });
});
