import { FEATURES, type FeatureKey } from "@/lib/feature-flags";

export function getPaidAddon(feature?: FeatureKey) {
  if (feature !== FEATURES.INVENTORY && feature !== FEATURES.WORK_ORDERS) return null;
  const label = feature === FEATURES.INVENTORY ? "進銷存管理" : "工單管理";
  return {
    label,
    title: `「${label}」需額外加購`,
    description: "各付費方案皆額外加購，每項原價 NT$800／月；優惠依方案頁公告。展店版不內含，請聯絡總部確認與開通。",
    retention: "關閉或加購到期後，原有資料仍保留；重新開通後可接續使用。",
    href: "/pricing#addons",
  };
}
