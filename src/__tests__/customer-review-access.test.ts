import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { customerReviewConfig, customerReviewSessionValid, verifyCustomerReviewToken } from "@/lib/customer-review-access";

const token = "a".repeat(64);
const digest = createHash("sha256").update(token).digest("hex");
const now = Date.now();
const env = {
  VERCEL: "1", VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "feat/customer-unified-detail-20261012",
  VERCEL_GIT_REPO_OWNER: "rock7652-beep", VERCEL_GIT_REPO_SLUG: "steamfoot-booking",
  DATABASE_URL: "postgresql://postgres:fixture@db.ttworfzgwejdeolegkxl.supabase.co:5432/postgres",
  DIRECT_URL: "postgresql://postgres:fixture@db.ttworfzgwejdeolegkxl.supabase.co:5432/postgres",
  CONSULTATION_PREVIEW_INTAKE_ENABLED: "false", CUSTOMER_REVIEW_TOKEN_SHA256: digest,
  CUSTOMER_REVIEW_ISSUED_AT: String(now - 1000), CUSTOMER_REVIEW_EXPIRES_AT: String(now + 60_000),
};
beforeEach(() => { for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value); });
afterEach(() => vi.unstubAllEnvs());

describe("isolated #1310 review capability", () => {
  it("accepts the capability only for the exact review configuration", () => {
    expect(verifyCustomerReviewToken(token)).toEqual({ digest, expiresAt: now + 60_000 });
    expect(verifyCustomerReviewToken("b".repeat(64))).toBeNull();
    expect(verifyCustomerReviewToken(undefined)).toBeNull();
    expect(verifyCustomerReviewToken(token + "extra")).toBeNull();
  });
  it.each([
    ["VERCEL", "0"], ["VERCEL_ENV", "production"], ["VERCEL_GIT_COMMIT_REF", "main"],
    ["VERCEL_GIT_REPO_OWNER", "other"], ["VERCEL_GIT_REPO_SLUG", "other"],
    ["CF_PAGES_BRANCH", "review"], ["WORKERS_CI_BRANCH", "review"],
    ["CONSULTATION_PREVIEW_INTAKE_ENABLED", "true"],
    ["DATABASE_URL", "postgresql://postgres:fixture@db.other.supabase.co:5432/postgres"],
    ["DIRECT_URL", env.DIRECT_URL + "?host=db.other.supabase.co"],
    ["CUSTOMER_REVIEW_TOKEN_SHA256", "invalid"], ["CUSTOMER_REVIEW_ISSUED_AT", ""],
    ["CUSTOMER_REVIEW_EXPIRES_AT", "NaN"],
  ])("denies mismatched %s before issuing a session", (key, value) => {
    vi.stubEnv(key, value);
    expect(verifyCustomerReviewToken(token)).toBeNull();
  });
  it("caps lifetime at 23 hours, including future activation and expiry", () => {
    expect(customerReviewConfig({ ...env, CUSTOMER_REVIEW_EXPIRES_AT: String(now - 1) }, now)).toBeNull();
    expect(customerReviewConfig({ ...env, CUSTOMER_REVIEW_ISSUED_AT: String(now + 1) }, now)).toBeNull();
    expect(customerReviewConfig({ ...env, CUSTOMER_REVIEW_EXPIRES_AT: String(now + 24 * 3600_000) }, now)).toBeNull();
  });
  it("revokes issued sessions when the environment, digest or expiry changes", () => {
    expect(customerReviewSessionValid(digest, now + 60_000)).toBe(true);
    expect(customerReviewSessionValid(digest, now + 59_999)).toBe(false);
    vi.stubEnv("CUSTOMER_REVIEW_TOKEN_SHA256", "f".repeat(64));
    expect(customerReviewSessionValid(digest, now + 60_000)).toBe(false);
    vi.stubEnv("VERCEL_ENV", "production");
    expect(customerReviewSessionValid("f".repeat(64), now + 60_000)).toBe(false);
  });
});
