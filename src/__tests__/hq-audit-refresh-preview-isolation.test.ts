import { mkdtempSync, openSync, closeSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { expect, it } from "vitest";
import { assertReviewedReleaseEnvironment, HQ_AUDIT_REFRESH_PREVIEW_BRANCH, AUDIT_READABLE_PREVIEW_BRANCH } from "../../scripts/consultation-preview-scope.mjs";

const isolated = "postgresql://postgres:synthetic@db.ttworfzgwejdeolegkxl.supabase.co:5432/postgres";
const env = {
  VERCEL: "1", VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: HQ_AUDIT_REFRESH_PREVIEW_BRANCH,
  VERCEL_GIT_REPO_OWNER: "rock7652-beep", VERCEL_GIT_REPO_SLUG: "steamfoot-booking",
  WORKERS_CI_BRANCH: "", CF_PAGES_BRANCH: "", DATABASE_URL: isolated, DIRECT_URL: isolated,
};
it("accepts the exact HQ audit refresh Preview and exits before any database or migration work", () => {
  expect(assertReviewedReleaseEnvironment(env)).toBe("module-roster-preview");
  const directory = mkdtempSync(join(tmpdir(), "audit-preview-gate-"));
  const outputPath = join(directory, "output.log"), output = openSync(outputPath, "w");
  try {
    // The dispatcher intentionally exits early; file-backed stdout avoids losing
    // buffered console output on Node 24 when the child exits with a pipe.
    const result = spawnSync(process.execPath, ["scripts/ci-migrate.mjs"], {
      env: {PATH: process.env.PATH, ...env, NODE_ENV: "production", GUIDE_UI_PREVIEW: "", PRODUCTION_MIGRATION_TARGET: "unapproved"},
      stdio: ["ignore", output, "pipe"], encoding: "utf8", timeout: 10_000,
    });
    const log = readFileSync(outputPath, "utf8");
    expect(result.status).toBe(0);
    expect(log).toContain("isolated_database=true notifications_blocked=true migrations_skipped=true");
    expect(log).not.toContain("recovery_preflight_started");
  } finally { closeSync(output); rmSync(directory, {recursive:true,force:true}); }
});
it.each(["DATABASE_URL", "DIRECT_URL"])("rejects a non-isolated %s before creating a runtime client", key => {
  expect(() => assertReviewedReleaseEnvironment({...env, [key]: "postgresql://production.invalid/db"})).toThrow("existing isolated database");
});
it.each(["VERCEL", "VERCEL_ENV", "VERCEL_GIT_REPO_OWNER", "VERCEL_GIT_REPO_SLUG", "WORKERS_CI_BRANCH", "CF_PAGES_BRANCH"])("rejects wrong provenance in %s", key => {
  expect(() => assertReviewedReleaseEnvironment({...env, [key]: "wrong"})).toThrow();
});

it("accepts only isolated connections for the readable audit preview", () => {
 const preview={...env,VERCEL_GIT_COMMIT_REF:AUDIT_READABLE_PREVIEW_BRANCH};
 expect(assertReviewedReleaseEnvironment(preview)).toBe("module-roster-preview");
 expect(()=>assertReviewedReleaseEnvironment({...preview,DATABASE_URL:"postgresql://production.invalid/db"})).toThrow();
 expect(()=>assertReviewedReleaseEnvironment({...preview,DIRECT_URL:"postgresql://production.invalid/db"})).toThrow();
});
