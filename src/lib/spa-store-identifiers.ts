import type { SpaSkillKey } from "@/lib/spa-treatment-defaults";

export const SPA_SKILLS: ReadonlyArray<{
  key: SpaSkillKey;
  name: string;
}> = [
  { key: "body", name: "身體芳療" },
  { key: "head", name: "頭部／肩頸" },
  { key: "foot", name: "足部療程" },
  { key: "face", name: "臉部保養" },
];

export function spaSkillId(storeId: string, key: SpaSkillKey): string {
  return storeId === "demo-store"
    ? `spa-demo-skill-${key}`
    : `${storeId}-spa-skill-${key}`;
}

export function spaSkillKeyFromId(id: string): SpaSkillKey | null {
  return SPA_SKILLS.find(({ key }) => id.endsWith(`-spa-skill-${key}`))?.key
    ?? SPA_SKILLS.find(({ key }) => id === `spa-demo-skill-${key}`)?.key
    ?? null;
}

export function isSpaSkillKey(
  value: SpaSkillKey | null,
): value is SpaSkillKey {
  return value !== null;
}

export function isStoreScopedSpaTreatmentId(
  storeId: string,
  treatmentId: string,
): boolean {
  if (storeId === "demo-store") return treatmentId.startsWith("spa-demo-treatment-");
  return treatmentId.startsWith(`${storeId}-spa-treatment-`);
}

export function inferSpaTreatmentKind(name: string): "SERVICE" | "COMBO" | "ADD_ON" {
  if (name.includes("加購")) return "ADD_ON";
  if (name.includes("套餐") || name.includes("組合")) return "COMBO";
  return "SERVICE";
}
