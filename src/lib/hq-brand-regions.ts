import { TAIWAN_REGION_ORDER, UNCLASSIFIED_TAIWAN_REGION, resolveTaiwanLocationLabel, resolveTaiwanRegion } from "@/lib/taiwan-region";

export interface BrandRegionStore { id: string; name: string; slug: string; shopConfig: { address: string | null } | null }

export function buildHqBrandRegions(stores: BrandRegionStore[]) {
  const counties = [...TAIWAN_REGION_ORDER, UNCLASSIFIED_TAIWAN_REGION].map(county => ({ county, stores: [] as (BrandRegionStore & { district: string })[] }));
  for (const store of stores) {
    const address = store.shopConfig?.address;
    const county = resolveTaiwanRegion([address, store.name, store.slug].filter(Boolean).join(" "));
    const district = resolveTaiwanLocationLabel(address) ?? "待補行政區";
    counties.find(item => item.county === county)!.stores.push({ ...store, district });
  }
  return counties.filter(item => item.county !== UNCLASSIFIED_TAIWAN_REGION || item.stores.length > 0).map(item => ({
    county: item.county,
    count: item.stores.length,
    districts: [...new Set(item.stores.map(store => store.district))].sort((a,b) => a.localeCompare(b, "zh-Hant")).map(district => ({
      district,
      stores: item.stores.filter(store => store.district === district).sort((a,b) => a.name.localeCompare(b.name, "zh-Hant")),
    })),
  }));
}
