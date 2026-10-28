/** Server-only rollout: enabling requires the migration and all clients to be ready. */
export function coursePurchaseIntentsEnabled(): boolean {
  return process.env.COURSE_PURCHASE_INTENTS_ENABLED === "1";
}
