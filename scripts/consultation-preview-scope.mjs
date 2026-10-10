import { assertCourseSelfBookingPreviewEnvironment, COURSE_SELF_BOOKING_PREVIEW_BRANCH } from "./course-self-booking-preview-scope.mjs";
import {
  assertSportsSharedCardPreviewEnvironment,
  isSportsSharedCardProductionRelease,
} from "./sports-shared-card-preview-scope.mjs";

import {
  assertStoreOperationAuditPreviewEnvironment,
  STORE_OPERATION_AUDIT_PREVIEW_BRANCH,
} from "./store-operation-audit-preview-scope.mjs";

const PREVIEW_PROJECT = "ttworfzgwejdeolegkxl";
const PREVIEW_POOLER_HOSTS = new Set([
  "aws-0-ap-northeast-1.pooler.supabase.com",
  "aws-1-ap-northeast-1.pooler.supabase.com",
]);

/** @param {string} value @param {number} min @param {number} max */
function integerInRange(value, min, max) {
  return /^(0|[1-9]\d*)$/.test(value) && Number(value) >= min && Number(value) <= max;
}

// Only supported non-routing Prisma parameters are allowed. In particular,
// host/port/user/dbname/options/search_path cannot override the checked target.
/** @type {Record<string, (value: string) => boolean>} */
const PREVIEW_PARAMETERS = {
  schema: (value) => value === "public",
  sslmode: (value) => ["require", "verify-ca", "verify-full"].includes(value),
  sslaccept: (value) => value === "strict",
  pgbouncer: (value) => value === "true" || value === "false",
  connection_limit: (value) => integerInRange(value, 1, 100),
  connect_timeout: (value) => integerInRange(value, 0, 300),
  pool_timeout: (value) => integerInRange(value, 0, 300),
  socket_timeout: (value) => integerInRange(value, 0, 300),
  statement_cache_size: (value) => integerInRange(value, 0, 1000),
};

/** @param {string | undefined} value */
export function isIsolatedConsultationDatabaseUrl(value) {
  if (!value || /[\s\\\u0000-\u001f\u007f]/.test(value)) return false;
  try {
    const url = new URL(value);
    if (!["postgres:", "postgresql:"].includes(url.protocol)
      || url.pathname !== "/postgres" || url.hash) return false;
    const direct = url.hostname === `db.${PREVIEW_PROJECT}.supabase.co`
      && url.username === "postgres" && ["", "5432"].includes(url.port);
    const pooled = PREVIEW_POOLER_HOSTS.has(url.hostname)
      && url.username === `postgres.${PREVIEW_PROJECT}`
      && ["", "5432", "6543"].includes(url.port);
    if (!direct && !pooled) return false;
    const seen = new Set();
    for (const [key, parameter] of url.searchParams) {
      if (seen.has(key) || !Object.hasOwn(PREVIEW_PARAMETERS, key)
        || !PREVIEW_PARAMETERS[key](parameter)) return false;
      seen.add(key);
    }
    return true;
  } catch {
    return false;
  }
}

export const CONSULTATION_PREVIEW_BRANCH = "feat/hq-consultation-intake-20261008";
export const HQ_INTAKE_LIST_PREVIEW_BRANCH = "feat/hq-intake-list-live-filter-20261008";
export const HQ_PHONE_REVIEW_PREVIEW_BRANCH = "fix/hq-reviewed-phone-prefix";
export const HQ_INTAKE_DETAIL_PREVIEW_BRANCH = "fix/hq-intake-compact-details-20261009";
export const HQ_LEGACY_IMPORT_PREVIEW_BRANCH = "feat/hq-legacy-consultation-import-20261009";
export const SPORTS_ROSTER_PREVIEW_BRANCH = "fix/course-roster-two-line-20261008";
export const MODULE_ROSTER_PREVIEW_BRANCH = "fix/unify-module-notes-density";
export const INLINE_BOOKING_NOTES_PREVIEW_BRANCH = "feat/inline-booking-notes-local-20261009";
export const CUSTOMER_COURSE_PORTAL_PREVIEW_BRANCH = "feat/customer-course-portal-simplify-20261009";
export const SETTINGS_PERFORMANCE_PREVIEW_BRANCH = "fix/module-settings-save-latency-20261010";
export const ROOM_PERFORMANCE_PREVIEW_BRANCH = "fix/course-room-save-performance-20261010";
export const MUSIC_SETUP_PREVIEW_BRANCH = "fix/music-teacher-terminology-20261009";
export const BOOKING_PARTICIPANTS_PREVIEW_BRANCH = "feat/booking-participants-20261010";

/** @param {Readonly<Record<string, string | undefined>>} env */
export function assertBookingParticipantsPreviewEnvironment(env) {
  if (env.VERCEL !== "1" || env.VERCEL_ENV !== "preview" ||
      env.VERCEL_GIT_COMMIT_REF !== BOOKING_PARTICIPANTS_PREVIEW_BRANCH ||
      env.VERCEL_GIT_REPO_OWNER !== "rock7652-beep" || env.VERCEL_GIT_REPO_SLUG !== "steamfoot-booking" ||
      Boolean(env.WORKERS_CI_BRANCH) || Boolean(env.CF_PAGES_BRANCH)) {
    throw new Error("Booking participants requires its exact authorized Vercel Preview branch and repository.");
  }
  if (env.BOOKING_PARTICIPANTS_ENABLED !== "true" || env.CONSULTATION_PREVIEW_INTAKE_ENABLED === "true") {
    throw new Error("Booking participants Preview requires its own opt-in flag and no public consultation intake.");
  }
  if (![env.DATABASE_URL, env.DIRECT_URL].every(isIsolatedConsultationDatabaseUrl)) {
    throw new Error("Booking participants Preview requires the existing isolated database for both connections.");
  }
}
export const HQ_AUDIT_REFRESH_PREVIEW_BRANCH = "fix/hq-audit-auto-refresh-20261010";
export const STEAM_ROSTER_LEGACY_IPAD_PREVIEW_BRANCH = "fix/steam-roster-legacy-ipad-20261010";
export const STEAM_ROSTER_DENSITY_PREVIEW_BRANCH = "fix/steam-roster-ipad-density-20261010";

export const OPERATION_GUIDE_PREVIEW_BRANCH = "docs/operation-guide-audit-20261008";

/** Read-only documentation candidate against the existing isolated test database. */
export function assertOperationGuidePreviewEnvironment(env) {
  if (env.VERCEL !== "1" || env.VERCEL_ENV !== "preview" ||
      env.VERCEL_GIT_COMMIT_REF !== OPERATION_GUIDE_PREVIEW_BRANCH ||
      env.VERCEL_GIT_REPO_OWNER !== "rock7652-beep" || env.VERCEL_GIT_REPO_SLUG !== "steamfoot-booking" ||
      Boolean(env.WORKERS_CI_BRANCH) || Boolean(env.CF_PAGES_BRANCH)) {
    throw new Error("Operation guide Preview requires its exact authorized Vercel branch and repository.");
  }
  if (![env.DATABASE_URL, env.DIRECT_URL].every(isIsolatedConsultationDatabaseUrl)) {
    throw new Error("Operation guide Preview requires the existing isolated database for both connections.");
  }
}

/** Read existing isolated intake rows; no synthetic intake or migrations.
 * @param {Readonly<Record<string, string | undefined>>} env
 */
export function assertHqIntakeListPreviewEnvironment(env) {
  if (env.VERCEL !== "1" || env.VERCEL_ENV !== "preview" ||
      ![HQ_INTAKE_LIST_PREVIEW_BRANCH, HQ_INTAKE_DETAIL_PREVIEW_BRANCH, HQ_PHONE_REVIEW_PREVIEW_BRANCH].includes(env.VERCEL_GIT_COMMIT_REF ?? "") ||
      env.VERCEL_GIT_REPO_OWNER !== "rock7652-beep" || env.VERCEL_GIT_REPO_SLUG !== "steamfoot-booking" ||
      Boolean(env.WORKERS_CI_BRANCH) || Boolean(env.CF_PAGES_BRANCH)) {
    throw new Error("HQ intake list requires its exact authorized Vercel Preview branch and repository.");
  }
  if (env.CONSULTATION_HQ_ENABLED !== "true" || env.CONSULTATION_PREVIEW_INTAKE_ENABLED !== "false") {
    throw new Error("HQ intake list Preview requires HQ enabled and public Preview intake explicitly disabled.");
  }
  if (![env.DATABASE_URL, env.DIRECT_URL].every(isIsolatedConsultationDatabaseUrl)) {
    throw new Error("HQ intake list Preview requires the existing isolated database for both connections.");
  }
}

/** Historical import UI review uses synthetic rows in the existing isolated DB.
 * Schema and fixture operations are separately controlled; a build never runs them.
 * @param {Readonly<Record<string, string | undefined>>} env
 */
export function assertHqLegacyImportPreviewEnvironment(env) {
  if (env.VERCEL !== "1" || env.VERCEL_ENV !== "preview" ||
      env.VERCEL_GIT_COMMIT_REF !== HQ_LEGACY_IMPORT_PREVIEW_BRANCH ||
      env.VERCEL_GIT_REPO_OWNER !== "rock7652-beep" || env.VERCEL_GIT_REPO_SLUG !== "steamfoot-booking" ||
      Boolean(env.WORKERS_CI_BRANCH) || Boolean(env.CF_PAGES_BRANCH)) {
    throw new Error("Legacy consultation review requires its exact Vercel Preview branch and repository.");
  }
  if (env.CONSULTATION_HQ_ENABLED !== "true" || env.CONSULTATION_PREVIEW_INTAKE_ENABLED !== "false" ||
      ![env.DATABASE_URL, env.DIRECT_URL].every(isIsolatedConsultationDatabaseUrl)) {
    throw new Error("Legacy consultation Preview requires isolated connections, HQ enabled, and public intake disabled.");
  }
}

/** Existing sports test data only; no new flags, credentials or migration path.
 * @param {Readonly<Record<string, string | undefined>>} env
 */
export function assertSportsRosterPreviewEnvironment(env) {
  if (env.VERCEL !== "1" || env.VERCEL_ENV !== "preview" ||
      env.VERCEL_GIT_COMMIT_REF !== SPORTS_ROSTER_PREVIEW_BRANCH ||
      env.VERCEL_GIT_REPO_OWNER !== "rock7652-beep" || env.VERCEL_GIT_REPO_SLUG !== "steamfoot-booking" ||
      Boolean(env.WORKERS_CI_BRANCH) || Boolean(env.CF_PAGES_BRANCH)) {
    throw new Error("Sports roster requires its exact authorized Vercel Preview branch and repository.");
  }
  if (![env.DATABASE_URL, env.DIRECT_URL].every(isIsolatedConsultationDatabaseUrl)) {
    throw new Error("Sports roster Preview requires the existing isolated database for both connections.");
  }
}

/** Four-module UI review reuses the same isolated data and blocks migrations.
 * @param {Readonly<Record<string, string | undefined>>} env
 */
export function assertModuleRosterPreviewEnvironment(env) {
  if (env.VERCEL !== "1" || env.VERCEL_ENV !== "preview" ||
      ![MODULE_ROSTER_PREVIEW_BRANCH, INLINE_BOOKING_NOTES_PREVIEW_BRANCH, CUSTOMER_COURSE_PORTAL_PREVIEW_BRANCH, MUSIC_SETUP_PREVIEW_BRANCH, ROOM_PERFORMANCE_PREVIEW_BRANCH, SETTINGS_PERFORMANCE_PREVIEW_BRANCH, STEAM_ROSTER_DENSITY_PREVIEW_BRANCH, STEAM_ROSTER_LEGACY_IPAD_PREVIEW_BRANCH, HQ_AUDIT_REFRESH_PREVIEW_BRANCH].includes(env.VERCEL_GIT_COMMIT_REF ?? "") ||
      env.VERCEL_GIT_REPO_OWNER !== "rock7652-beep" || env.VERCEL_GIT_REPO_SLUG !== "steamfoot-booking" ||
      Boolean(env.WORKERS_CI_BRANCH) || Boolean(env.CF_PAGES_BRANCH)) {
    throw new Error("Module roster requires its exact authorized Vercel Preview branch and repository.");
  }
  if (![env.DATABASE_URL, env.DIRECT_URL].every(isIsolatedConsultationDatabaseUrl)) {
    throw new Error("Module roster Preview requires the existing isolated database for both connections.");
  }
}

/**
 * Existing unit tests mock the migration runner and business clients. This
 * narrowly scoped exception is never available on a deployed Vercel runtime.
 * @param {Readonly<Record<string, string | undefined>>} env
 */
export function isConsultationMockedUnitTest(env) {
  return env.NODE_ENV === "test" && env.VITEST === "true" &&
    Boolean(env.VITEST_WORKER_ID) && env.VERCEL !== "1";
}

/**
 * Strict consultation Preview gate, retained alongside the reviewed shared-card
 * Preview and positively identified production main. Never expose connections.
 * The release dispatcher below must run before build or database work.
 * @param {Readonly<Record<string, string | undefined>>} env
 */
export function assertConsultationPreviewEnvironment(env) {
  if (env.VERCEL_ENV !== "preview") {
    throw new Error("Consultation checkout requires VERCEL_ENV=preview with outbound notifications blocked.");
  }
  if (env.VERCEL_GIT_COMMIT_REF !== CONSULTATION_PREVIEW_BRANCH ||
      env.VERCEL_GIT_REPO_OWNER !== "rock7652-beep" || env.VERCEL_GIT_REPO_SLUG !== "steamfoot-booking" ||
      Boolean(env.WORKERS_CI_BRANCH) || Boolean(env.CF_PAGES_BRANCH)) {
    throw new Error("Consultation checkout requires its exact authorized Preview branch and repository metadata.");
  }
  if (env.CONSULTATION_HQ_ENABLED !== "true" || env.CONSULTATION_PREVIEW_INTAKE_ENABLED !== "true") {
    throw new Error("Consultation Preview requires both existing opt-in flags to be true.");
  }
  if (![env.DATABASE_URL, env.DIRECT_URL].every(isIsolatedConsultationDatabaseUrl)) {
    throw new Error("Consultation Preview requires the existing isolated database for both connections.");
  }
}

/**
 * Compose the exact Preview gates without allowing any to become a
 * fallback for malformed metadata. Production requires the reviewed full
 * provider provenance; the Preview-only intake flag must never leak there.
 * The existing no-database guide sandbox is handled before this dispatcher.
 * @param {Readonly<Record<string, string | undefined>>} env
 * @returns {"mocked-unit-test" | "production" | "consultation-preview" | "sports-shared-card-preview" | "sports-roster-preview" | "course-self-booking-preview" | "module-roster-preview" | "hq-intake-list-preview" | "hq-legacy-import-preview" | "operation-guide-preview" | "store-operation-audit-preview" | "booking-participants-preview"}
 */
export function assertReviewedReleaseEnvironment(env) {
  if (isConsultationMockedUnitTest(env)) return "mocked-unit-test";
  if (isSportsSharedCardProductionRelease(env)) {
    if (env.CONSULTATION_PREVIEW_INTAKE_ENABLED === "true") {
      throw new Error("Consultation Preview intake flag must be disabled on production main.");
    }
    return "production";
  }
  if (env.VERCEL_GIT_COMMIT_REF === OPERATION_GUIDE_PREVIEW_BRANCH) {
    assertOperationGuidePreviewEnvironment(env);
    return "operation-guide-preview";
  }
  if (env.VERCEL_GIT_COMMIT_REF === BOOKING_PARTICIPANTS_PREVIEW_BRANCH) {
    assertBookingParticipantsPreviewEnvironment(env);
    return "booking-participants-preview";
  }
  if ([MODULE_ROSTER_PREVIEW_BRANCH, INLINE_BOOKING_NOTES_PREVIEW_BRANCH, CUSTOMER_COURSE_PORTAL_PREVIEW_BRANCH, MUSIC_SETUP_PREVIEW_BRANCH, ROOM_PERFORMANCE_PREVIEW_BRANCH, SETTINGS_PERFORMANCE_PREVIEW_BRANCH, STEAM_ROSTER_DENSITY_PREVIEW_BRANCH, STEAM_ROSTER_LEGACY_IPAD_PREVIEW_BRANCH, HQ_AUDIT_REFRESH_PREVIEW_BRANCH].includes(env.VERCEL_GIT_COMMIT_REF ?? "")) {
    assertModuleRosterPreviewEnvironment(env);
    return "module-roster-preview";
  }
  if ([HQ_INTAKE_LIST_PREVIEW_BRANCH, HQ_INTAKE_DETAIL_PREVIEW_BRANCH, HQ_PHONE_REVIEW_PREVIEW_BRANCH].includes(env.VERCEL_GIT_COMMIT_REF ?? "")) {
    assertHqIntakeListPreviewEnvironment(env);
    return "hq-intake-list-preview";
  }
  if (env.VERCEL_GIT_COMMIT_REF === HQ_LEGACY_IMPORT_PREVIEW_BRANCH) {
    assertHqLegacyImportPreviewEnvironment(env);
    return "hq-legacy-import-preview";
  }
  if (env.VERCEL_GIT_COMMIT_REF === SPORTS_ROSTER_PREVIEW_BRANCH) {
    assertSportsRosterPreviewEnvironment(env);
    return "sports-roster-preview";
  }
  if (env.VERCEL_GIT_COMMIT_REF === CONSULTATION_PREVIEW_BRANCH) {
    assertConsultationPreviewEnvironment(env);
    return "consultation-preview";
  }
  if (env.VERCEL_GIT_COMMIT_REF === STORE_OPERATION_AUDIT_PREVIEW_BRANCH) {
    assertStoreOperationAuditPreviewEnvironment(env);
    return "store-operation-audit-preview";
  }
  if (env.VERCEL_GIT_COMMIT_REF === COURSE_SELF_BOOKING_PREVIEW_BRANCH) {
    assertCourseSelfBookingPreviewEnvironment(env);
    return "course-self-booking-preview";
  }
  assertSportsSharedCardPreviewEnvironment(env);
  return "sports-shared-card-preview";
}
