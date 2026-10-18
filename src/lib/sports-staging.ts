import { sportsProductionEnabled } from "../../scripts/sports-production-scope.mjs";
export { sportsProductionEnabled };
import { assertSportsRedesignPreviewEnvironment } from "../../scripts/sports-redesign-preview-scope.mjs";
import { assertSportsLiveFlowQaEnvironment } from "../../scripts/sports-live-flow-qa-scope.mjs";
/** Isolated QA or explicit production opt-in for an authenticated store. */
export function sportsStagingEnabled(storeId?: string) {
  if (process.env.SPORTS_REDESIGN_PRODUCTION === "1") return sportsProductionEnabled(storeId);
  if (process.env.SPORTS_REDESIGN_STAGING !== "1") return false;
  if (process.env.SPORTS_REDESIGN_PREVIEW === "1") assertSportsRedesignPreviewEnvironment(process.env);
  else assertSportsLiveFlowQaEnvironment(process.env);
  return true;
}
export function requireSportsStaging(storeId?: string) {
  if (!sportsStagingEnabled(storeId)) throw new Error("運動模組尚未開放此店家");
}
