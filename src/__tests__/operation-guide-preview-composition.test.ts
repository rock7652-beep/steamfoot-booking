import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import {
  assertReviewedReleaseEnvironment,
  HQ_INTAKE_DETAIL_PREVIEW_BRANCH,
  HQ_INTAKE_LIST_PREVIEW_BRANCH,
  HQ_LEGACY_IMPORT_PREVIEW_BRANCH,
  HQ_PHONE_REVIEW_PREVIEW_BRANCH,
  INLINE_BOOKING_NOTES_PREVIEW_BRANCH,
  MODULE_ROSTER_PREVIEW_BRANCH,
  OPERATION_GUIDE_PREVIEW_BRANCH,
  SPORTS_ROSTER_PREVIEW_BRANCH,
} from "../../scripts/consultation-preview-scope.mjs";

const direct = "postgresql://postgres:synthetic@db.ttworfzgwejdeolegkxl.supabase.co:5432/postgres";
const pool = "postgresql://postgres.ttworfzgwejdeolegkxl:synthetic@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres";
const valid = {
  VERCEL: "1", VERCEL_ENV: "preview",
  VERCEL_GIT_REPO_OWNER: "rock7652-beep", VERCEL_GIT_REPO_SLUG: "steamfoot-booking",
  CONSULTATION_HQ_ENABLED: "true", CONSULTATION_PREVIEW_INTAKE_ENABLED: "false",
  DATABASE_URL: pool, DIRECT_URL: direct,
};
const cases = [
  [OPERATION_GUIDE_PREVIEW_BRANCH, "operation-guide-preview"],
  [HQ_LEGACY_IMPORT_PREVIEW_BRANCH, "hq-legacy-import-preview"],
  [HQ_INTAKE_LIST_PREVIEW_BRANCH, "hq-intake-list-preview"],
  [HQ_INTAKE_DETAIL_PREVIEW_BRANCH, "hq-intake-list-preview"],
  [HQ_PHONE_REVIEW_PREVIEW_BRANCH, "hq-intake-list-preview"],
  [MODULE_ROSTER_PREVIEW_BRANCH, "module-roster-preview"],
  [INLINE_BOOKING_NOTES_PREVIEW_BRANCH, "module-roster-preview"],
  [SPORTS_ROSTER_PREVIEW_BRANCH, "sports-roster-preview"],
] as const;

describe("operation guide and current-main Preview composition", () => {
  it.each(cases)("preserves the exact dispatcher for %s", (branch, mode) => {
    expect(assertReviewedReleaseEnvironment({ ...valid, VERCEL_GIT_COMMIT_REF: branch })).toBe(mode);
  });

  it.each(cases)("retains both isolated connection checks for %s", branch => {
    for (const key of ["DATABASE_URL", "DIRECT_URL"] as const) {
      for (const value of [undefined, "", direct.replace("ttworfzgwejdeolegkxl", "other-project"), direct + "?host=other.invalid"]) {
        expect(() => assertReviewedReleaseEnvironment({ ...valid, VERCEL_GIT_COMMIT_REF: branch, [key]: value })).toThrow();
      }
    }
  });

  it.each(cases)("does not broaden provider or branch admission for %s", branch => {
    for (const patch of [
      { VERCEL: undefined }, { VERCEL_ENV: "production" },
      { VERCEL_GIT_COMMIT_REF: `${branch}-copy` },
      { VERCEL_GIT_REPO_OWNER: "other" }, { VERCEL_GIT_REPO_SLUG: "other" },
      { WORKERS_CI_BRANCH: branch }, { CF_PAGES_BRANCH: branch },
    ]) {
      expect(() => assertReviewedReleaseEnvironment({ ...valid, VERCEL_GIT_COMMIT_REF: branch, ...patch })).toThrow();
    }
  });

  it.each(cases)("exits before database work or migrations for %s", (branch, mode) => {
    const tripwire = "PREVIEW_COMPOSITION_UNEXPECTED_DATABASE_OR_MIGRATION";
    const dbStub = `export class PrismaClient { constructor() { throw Error(${JSON.stringify(tripwire)}); } }`;
    const processStub = `export function execFileSync() { throw Error(${JSON.stringify(tripwire)}); }`;
    const preload = `import {registerHooks} from 'node:module'; registerHooks({resolve(s,c,n){const x=s==='@prisma/client'?${JSON.stringify(dbStub)}:s==='node:child_process'?${JSON.stringify(processStub)}:null;return x?{url:'data:text/javascript,'+encodeURIComponent(x),shortCircuit:true}:n(s,c);}});`;
    const env: NodeJS.ProcessEnv = {
      ...process.env, ...valid, VERCEL_GIT_COMMIT_REF: branch,
      NODE_ENV: "production", VITEST: "", VITEST_WORKER_ID: "",
      GUIDE_UI_PREVIEW: "", WORKERS_CI_BRANCH: "", CF_PAGES_BRANCH: "",
      PRODUCTION_MIGRATION_TARGET: "must-not-run",
    };
    const result = spawnSync(process.execPath, ["--import", `data:text/javascript,${encodeURIComponent(preload)}`, "scripts/ci-migrate.mjs"], {
      env, encoding: "utf8", timeout: 10_000,
    });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    const output = result.stdout + result.stderr;
    expect(output).toContain(`[${mode}] isolated_database=true notifications_blocked=true`);
    expect(output).toContain("migrations_skipped=true");
    expect(output).not.toContain(tripwire);
    expect(output).not.toContain(direct);
    expect(output).not.toContain(pool);
  });

  it.each([HQ_INTAKE_LIST_PREVIEW_BRANCH, HQ_INTAKE_DETAIL_PREVIEW_BRANCH, HQ_PHONE_REVIEW_PREVIEW_BRANCH, HQ_LEGACY_IMPORT_PREVIEW_BRANCH])(
    "retains HQ opt-in and public-intake blocking for %s", branch => {
      for (const patch of [{ CONSULTATION_HQ_ENABLED: "false" }, { CONSULTATION_PREVIEW_INTAKE_ENABLED: "true" }]) {
        expect(() => assertReviewedReleaseEnvironment({ ...valid, VERCEL_GIT_COMMIT_REF: branch, ...patch })).toThrow();
      }
    },
  );
});
