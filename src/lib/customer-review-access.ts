import { createHash, timingSafeEqual } from "node:crypto";
import { isIsolatedConsultationDatabaseUrl } from "../../scripts/consultation-preview-scope.mjs";

export const CUSTOMER_REVIEW_USER_ID = "staging-user-owner";
export const CUSTOMER_REVIEW_STORE_ID = "staging-store";
export const CUSTOMER_REVIEW_STORE_SLUG = "staging";
const BRANCH = "feat/customer-unified-detail-20261012";
type Environment = Readonly<Record<string, string | undefined>>;

/** Fail closed before any DB read. The capability is branch + DB + time scoped. */
export function customerReviewConfig(env: Environment = process.env, now = Date.now()) {
  if (env.VERCEL !== "1" || env.VERCEL_ENV !== "preview" ||
    env.VERCEL_GIT_COMMIT_REF !== BRANCH || env.VERCEL_GIT_REPO_OWNER !== "rock7652-beep" ||
    env.VERCEL_GIT_REPO_SLUG !== "steamfoot-booking" || env.CF_PAGES_BRANCH || env.WORKERS_CI_BRANCH ||
    env.CONSULTATION_PREVIEW_INTAKE_ENABLED !== "false" ||
    !isIsolatedConsultationDatabaseUrl(env.DATABASE_URL) || !isIsolatedConsultationDatabaseUrl(env.DIRECT_URL)) return null;
  const digest = env.CUSTOMER_REVIEW_TOKEN_SHA256;
  const issuedAt = Number(env.CUSTOMER_REVIEW_ISSUED_AT);
  const expiresAt = Number(env.CUSTOMER_REVIEW_EXPIRES_AT);
  if (!digest || !/^[a-f0-9]{64}$/.test(digest) || !Number.isSafeInteger(issuedAt) ||
    !Number.isSafeInteger(expiresAt) || issuedAt <= 0 || issuedAt > now || expiresAt <= now ||
    expiresAt <= issuedAt || expiresAt - issuedAt > 23 * 60 * 60 * 1000) return null;
  return { digest, expiresAt };
}

export function verifyCustomerReviewToken(token: unknown) {
  const config = customerReviewConfig();
  if (!config || typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token)) return null;
  const actual = createHash("sha256").update(token).digest();
  return timingSafeEqual(actual, Buffer.from(config.digest, "hex")) ? config : null;
}

export function customerReviewSessionValid(digest: unknown, expiresAt: unknown) {
  const config = customerReviewConfig();
  return !!config && config.digest === digest && config.expiresAt === expiresAt;
}
