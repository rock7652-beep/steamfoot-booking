import "server-only";
import { sportsProductionEnabled } from "../../scripts/sports-production-scope.mjs";
import { sportsStagingEnabled } from "./sports-staging";
/** Historical name retained for callers; production requires the exact opt-in and store allowlist. */
export function sportsNativePreview(storeId?: string) {
  if (sportsProductionEnabled(storeId)) return true;
  return process.env.VERCEL_ENV === "preview" && storeId === "sports-live-flow-store" && sportsStagingEnabled(storeId);
}
