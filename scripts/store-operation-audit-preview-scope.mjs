import { isSportsSharedCardIsolatedConnection } from "./sports-shared-card-preview-scope.mjs";

export const STORE_OPERATION_AUDIT_PREVIEW_BRANCH = "feat/store-operation-audit-20261008";

/**
 * The audit review has its own exact release mode. Reuse only the reviewed
 * connection allowlist, never another feature's branch or opt-in flags.
 * Never expose connection values or credentials in an error.
 * @param {Readonly<Record<string, string | undefined>>} env
 */
export function assertStoreOperationAuditPreviewEnvironment(env) {
  if (env.VERCEL_ENV !== "preview") {
    throw new Error("Store operation audit branch requires VERCEL_ENV=preview with outbound notifications blocked.");
  }
  if (env.VERCEL_GIT_COMMIT_REF !== STORE_OPERATION_AUDIT_PREVIEW_BRANCH ||
      env.VERCEL_GIT_REPO_OWNER !== "rock7652-beep" || env.VERCEL_GIT_REPO_SLUG !== "steamfoot-booking" ||
      Boolean(env.WORKERS_CI_BRANCH) || Boolean(env.CF_PAGES_BRANCH)) {
    throw new Error("Store operation audit checkout requires its exact authorized Preview branch and repository metadata.");
  }
  if (![env.DATABASE_URL, env.DIRECT_URL].every(isSportsSharedCardIsolatedConnection)) {
    throw new Error("Store operation audit Preview requires the existing isolated database for both connections.");
  }
}
