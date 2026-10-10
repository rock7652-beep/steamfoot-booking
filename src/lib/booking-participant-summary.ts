/** Per-person facts. A group is presentation; identity, service and money are individual. */
export type BookingParticipantFact = {
  id: string;
  customerId: string | null;
  source: "RESERVATION" | "WALK_IN";
  service: "TRIAL" | "PACKAGE" | "SINGLE";
  status: "PENDING" | "COMPLETED" | "NO_SHOW" | "CANCELLED";
  arrived: boolean;
  /** Only effective received money; refunds are represented in netAmount. */
  trialPayment: { received: boolean; netAmount: number } | null;
};

/** No group-wide payment flag can complete another participant. */
export function summarizeBookingParticipants(facts: readonly BookingParticipantFact[]) {
  if (new Set(facts.map(fact => fact.id)).size !== facts.length) {
    throw new Error("參與者紀錄重複");
  }
  const reserved = facts.filter(fact => fact.source === "RESERVATION");
  const trialCompleted = facts.filter(fact => fact.service === "TRIAL" && fact.status === "COMPLETED");
  if (trialCompleted.some(fact => !fact.arrived || !fact.trialPayment?.received)) {
    throw new Error("體驗完成須有到店與收款紀錄");
  }
  return {
    originalPeople: reserved.length,
    walkInPeople: facts.length - reserved.length,
    reservedArrivals: reserved.filter(fact => fact.arrived).length,
    arrivalPeople: facts.filter(fact => fact.arrived).length,
    completedPeople: facts.filter(fact => fact.status === "COMPLETED").length,
    noShowPeople: facts.filter(fact => fact.status === "NO_SHOW").length,
    cancelledPeople: facts.filter(fact => fact.status === "CANCELLED").length,
    trialVisits: trialCompleted.length,
    trialCustomers: new Set(trialCompleted.flatMap(fact => fact.customerId ? [fact.customerId] : [])).size,
    unidentifiedTrialVisits: trialCompleted.filter(fact => !fact.customerId).length,
    trialNetRevenue: facts.reduce((sum, fact) => sum + (fact.trialPayment?.received ? fact.trialPayment.netAmount : 0), 0),
    /** A no-show/cancelled slot is resolved without collecting money. */
    resolved: facts.length > 0 && facts.every(fact => fact.status !== "PENDING"),
  };
}

export type ParticipantTrialFact = { storeId: string; customerId: string | null; date: string };
export type ParticipantPurchaseFact = {
  storeId: string;
  customerId: string;
  date: string;
  paid: boolean;
  voided: boolean;
  netAmount: number;
  /** Shared-card usage is not a purchase by the user of that card. */
  ownPurchase: boolean;
};

/** First eligible trial cohort, scoped to one store, deduplicated by actual customer.
 * Reporting service must supply all relevant history through the explicit as-of date.
 * Purchase revenue remains on purchase date; conversion belongs to trial date.
 */
export function summarizeParticipantConversion(input: {
  storeId: string;
  startDate: string;
  endDate: string;
  asOfDate: string;
  trials: readonly ParticipantTrialFact[];
  purchases: readonly ParticipantPurchaseFact[];
}) {
  const purchases = input.purchases.filter(p => p.storeId === input.storeId && p.ownPurchase && p.paid && !p.voided && p.netAmount > 0 && p.date <= input.asOfDate);
  const firstTrial = new Map<string, string>();
  const trials = input.trials.filter(t => t.storeId === input.storeId && t.date <= input.asOfDate);
  for (const trial of trials) {
    if (!trial.customerId) continue;
    // An existing paying customer does not become a new trial conversion on renewal.
    if (purchases.some(p => p.customerId === trial.customerId && p.date < trial.date)) continue;
    const previous = firstTrial.get(trial.customerId);
    if (!previous || trial.date < previous) firstTrial.set(trial.customerId, trial.date);
  }
  const cohort = [...firstTrial].filter(([, date]) => date >= input.startDate && date <= input.endDate);
  const convertedCustomerIds = cohort.filter(([id, date]) => purchases.some(p => p.customerId === id && p.date >= date)).map(([id]) => id);
  const unknownVisits = trials.filter(t => !t.customerId && t.date >= input.startDate && t.date <= input.endDate).length;
  return {
    trialCustomerIds: cohort.map(([id]) => id),
    convertedCustomerIds,
    unidentifiedTrialVisits: unknownVisits,
    /** Unknown people are visible as missing coverage, not silently treated as known customers. */
    conversionRate: cohort.length ? convertedCustomerIds.length / cohort.length * 100 : null,
    identityCoverageComplete: unknownVisits === 0,
  };
}
