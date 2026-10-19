import "server-only";
import { sportsStagingEnabled } from "./sports-staging";
/** Only the dedicated sports QA store on the guarded Preview branch. */
export function sportsNativePreview(storeId?: string) {
  return process.env.VERCEL_ENV === "preview" && storeId === "sports-live-flow-store" && sportsStagingEnabled(storeId);
}
