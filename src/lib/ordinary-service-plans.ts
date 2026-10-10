/** Only for ordinary plan management and manual plan assignment choices.
 * TRIAL records remain available to FIRST_TRIAL booking/payment and history.
 */
export function selectOrdinaryServicePlans<T extends { category: string }>(plans: readonly T[]): T[] {
  return plans.filter((plan) => plan.category !== "TRIAL");
}
