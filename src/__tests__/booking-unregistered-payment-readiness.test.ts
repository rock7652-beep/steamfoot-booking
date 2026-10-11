import { describe, expect, it } from "vitest";
import { assertUnregisteredParticipantEnvironment, assertUnregisteredParticipantSchema } from "../../scripts/booking-unregistered-payment-readiness.mjs";
const direct = "postgresql://postgres:synthetic@db.ttworfzgwejdeolegkxl.supabase.co:5432/postgres";
const env = { VERCEL: "1", VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: "fix/unregistered-companion-payment-20261011", VERCEL_GIT_REPO_OWNER: "rock7652-beep", VERCEL_GIT_REPO_SLUG: "steamfoot-booking", DATABASE_URL: direct, DIRECT_URL: direct };
describe("unregistered payment release readiness", () => {
  it("requires the exact isolated Preview and rejects either production connection", () => {
    expect(() => assertUnregisteredParticipantEnvironment(env)).not.toThrow();
    for (const key of ["DATABASE_URL", "DIRECT_URL"]) expect(() => assertUnregisteredParticipantEnvironment({ ...env, [key]: direct.replaceAll("ttworfzgwejdeolegkxl", "qijlnhtpbintanzpxkvf") })).toThrow();
    expect(() => assertUnregisteredParticipantEnvironment({ ...env, VERCEL_GIT_COMMIT_REF: "other" })).toThrow();
  });
  it("checks production schema independently of the collection flag, on verified main only", () => {
    const production = { ...env, VERCEL_ENV: "production", VERCEL_GIT_COMMIT_REF: "main", DATABASE_URL: direct.replaceAll("ttworfzgwejdeolegkxl", "qijlnhtpbintanzpxkvf"), DIRECT_URL: direct.replaceAll("ttworfzgwejdeolegkxl", "qijlnhtpbintanzpxkvf") };
    expect(() => assertUnregisteredParticipantEnvironment(production)).not.toThrow();
    expect(() => assertUnregisteredParticipantEnvironment({ ...production, VERCEL_GIT_COMMIT_REF: "other" })).toThrow();
    expect(() => assertUnregisteredParticipantEnvironment({ ...production, DIRECT_URL: direct })).toThrow();
  });
  it("fails closed for missing column, trace, guard or browser-accessible function", () => {
    const ready = { columns_ready: true, trace_ready: true, guard_ready: true, browser_callable: false };
    expect(() => assertUnregisteredParticipantSchema(ready)).not.toThrow();
    expect(() => assertUnregisteredParticipantSchema(undefined)).toThrow();
    for (const key of Object.keys(ready)) expect(() => assertUnregisteredParticipantSchema({ ...ready, [key]: !ready[key as keyof typeof ready] })).toThrow();
  });
});
