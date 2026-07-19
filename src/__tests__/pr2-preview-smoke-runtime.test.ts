import { afterEach, describe, expect, it } from "vitest";
import { assertPr2PreviewSmokeRuntime } from "@/server/services/pr2-preview-smoke-runtime";

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
    expect(assertPr2PreviewSmokeRuntime).not.toThrow();
  });

  it.each(["production", "development", undefined])("rejects non-Preview environment %s", (environment) => {
    staging();
    if (environment === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = environment;
    expect(assertPr2PreviewSmokeRuntime).toThrow("PR2_SMOKE_PREVIEW_RUNTIME_REQUIRED");
  });

  it("rejects a Production database reference", () => {
    staging();
    process.env.DIRECT_URL = "postgresql://db.qijlnhtpbintanzpxkvf.supabase.co/postgres";
    expect(assertPr2PreviewSmokeRuntime).toThrow("PR2_SMOKE_PREVIEW_RUNTIME_REQUIRED");
  });
});
