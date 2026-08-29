export type SpaDemoServiceKind = "SERVICE" | "COMBO" | "ADD_ON";
export type SpaDemoResourceType = "BED" | "CHAIR";

export type SpaDemoCatalogItem = {
  id: string;
  name: string;
  variant: string;
  price: number;
  serviceMinutes: number;
  bufferMinutes: number;
  skills: readonly string[];
  kind: SpaDemoServiceKind;
  resourceType: SpaDemoResourceType;
};

/**
 * Demo-only curated menu. Customers choose one main service/combo and may add
 * a small optional add-on; package sessions and stored value are not services.
 */
export const SPA_DEMO_CATALOG: readonly SpaDemoCatalogItem[] = [
  {
    id: "spa-demo-treatment-foot-60",
    name: "足部舒壓",
    variant: "60 分鐘",
    price: 900,
    serviceMinutes: 60,
    bufferMinutes: 5,
    skills: ["foot"],
    kind: "SERVICE",
    resourceType: "CHAIR",
  },
  {
    id: "spa-demo-treatment-body-60",
    name: "全身芳療",
    variant: "60 分鐘",
    price: 1800,
    serviceMinutes: 60,
    bufferMinutes: 10,
    skills: ["body"],
    kind: "SERVICE",
    resourceType: "BED",
  },
  {
    id: "spa-demo-treatment-body-90",
    name: "全身芳療",
    variant: "90 分鐘",
    price: 2500,
    serviceMinutes: 90,
    bufferMinutes: 10,
    skills: ["body"],
    kind: "SERVICE",
    resourceType: "BED",
  },
  {
    id: "spa-demo-treatment-face-60",
    name: "臉部保濕護理",
    variant: "60 分鐘",
    price: 2000,
    serviceMinutes: 60,
    bufferMinutes: 10,
    skills: ["face"],
    kind: "SERVICE",
    resourceType: "BED",
  },
  {
    id: "spa-demo-treatment-combo-a",
    name: "A 套餐｜足部＋肩頸",
    variant: "60 分鐘",
    price: 1200,
    serviceMinutes: 60,
    bufferMinutes: 5,
    skills: ["foot", "head"],
    kind: "COMBO",
    resourceType: "CHAIR",
  },
  {
    id: "spa-demo-treatment-combo-b",
    name: "B 套餐｜全身＋頭部",
    variant: "90 分鐘",
    price: 2200,
    serviceMinutes: 90,
    bufferMinutes: 10,
    skills: ["body", "head"],
    kind: "COMBO",
    resourceType: "BED",
  },
  {
    id: "spa-demo-treatment-combo-c",
    name: "C 套餐｜全身＋足部",
    variant: "120 分鐘",
    price: 2900,
    serviceMinutes: 120,
    bufferMinutes: 10,
    skills: ["body", "foot"],
    kind: "COMBO",
    resourceType: "BED",
  },
  {
    id: "spa-demo-treatment-addon-head-15",
    name: "加購頭部舒壓",
    variant: "15 分鐘",
    price: 300,
    serviceMinutes: 15,
    bufferMinutes: 0,
    skills: ["head"],
    kind: "ADD_ON",
    resourceType: "BED",
  },
  {
    id: "spa-demo-treatment-addon-foot-15",
    name: "加購足部放鬆",
    variant: "15 分鐘",
    price: 300,
    serviceMinutes: 15,
    bufferMinutes: 0,
    skills: ["foot"],
    kind: "ADD_ON",
    resourceType: "BED",
  },
] as const;

export const SPA_DEMO_RESOURCE_CAPACITY: Readonly<Record<SpaDemoResourceType, number>> = {
  BED: 2,
  CHAIR: 2,
};

export function findSpaDemoCatalogItem(id: string): SpaDemoCatalogItem | null {
  return SPA_DEMO_CATALOG.find((item) => item.id === id) ?? null;
}

export function inferSpaDemoResourceType(input: {
  treatmentId?: string | null;
  treatmentName?: string | null;
}): SpaDemoResourceType {
  const configured = input.treatmentId
    ? findSpaDemoCatalogItem(input.treatmentId)
    : null;
  if (configured) return configured.resourceType;

  const name = input.treatmentName ?? "";
  if (
    (name.includes("足部舒壓") || name.includes("A 套餐")) &&
    !name.includes("全身") &&
    !name.includes("臉部")
  ) {
    return "CHAIR";
  }
  return "BED";
}

export function spaResourceLabel(type: SpaDemoResourceType): string {
  return type === "CHAIR" ? "沙發椅" : "按摩床";
}
