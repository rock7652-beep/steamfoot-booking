/**
 * Pure, review-only planner. This is not a runtime authorization fallback.
 * The caller supplies a single read-only snapshot; no I/O occurs here.
 */
export const SHARED_CARD_INITIALIZATION_VERSION = "sports-shared-card-initialization-v1";

export type SharedCardInitializationStore = {
  storeId: string;
  industryModule: string;
  /** An ENABLED business.music row excludes the store, regardless of dates. */
  musicEnabled: boolean;
  /** Current persisted allowShared=true rows, including inactive plans. */
  sharedPlanCount: number;
  activeSharedPlanCount: number;
  /** Presence alone prevents initialization, regardless of state or dates. */
  sharedCardOverride: {
    id: string;
    status: string;
    startsAt: Date | null;
    expiresAt: Date | null;
  } | null;
};

export const SHARED_CARD_INITIALIZATION_SKIP_REASONS = [
  "EXISTING_SHARED_CARD_OVERRIDE",
  "UNSUPPORTED_INDUSTRY_MODULE",
  "MUSIC_ENABLED",
  "NO_CURRENT_SHARED_PLAN",
] as const;
export type SharedCardInitializationSkipReason = typeof SHARED_CARD_INITIALIZATION_SKIP_REASONS[number];

export type SharedCardInitializationProposal = {
  storeId: string;
  expectedAbsence: { storeId: string; featureKey: "shared_card"; anyStateAndDate: true };
  record: {
    storeId: string;
    featureKey: "shared_card";
    status: "ENABLED";
    source: "MANUAL";
    startsAt: null;
    expiresAt: null;
    note: string;
  };
  evidence: {
    industryModule: "COURSE";
    musicEnabled: false;
    sharedPlanCount: number;
    activeSharedPlanCount: number;
  };
  reviewFlags: "INACTIVE_SHARED_PLANS_ONLY"[];
};

export type SharedCardInitializationPlan = {
  mode: "DRY_RUN_ONLY";
  version: typeof SHARED_CARD_INITIALIZATION_VERSION;
  snapshotAt: string;
  counts: {
    scanned: number;
    proposed: number;
    skipped: number;
    inactiveOnlyProposed: number;
    /** Reasons can overlap; their sum is not necessarily the skipped count. */
    skipReasons: Record<SharedCardInitializationSkipReason, number>;
  };
  proposed: SharedCardInitializationProposal[];
  skipped: { storeId: string; reasons: SharedCardInitializationSkipReason[] }[];
};

export function planSportsSharedCardInitialization(
  stores: readonly SharedCardInitializationStore[],
  snapshotAt: Date,
): SharedCardInitializationPlan {
  if (!Number.isFinite(snapshotAt.getTime())) throw new Error("Invalid snapshot timestamp");
  const snapshot = snapshotAt.toISOString();
  const plan: SharedCardInitializationPlan = {
    mode: "DRY_RUN_ONLY",
    version: SHARED_CARD_INITIALIZATION_VERSION,
    snapshotAt: snapshot,
    counts: {
      scanned: stores.length,
      proposed: 0,
      skipped: 0,
      inactiveOnlyProposed: 0,
      skipReasons: {
        EXISTING_SHARED_CARD_OVERRIDE: 0,
        UNSUPPORTED_INDUSTRY_MODULE: 0,
        MUSIC_ENABLED: 0,
        NO_CURRENT_SHARED_PLAN: 0,
      },
    },
    proposed: [],
    skipped: [],
  };
  const seen = new Set<string>();
  // Stable order for human review and subsequent manifest hashing.
  const ordered = [...stores].sort((a, b) => a.storeId < b.storeId ? -1 : a.storeId > b.storeId ? 1 : 0);
  for (const store of ordered) {
    if (!store.storeId.trim() || seen.has(store.storeId)) {
      throw new Error("Snapshot contains an empty or duplicate store ID");
    }
    seen.add(store.storeId);
    if (!Number.isSafeInteger(store.sharedPlanCount) || store.sharedPlanCount < 0
      || !Number.isSafeInteger(store.activeSharedPlanCount) || store.activeSharedPlanCount < 0
      || store.activeSharedPlanCount > store.sharedPlanCount) {
      throw new Error("Snapshot contains invalid shared-plan counts");
    }
    const reasons: SharedCardInitializationSkipReason[] = [];
    if (store.sharedCardOverride !== null) reasons.push("EXISTING_SHARED_CARD_OVERRIDE");
    if (store.industryModule !== "COURSE") reasons.push("UNSUPPORTED_INDUSTRY_MODULE");
    if (store.musicEnabled) reasons.push("MUSIC_ENABLED");
    if (store.sharedPlanCount === 0) reasons.push("NO_CURRENT_SHARED_PLAN");
    if (reasons.length) {
      plan.skipped.push({ storeId: store.storeId, reasons });
      for (const reason of reasons) plan.counts.skipReasons[reason] += 1;
      continue;
    }
    const inactiveOnly = store.activeSharedPlanCount === 0;
    plan.proposed.push({
      storeId: store.storeId,
      expectedAbsence: { storeId: store.storeId, featureKey: "shared_card", anyStateAndDate: true },
      record: {
        storeId: store.storeId,
        featureKey: "shared_card",
        status: "ENABLED",
        source: "MANUAL",
        startsAt: null,
        expiresAt: null,
        note: `${SHARED_CARD_INITIALIZATION_VERSION}; reviewed snapshot ${snapshot}; existing sports allowShared plan; one-time initialization`,
      },
      evidence: {
        industryModule: "COURSE",
        musicEnabled: false,
        sharedPlanCount: store.sharedPlanCount,
        activeSharedPlanCount: store.activeSharedPlanCount,
      },
      reviewFlags: inactiveOnly ? ["INACTIVE_SHARED_PLANS_ONLY"] : [],
    });
    if (inactiveOnly) plan.counts.inactiveOnlyProposed += 1;
  }
  plan.counts.proposed = plan.proposed.length;
  plan.counts.skipped = plan.skipped.length;
  return plan;
}
