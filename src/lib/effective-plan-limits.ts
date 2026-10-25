import "server-only";

import {
  assertMusicOpeningPreviewEnvironment,
  MUSIC_OPENING_BRANCH,
  MUSIC_OPENING_STORE,
} from "../../scripts/music-opening-preview-scope.mjs";
import { getPlanLimits, type PlanLimits } from "@/lib/feature-flags";

/**
 * Server-resolved quotas for the isolated music workflow rehearsal only.
 * Database null overrides still mean "inherit"; no plan or stored value changes.
 * A supplied baseline preserves the legacy trial helper's existing quota policy.
 */
export function getEffectivePlanLimits(
  store: Parameters<typeof getPlanLimits>[0] & { id: string },
  baseline: PlanLimits = getPlanLimits(store),
): PlanLimits {
  const env = process.env;
  const musicClaim = [env.VERCEL_GIT_COMMIT_REF, env.WORKERS_CI_BRANCH, env.CF_PAGES_BRANCH]
    .includes(MUSIC_OPENING_BRANCH);
  if (!musicClaim) return baseline;

  // A claimed music deployment must fail closed even under test flags. Never
  // include supplied environment values (especially connection URLs) in errors.
  if (env.VERCEL !== "1") {
    throw new Error("Music opening quota override requires its authorized Vercel Preview.");
  }
  assertMusicOpeningPreviewEnvironment(env);
  if (store.id !== MUSIC_OPENING_STORE) return baseline;

  // These three subscription quotas are the entire exception. Class capacity,
  // conflicts, card balance, deductions, permissions and other quotas stay native.
  return { ...baseline, maxStaff: null, maxCustomers: null, maxMonthlyBookings: null };
}
