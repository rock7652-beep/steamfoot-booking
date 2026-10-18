import "server-only";
import { sportsStagingEnabled } from "./sports-staging";

/** Only the existing isolated user-acceptance store may use preview navigation. */
export function sportsWorkspacePreviewEnabled(storeId?: string | null) {
  if (process.env.VERCEL_ENV !== "preview" || storeId !== "sports-live-flow-store") return false;
  return sportsStagingEnabled(storeId);
}
