import "server-only";
import type { Prisma } from "../../../generated/course-client";
import { musicDataScope, LEGACY_MUSIC_CUSTOMER_IDS } from "./music-data-scope";

// Audited acceptance catalogs: explicit fixture identities and their synthetic holdings.
// General pricing catalogs (including music-demo-plan-*) are retained, not inferred from IDs.
export const LEGACY_MUSIC_PLAN_IDS = [
  "cmuhqow3c0000l604x8t36bn0", "cmulbcx3j0003l504uisnao7b",
  "cmulbd9h90006l504sq8phfnw", "cmulhta6w0002kx04ban3yp8t",
  "music-luby-accept-plan-4", "music-luby-accept-plan-8", "music-luby-demo-plan",
  "music-luby-group-plan-8-preview",
  "plan_4fe6c16b6edb74e3e072e684696e1104f805a79c4f47e6968baedbf795806f80",
  "qa-music-opening-ui-20261007-plan", "qa-music-states-20261007-group-plan",
  "qa-music-states-20261007-private-plan", "qa0928-plan-丙", "qa0928-plan-乙",
  "qa0928-plan-甲", "qa0928-private-renewal8", "qa1336-6657aa12-music-plan",
];
export function musicPlanWhere(storeId: string, value?: string): Prisma.CoursePointPlanWhereInput {
  const scope = musicDataScope(storeId, value);
  return scope ? { id: scope === "legacy" ? { in: LEGACY_MUSIC_PLAN_IDS } : { notIn: LEGACY_MUSIC_PLAN_IDS } } : {};
}
// Only exclusively verified synthetic memberships classify a holding as legacy.
// Mixed, unknown and memberless cards stay operational for review; no balance is split.
export function musicCardWhere(storeId: string, value?: string): Prisma.CoursePointCardWhereInput {
  const scope = musicDataScope(storeId, value);
  if (!scope) return {};
  const legacy: Prisma.CoursePointCardWhereInput = { members: {
    some: { storeId, customerId: { in: LEGACY_MUSIC_CUSTOMER_IDS } },
    every: { storeId, customerId: { in: LEGACY_MUSIC_CUSTOMER_IDS } },
  } };
  return scope === "legacy" ? legacy : { NOT: legacy };
}
