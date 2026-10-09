import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { assertReviewedReleaseEnvironment, assertModuleRosterPreviewEnvironment, INLINE_BOOKING_NOTES_PREVIEW_BRANCH } from "../../scripts/consultation-preview-scope.mjs";

const direct = "postgresql://postgres:synthetic@db.ttworfzgwejdeolegkxl.supabase.co:5432/postgres";
const pool = "postgresql://postgres.ttworfzgwejdeolegkxl:synthetic@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres";
const valid = { VERCEL: "1", VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: INLINE_BOOKING_NOTES_PREVIEW_BRANCH,
  VERCEL_GIT_REPO_OWNER: "rock7652-beep", VERCEL_GIT_REPO_SLUG: "steamfoot-booking", DATABASE_URL: pool, DIRECT_URL: direct };

it("accepts only the exact isolated four-module roster Preview and needs no new flags", () => {
  expect(assertReviewedReleaseEnvironment(valid)).toBe("module-roster-preview");
  expect(() => assertModuleRosterPreviewEnvironment(valid)).not.toThrow();
  const deployment = JSON.parse(readFileSync("vercel.json", "utf8")).git.deploymentEnabled;
  expect(deployment[INLINE_BOOKING_NOTES_PREVIEW_BRANCH]).toBe(false);
  expect(deployment.main).not.toBe(false);
});

it.each([
  ["VERCEL", undefined], ["VERCEL_ENV", "production"], ["VERCEL_GIT_COMMIT_REF", "main"],
  ["VERCEL_GIT_COMMIT_REF", "feat/inline-booking-notes-local-20261009-copy"],
  ["VERCEL_GIT_REPO_OWNER", "other"], ["VERCEL_GIT_REPO_SLUG", "other"],
  ["WORKERS_CI_BRANCH", INLINE_BOOKING_NOTES_PREVIEW_BRANCH], ["CF_PAGES_BRANCH", INLINE_BOOKING_NOTES_PREVIEW_BRANCH],
])("rejects different provider/repository/branch provenance: %s=%s", (key, value) => {
  expect(() => assertModuleRosterPreviewEnvironment({ ...valid, [key!]: value })).toThrow();
});

it.each(["DATABASE_URL", "DIRECT_URL"])("rejects unsafe %s without revealing connection values", key => {
  for (const connection of [undefined, "", direct.replace("ttworfzgwejdeolegkxl", "production-project"),
    direct + "?host=other.invalid", direct + "?schema=private", direct + "?schema=public&schema=public",
    direct + "?options=-c%20search_path%3Dprivate", direct + "?sslmode=disable", direct + "?connection_limit=0"]) {
    expect(() => assertReviewedReleaseEnvironment({ ...valid, [key]: connection })).toThrow("existing isolated database");
  }
});

it("does not let mocked unit-test flags bypass a deployed Preview check", () => {
  expect(() => assertReviewedReleaseEnvironment({ ...valid, NODE_ENV: "test", VITEST: "true", VITEST_WORKER_ID: "1", DIRECT_URL: undefined })).toThrow();
});

it("exits the build gate before any Prisma construction or migration subprocess", () => {
  const tripwire = "INLINE_NOTE_PREVIEW_UNEXPECTED_DATABASE_OR_SUBPROCESS";
  const stub = `export class PrismaClient { constructor() { throw Error(${JSON.stringify(tripwire)}); } }`;
  const processStub = `export function execFileSync() { throw Error(${JSON.stringify(tripwire)}); }`;
  const preload = `import {registerHooks} from 'node:module'; registerHooks({resolve(s,c,n){const x=s==='@prisma/client'?${JSON.stringify(stub)}:s==='node:child_process'?${JSON.stringify(processStub)}:null;return x?{url:'data:text/javascript,'+encodeURIComponent(x),shortCircuit:true}:n(s,c);}});`;
  const result = spawnSync(process.execPath, ["--import", `data:text/javascript,${encodeURIComponent(preload)}`, "scripts/ci-migrate.mjs"], {
    env: { ...process.env, ...valid, GUIDE_UI_PREVIEW: "", WORKERS_CI_BRANCH: "", CF_PAGES_BRANCH: "", PRODUCTION_MIGRATION_TARGET: "must-not-run" },
    encoding: "utf8", timeout: 10000,
  });
  expect(result.error).toBeUndefined(); expect(result.status).toBe(0);
  const output = result.stdout + result.stderr;
  expect(output).toContain("[module-roster-preview] isolated_database=true notifications_blocked=true migrations_skipped=true");
  expect(output).not.toContain(tripwire); expect(output).not.toContain(direct); expect(output).not.toContain(pool);
});
