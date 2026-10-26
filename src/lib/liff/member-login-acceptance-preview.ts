import "server-only";
import { assertModuleRosterPreviewEnvironment } from "../../../scripts/consultation-preview-scope.mjs";

/** Nonsecret LIFF IDs, limited to this exact isolated acceptance branch. The
 * production mappings never read these values, even if an env is mis-scoped. */
export function resolveLoginAcceptanceLiffId(storeSlug: string | null | undefined, kind: "trial" | "member") {
  if (storeSlug !== "zhubei" || process.env.VERCEL_ENV !== "preview" ||
      process.env.VERCEL_GIT_COMMIT_REF !== "fix/new-member-purchase-login-check-20261026") return null;
  assertModuleRosterPreviewEnvironment(process.env);
  const id = process.env[kind === "trial" ? "STEAMFOOT_TRIAL_ACCEPTANCE_LIFF_ID" : "STEAMFOOT_MEMBER_ACCEPTANCE_LIFF_ID"]?.trim();
  if (!id) return null;
  if (!/^2010761154-[A-Za-z0-9]+$/.test(id)) throw new Error("Invalid isolated Login acceptance LIFF ID");
  return id;
}
