# HQ feature presentation states

HQ per-store feature overrides now distinguish HIDDEN (no entry), LOCKED (visible, unavailable), and ENABLED (usable). INHERIT restores the plan/trial policy. All authorization still passes through hasStoreFeature; role and action permissions remain independent.

The initial rollout covers body tracking (ai_health_summary), multi-store access (multi_store), analysis (basic_reports), monthly settlement (service_fee_calculator), customer labels, course waitlists, and device preview. Preview is enabled by every existing plan to preserve previous availability. HQ member identity health diagnostics remains ADMIN-only and is unrelated to body tracking.

Active explicit ENABLED grants and HIDDEN/LOCKED restrictions take precedence over trial defaults. Historical DISABLED trial exceptions remain unchanged for compatibility. Future and expired overrides fall back to existing plan/trial access. Turning a feature off updates only its entitlement; it does not delete bookings, wallets, financial records, labels, or health records.

## Release validation

Apply the additive StoreFeatureEntitlementStatus migration before enabling the HQ controls in production. The isolated test database already contains the additional enum values. The new preview branch fails before build/migration when either DATABASE_URL or DIRECT_URL does not target that isolated database.

Verify an entitled store in each state: sidebar entries, nested settings entries, direct route/server-action rejection, saved status refresh, and dated override expiry. Check desktop and landscape iPad before merge. No new production migration or merge has been executed for this branch.
