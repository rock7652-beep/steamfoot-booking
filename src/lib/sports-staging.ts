import { assertSportsLiveFlowQaEnvironment } from "../../scripts/sports-live-flow-qa-scope.mjs";
/** Never enables on a deployment or against a non-loopback database. */
export function sportsStagingEnabled() {
  if (process.env.SPORTS_REDESIGN_STAGING !== "1") return false;
  assertSportsLiveFlowQaEnvironment(process.env);
  return true;
}
export function requireSportsStaging() {
  if (!sportsStagingEnabled()) throw new Error("運動改版僅開放隔離測試站");
}
