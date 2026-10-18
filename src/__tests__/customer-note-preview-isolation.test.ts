import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { afterEach, expect, it, vi } from "vitest";
import {
  assertModuleRosterPreviewEnvironment,
  assertReviewedReleaseEnvironment,
  CUSTOMER_NOTE_PREVIEW_BRANCH,
} from "../../scripts/consultation-preview-scope.mjs";
import { guardedSportsSharedCardPreviewClient } from "@/lib/sports-shared-card-preview";
import { isPreviewExternalIntegrationBlocked } from "@/lib/runtime-env";

const direct = "postgresql://postgres:synthetic@db.ttworfzgwejdeolegkxl.supabase.co:5432/postgres";
const pool = "postgresql://postgres.ttworfzgwejdeolegkxl:synthetic@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres";
const valid = {
  VERCEL: "1", VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: CUSTOMER_NOTE_PREVIEW_BRANCH,
  VERCEL_GIT_REPO_OWNER: "rock7652-beep", VERCEL_GIT_REPO_SLUG: "steamfoot-booking",
  DATABASE_URL: pool, DIRECT_URL: direct, GUIDE_UI_PREVIEW: "", WORKERS_CI_BRANCH: "", CF_PAGES_BRANCH: "",
};
const invalidProvenance = [
  ["VERCEL", undefined], ["VERCEL_ENV", undefined], ["VERCEL_ENV", "production"],
  ["VERCEL_GIT_COMMIT_REF", undefined], ["VERCEL_GIT_COMMIT_REF", "main"],
  ["VERCEL_GIT_COMMIT_REF", `${CUSTOMER_NOTE_PREVIEW_BRANCH}-copy`],
  ["VERCEL_GIT_REPO_OWNER", undefined], ["VERCEL_GIT_REPO_OWNER", "other"],
  ["VERCEL_GIT_REPO_SLUG", undefined], ["VERCEL_GIT_REPO_SLUG", "other"],
  ["WORKERS_CI_BRANCH", CUSTOMER_NOTE_PREVIEW_BRANCH], ["CF_PAGES_BRANCH", CUSTOMER_NOTE_PREVIEW_BRANCH],
] as const;

afterEach(() => vi.unstubAllEnvs());

it("uses the existing isolated module Preview and permits the authorized Git auto-preview", () => {
  expect(CUSTOMER_NOTE_PREVIEW_BRANCH).toBe("fix/customer-note-pending-preview-20261012");
  expect(assertReviewedReleaseEnvironment(valid)).toBe("module-roster-preview");
  const deployment = JSON.parse(readFileSync("vercel.json", "utf8")).git.deploymentEnabled;
  expect(deployment[CUSTOMER_NOTE_PREVIEW_BRANCH]).not.toBe(false);
  expect(deployment.main).toBe(false);
});

it.each(invalidProvenance)("fails closed for %s=%s", (key, value) => {
  const env = { ...valid, [key]: value };
  expect(() => assertModuleRosterPreviewEnvironment(env)).toThrow();
  expect(() => assertReviewedReleaseEnvironment(env)).toThrow();
});

it.each(["DATABASE_URL", "DIRECT_URL"])("rejects unsafe %s without exposing connections", key => {
  for (const value of [undefined, "", "malformed", direct.replace("ttworfzgwejdeolegkxl", "qijlnhtpbintanzpxkvf"),
    direct + "?host=other.invalid", direct + "?hostaddr=127.0.0.1", direct + "?schema=private",
    direct + "?schema=public&schema=public", direct + "?options=-c%20search_path%3Dprivate",
    direct + "?sslmode=disable", direct + "?connection_limit=0"]) {
    expect(() => assertReviewedReleaseEnvironment({ ...valid, [key]: value })).toThrow("existing isolated database");
  }
});

it("rejects deployed test-flag bypasses before reading a cached client or creating a new one", () => {
  for (const [key, value] of Object.entries(valid)) vi.stubEnv(key, value);
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("VITEST", "true");
  vi.stubEnv("VITEST_WORKER_ID", "1");
  vi.stubEnv("DIRECT_URL", undefined);
  const read = vi.fn();
  const create = vi.fn();
  expect(() => guardedSportsSharedCardPreviewClient(read, create)).toThrow("existing isolated database");
  expect(read).not.toHaveBeenCalled();
  expect(create).not.toHaveBeenCalled();
});

it("keeps outbound integrations blocked on the exact authorized Preview", () => {
  for (const [key, value] of Object.entries(valid)) vi.stubEnv(key, value);
  expect(isPreviewExternalIntegrationBlocked()).toBe(true);
});

it("exits the build gate before any database construction or migration subprocess", () => {
  const tripwire = "CUSTOMER_NOTE_PREVIEW_UNEXPECTED_DATABASE_OR_SUBPROCESS";
  const stub = `export class PrismaClient { constructor() { throw Error(${JSON.stringify(tripwire)}); } }`;
  const processStub = `export function execFileSync() { throw Error(${JSON.stringify(tripwire)}); }`;
  const preload = `import {registerHooks} from 'node:module'; registerHooks({resolve(s,c,n){const x=s==='@prisma/client'?${JSON.stringify(stub)}:s==='node:child_process'?${JSON.stringify(processStub)}:null;return x?{url:'data:text/javascript,'+encodeURIComponent(x),shortCircuit:true}:n(s,c);}});`;
  const result = spawnSync(process.execPath, ["--import", `data:text/javascript,${encodeURIComponent(preload)}`, "scripts/ci-migrate.mjs"], {
    env: { ...process.env, ...valid, PRODUCTION_MIGRATION_TARGET: "must-not-run" },
    encoding: "utf8", timeout: 10000,
  });
  expect(result.error).toBeUndefined();
  expect(result.status).toBe(0);
  const output = result.stdout + result.stderr;
  expect(output).toContain("[module-roster-preview] isolated_database=true notifications_blocked=true migrations_skipped=true");
  expect(output).not.toContain(tripwire);
  expect(output).not.toContain(direct);
  expect(output).not.toContain(pool);
});
