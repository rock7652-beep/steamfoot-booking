import { sportsProductionEnabled } from "../../scripts/sports-production-scope.mjs";
import { sportsProductionStore } from "./sports-production-store";
import {courseWorkflowSportsPreview} from "../../scripts/course-workflow-preview-scope.mjs";
export { sportsProductionEnabled };
import { assertSportsRedesignPreviewEnvironment } from "../../scripts/sports-redesign-preview-scope.mjs";
import { assertSportsLiveFlowQaEnvironment } from "../../scripts/sports-live-flow-qa-scope.mjs";
/** Authorized sports module in production, or the unchanged isolated QA boundary. */
export async function sportsStagingEnabled(storeId?: string) {
  if (process.env.VERCEL_ENV === "production") return sportsProductionStore(storeId);
  if(courseWorkflowSportsPreview(storeId))return true;
  if (process.env.SPORTS_REDESIGN_PRODUCTION === "1") return sportsProductionEnabled(storeId);
  if (process.env.SPORTS_REDESIGN_STAGING !== "1") return false;
  if (process.env.SPORTS_REDESIGN_PREVIEW === "1") assertSportsRedesignPreviewEnvironment(process.env);
  else assertSportsLiveFlowQaEnvironment(process.env);
  return true;
}
export async function requireSportsStaging(storeId?: string) {
  if (!await sportsStagingEnabled(storeId)) throw new Error("運動模組尚未開放此店家");
}
