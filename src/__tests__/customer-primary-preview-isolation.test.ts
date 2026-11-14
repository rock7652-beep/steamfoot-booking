import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertModuleRosterPreviewEnvironment,
  assertReviewedReleaseEnvironment,
} from "../../scripts/consultation-preview-scope.mjs";
import {CUSTOMER_PRIMARY_PREVIEW_BRANCH as PRIMARY_BRANCH,CUSTOMER_PROFILE_DENSITY_PREVIEW_BRANCH as DENSITY_BRANCH} from "../../scripts/sports-shared-card-preview-scope.mjs";
import {assertSportsRedesignPreviewEnvironment} from "../../scripts/sports-redesign-preview-scope.mjs";
import {musicNativeWorkflowEnabled,assertMusicPreviewDataReviewEnvironment} from "../../scripts/music-native-workflow-scope.mjs";
import {assertMusicOpeningPreviewEnvironment} from "../../scripts/music-opening-preview-scope.mjs";
import {sportsNativePreview} from "@/lib/sports-native-preview";
import { guardedSportsSharedCardPreviewClient } from "@/lib/sports-shared-card-preview";
import { isPreviewExternalIntegrationBlocked } from "@/lib/runtime-env";

describe.each([PRIMARY_BRANCH,DENSITY_BRANCH])("isolated customer preview %s",CUSTOMER_PRIMARY_PREVIEW_BRANCH=>{
const direct = "postgresql://postgres:synthetic@db.ttworfzgwejdeolegkxl.supabase.co:5432/postgres";
const pool = "postgresql://postgres.ttworfzgwejdeolegkxl:synthetic@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres";
const valid = {
  NODE_ENV: "production" as const,
  VERCEL: "1", VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: CUSTOMER_PRIMARY_PREVIEW_BRANCH,
  VERCEL_GIT_REPO_OWNER: "rock7652-beep", VERCEL_GIT_REPO_SLUG: "steamfoot-booking",
  DATABASE_URL: pool, DIRECT_URL: direct, GUIDE_UI_PREVIEW: "", WORKERS_CI_BRANCH: "", CF_PAGES_BRANCH: "",
};
const invalidProvenance = [
  ["VERCEL", undefined], ["VERCEL_ENV", undefined], ["VERCEL_ENV", "production"],
  ["VERCEL_GIT_COMMIT_REF", undefined], ["VERCEL_GIT_COMMIT_REF", "main"],
  ["VERCEL_GIT_COMMIT_REF", `${CUSTOMER_PRIMARY_PREVIEW_BRANCH}-copy`],
  ["VERCEL_GIT_REPO_OWNER", undefined], ["VERCEL_GIT_REPO_OWNER", "other"],
  ["VERCEL_GIT_REPO_SLUG", undefined], ["VERCEL_GIT_REPO_SLUG", "other"],
  ["WORKERS_CI_BRANCH", CUSTOMER_PRIMARY_PREVIEW_BRANCH], ["CF_PAGES_BRANCH", CUSTOMER_PRIMARY_PREVIEW_BRANCH],
] as const;

afterEach(() => vi.unstubAllEnvs());

it("uses the existing isolated module Preview and permits the authorized Git auto-preview", () => {
  expect([PRIMARY_BRANCH,DENSITY_BRANCH]).toContain(CUSTOMER_PRIMARY_PREVIEW_BRANCH);
  expect(assertReviewedReleaseEnvironment(valid)).toBe("module-roster-preview");
  const deployment = JSON.parse(readFileSync("vercel.json", "utf8")).git.deploymentEnabled;
  expect(deployment[CUSTOMER_PRIMARY_PREVIEW_BRANCH]).not.toBe(false);
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

it.each([false,true])("exits before any database construction or migration subprocess with native=%s", native => {
  const tripwire = "CUSTOMER_PRIMARY_PREVIEW_UNEXPECTED_DATABASE_OR_SUBPROCESS";
  const stub = `export class PrismaClient { constructor() { throw Error(${JSON.stringify(tripwire)}); } }`;
  const processStub = `export function execFileSync() { throw Error(${JSON.stringify(tripwire)}); }`;
  const preload = `import {registerHooks} from 'node:module'; registerHooks({resolve(s,c,n){const x=s==='@prisma/client'?${JSON.stringify(stub)}:s==='node:child_process'?${JSON.stringify(processStub)}:null;return x?{url:'data:text/javascript,'+encodeURIComponent(x),shortCircuit:true}:n(s,c);}});`;
  const result = spawnSync(process.execPath, ["--import", `data:text/javascript,${encodeURIComponent(preload)}`, "scripts/ci-migrate.mjs"], {
    env: { ...process.env, ...valid, ...(native?{VERCEL_PROJECT_ID:"prj_EAXZKpdoYgLciwH9FTvLJZxuR8iR",SPORTS_REDESIGN_STAGING:"1",SPORTS_REDESIGN_PREVIEW:"1",PRODUCTION_MIGRATION_TARGET:undefined}:{PRODUCTION_MIGRATION_TARGET:"must-not-run"}) },
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

// The production fitness module must be exercised through the native Preview.
it("enables native sports only for the exact authorized isolated project and branch", () => {
  const env={...valid,VERCEL_PROJECT_ID:"prj_EAXZKpdoYgLciwH9FTvLJZxuR8iR",SPORTS_REDESIGN_STAGING:"1",SPORTS_REDESIGN_PREVIEW:"1"};
  expect(()=>assertSportsRedesignPreviewEnvironment(env)).not.toThrow();
  for(const patch of [{VERCEL_PROJECT_ID:"other"},{VERCEL_ENV:"production"},{VERCEL_GIT_COMMIT_REF:CUSTOMER_PRIMARY_PREVIEW_BRANCH+"-copy"},{SPORTS_REDESIGN_PREVIEW:"0"},{SPORTS_LIVE_FLOW_QA:"1"},{PRODUCTION_MIGRATION_TARGET:"must-not-run"},{DIRECT_URL:direct.replace("ttworfzgwejdeolegkxl","qijlnhtpbintanzpxkvf")}]){
    expect(()=>assertSportsRedesignPreviewEnvironment({...env,...patch})).toThrow();
  }
});

it("exercises the native music and sports runtimes while retaining the importer boundary", async()=>{
  const env={...valid,VERCEL_PROJECT_ID:"prj_EAXZKpdoYgLciwH9FTvLJZxuR8iR",SPORTS_REDESIGN_STAGING:"1",SPORTS_REDESIGN_PREVIEW:"1"};
  for(const [key,value] of Object.entries(env))vi.stubEnv(key,value);
  expect(await sportsNativePreview("sports-live-flow-store")).toBe(true);
  expect(await sportsNativePreview("store-course-start-0918-a")).toBe(false);
  expect(musicNativeWorkflowEnabled("store-lubymusic",env)).toBe(true);
  expect(musicNativeWorkflowEnabled("another-store",env)).toBe(false);
  expect(()=>assertMusicPreviewDataReviewEnvironment(env)).not.toThrow();
  expect(()=>assertMusicOpeningPreviewEnvironment(env)).toThrow();
  expect(assertReviewedReleaseEnvironment(env)).toBe("module-roster-preview");
  const unsafe={...env,VERCEL_PROJECT_ID:"other"};
  expect(musicNativeWorkflowEnabled("store-lubymusic",unsafe)).toBe(false);
  expect(()=>assertMusicPreviewDataReviewEnvironment(unsafe)).toThrow();
});

});
