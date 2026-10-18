import { assertSportsRedesignPreviewEnvironment } from "../../scripts/sports-redesign-preview-scope.mjs";
import { assertSportsLiveFlowQaEnvironment } from "../../scripts/sports-live-flow-qa-scope.mjs";
/** Local QA or the exact isolated Preview; production remains forbidden. */
export function sportsStagingEnabled() {
  if (process.env.SPORTS_REDESIGN_STAGING !== "1") return false;
  if (process.env.SPORTS_REDESIGN_PREVIEW === "1") assertSportsRedesignPreviewEnvironment(process.env);
  else assertSportsLiveFlowQaEnvironment(process.env);
  return true;
}
export function requireSportsStaging() {
  if (!sportsStagingEnabled()) throw new Error("運動改版僅開放隔離測試站");
}
