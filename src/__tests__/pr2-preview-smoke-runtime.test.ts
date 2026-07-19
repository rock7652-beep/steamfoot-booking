import { afterEach, describe, expect, it } from "vitest";
import { assertPr2PreviewSmokeRuntime, pr2PreviewSmokeGuardReason } from "@/server/services/pr2-preview-smoke-runtime";

const original = {
  vercelEnv: process.env.VERCEL_ENV,
  databaseUrl: process.env.DATABASE_URL,
  directUrl: process.env.DIRECT_URL,
};

function staging() {
  process.env.VERCEL_ENV = "preview";
  process.env.DATABASE_URL = "postgresql://db.ttworfzgwejdeolegkxl.supabase.co/postgres";
  process.env.DIRECT_URL = "postgresql://db.ttworfzgwejdeolegkxl.supabase.co/postgres";
}

describe("PR-2 Preview smoke runtime guard", () => {
  afterEach(() => {
    process.env.VERCEL_ENV = original.vercelEnv;
    process.env.DATABASE_URL = original.databaseUrl;
    process.env.DIRECT_URL = original.directUrl;
  });

  it("allows only the expected Staging Preview project", () => {
    staging();
    expect(pr2PreviewSmokeGuardReason()).toBeNull();
    expect(assertPr2PreviewSmokeRuntime).not.toThrow();
  });

  it.each(["production", "development", undefined])("rejects non-Preview environment %s", (environment) => {
    staging();
    if (environment === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = environment;
    expect(pr2PreviewSmokeGuardReason()).toBe("NOT_PREVIEW");
    expect(assertPr2PreviewSmokeRuntime).toThrow("NOT_PREVIEW");
  });

  it("rejects a Production database reference", () => {
    staging();
    process.env.DIRECT_URL = "postgresql://db.qijlnhtpbintanzpxkvf.supabase.co/postgres";
    expect(pr2PreviewSmokeGuardReason()).toBe("PRODUCTION_REF_DETECTED");
    expect(assertPr2PreviewSmokeRuntime).toThrow("PRODUCTION_REF_DETECTED");
  });

  it.each([
    { field: "DATABASE_URL", value: undefined, reason: "DATABASE_URL_MISSING" },
    { field: "DIRECT_URL", value: undefined, reason: "DIRECT_URL_MISSING" },
    { field: "DATABASE_URL", value: "not-a-url", reason: "DATABASE_REF_UNREADABLE" },
    { field: "DIRECT_URL", value: "not-a-url", reason: "DIRECT_REF_UNREADABLE" },
    { field: "DATABASE_URL", value: "postgresql://db.other-project.supabase.co/postgres", reason: "DATABASE_REF_MISMATCH" },
    { field: "DIRECT_URL", value: "postgresql://db.other-project.supabase.co/postgres", reason: "DIRECT_REF_MISMATCH" },
  ])("returns $reason without exposing connection data", ({ field, value, reason }) => {
    staging();
    if (value === undefined) delete process.env[field];
    else process.env[field] = value;
    expect(pr2PreviewSmokeGuardReason()).toBe(reason);
  });
});
