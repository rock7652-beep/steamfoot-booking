import { describe, expect, it, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { assertBookingParticipantsPreviewEnvironment, assertReviewedReleaseEnvironment, BOOKING_PARTICIPANTS_PREVIEW_BRANCH } from "../../scripts/consultation-preview-scope.mjs";
import { assertBookingParticipantsPreviewSchema, assertParticipantLifecycleSchema } from "../../scripts/booking-participants-preview-readiness.mjs";
import { isPreviewExternalIntegrationBlocked } from "@/lib/runtime-env";
const isolated = "postgresql://postgres:synthetic@db.ttworfzgwejdeolegkxl.supabase.co:5432/postgres";
const valid = {
  VERCEL: "1", VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: BOOKING_PARTICIPANTS_PREVIEW_BRANCH,
  VERCEL_GIT_REPO_OWNER: "rock7652-beep", VERCEL_GIT_REPO_SLUG: "steamfoot-booking",
  BOOKING_PARTICIPANTS_ENABLED: "true", DATABASE_URL: isolated, DIRECT_URL: isolated,
};
afterEach(() => vi.unstubAllEnvs());
describe("individual checkout preview isolation", () => {
  it("accepts only its isolated, explicitly enabled branch", () => {
    expect(assertReviewedReleaseEnvironment(valid)).toBe("booking-participants-preview");
  });
  it.each(["VERCEL", "VERCEL_ENV", "VERCEL_GIT_COMMIT_REF", "VERCEL_GIT_REPO_OWNER", "VERCEL_GIT_REPO_SLUG", "BOOKING_PARTICIPANTS_ENABLED"])("rejects missing or wrong %s", key => {
    for (const value of [undefined, "", "wrong"]) expect(() => assertBookingParticipantsPreviewEnvironment({ ...valid, [key]: value })).toThrow();
  });
  it.each(["DATABASE_URL", "DIRECT_URL"])("rejects production, malformed and routing override in %s", key => {
    for (const value of [undefined, "", isolated.replace("ttworfzgwejdeolegkxl", "qijlnhtpbintanzpxkvf"), isolated + "?host=production.invalid", isolated + "?sslmode=disable"])
      expect(() => assertBookingParticipantsPreviewEnvironment({ ...valid, [key]: value })).toThrow("isolated database");
  });
  it.each(["WORKERS_CI_BRANCH", "CF_PAGES_BRANCH"])("rejects conflicting provider %s", key => {
    expect(() => assertBookingParticipantsPreviewEnvironment({ ...valid, [key]: BOOKING_PARTICIPANTS_PREVIEW_BRANCH })).toThrow();
  });
  it("does not enable unrelated public intake", () => {
    expect(() => assertBookingParticipantsPreviewEnvironment({ ...valid, CONSULTATION_PREVIEW_INTAKE_ENABLED: "true" })).toThrow();
  });
  it("requires both protected tables and all four enabled guards", () => {
    const ready = { tables_ready: true, rls_enabled: true, browser_access: false, guards_ready: true, personal_session_ready: true, walk_in_guard_ready: true, wallet_fk_ready: true };
    expect(() => assertBookingParticipantsPreviewSchema(ready)).not.toThrow();
    for (const key of Object.keys(ready)) expect(() => assertBookingParticipantsPreviewSchema({ ...ready, [key]: undefined })).toThrow();
    expect(() => assertBookingParticipantsPreviewSchema({ ...ready, browser_access: true })).toThrow();
  });
  it("checks the actual draft DDL trigger names rather than invented names", () => {
    const ddl = readFileSync("docs/sql/booking-participants-draft.sql", "utf8");
    const readiness = readFileSync("scripts/booking-participants-preview-readiness.mjs", "utf8");
    const names = [...ddl.matchAll(/CREATE TRIGGER "([^"]+)"/g)].map(match => match[1]);
    expect(names).toHaveLength(5);
    for (const name of names) expect(readiness).toContain(`'${name}'`);
  });
  it("keeps external integrations blocked", () => {
    for (const [key, value] of Object.entries(valid)) vi.stubEnv(key, value);
    expect(isPreviewExternalIntegrationBlocked()).toBe(true);
  });
});

describe("lifecycle Preview deployment", () => {
  const lifecycle = {...valid, VERCEL_GIT_COMMIT_REF:"fix/trial-plan-status-20261011"};
  it("accepts only the authorized lifecycle branch with both isolated connections", () => {
    expect(assertReviewedReleaseEnvironment(lifecycle)).toBe("booking-participants-preview");
    expect(()=>assertReviewedReleaseEnvironment({...lifecycle,DIRECT_URL:isolated.replace("ttworfzgwejdeolegkxl","qijlnhtpbintanzpxkvf")})).toThrow();
    expect(()=>assertReviewedReleaseEnvironment({...lifecycle,BOOKING_PARTICIPANTS_ENABLED:"false"})).toThrow();
  });
  it("requires the actual lifecycle guards before building", () => {
    expect(()=>assertParticipantLifecycleSchema({lifecycle_ready:true})).not.toThrow();
    expect(()=>assertParticipantLifecycleSchema({lifecycle_ready:false})).toThrow();
    expect(()=>assertParticipantLifecycleSchema({})).toThrow();
  });
  it("never enables external notifications on this preview", () => {
    for (const [key,value] of Object.entries(lifecycle)) vi.stubEnv(key,value);
    expect(isPreviewExternalIntegrationBlocked()).toBe(true);
  });
});
