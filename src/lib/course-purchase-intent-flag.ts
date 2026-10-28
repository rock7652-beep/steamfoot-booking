/** Server-only rollout: enabling requires the migration and all clients to be ready. */
export function coursePurchaseIntentsEnabled(storeId?: string): boolean {
  if (process.env.COURSE_PURCHASE_INTENTS_ENABLED !== "1") return false;
  const qaBranch = process.env.VERCEL_GIT_COMMIT_REF === "release/music-production-20261023";
  if (qaBranch || process.env.COURSE_PURCHASE_QA_STORE_SCOPE === "1") {
    return qaBranch && process.env.VERCEL_ENV === "preview" && process.env.COURSE_PURCHASE_QA_STORE_SCOPE === "1" && storeId === "store-lubymusic";
  }
  return true;
}
