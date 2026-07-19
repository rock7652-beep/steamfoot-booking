import { afterEach, describe, expect, it, vi } from "vitest";
import { getLineConfigForStore } from "@/lib/line-config";
import { sha256 } from "@/server/services/line-rebind";

describe("LINE rebind prerequisites", () => {
  it("keeps the verified Hsinchu Basic ID in centralized config", () => {
    expect(getLineConfigForStore("store-hsinchu").expectedBasicId).toBe("@788umzem");
  });
  it("fails closed for stores without an explicitly configured Basic ID", () => {
    expect(getLineConfigForStore("store-zhubei").expectedBasicId).toBeNull();
  });
  it("uses the Staging Basic ID env only in Preview", () => {
    vi.stubEnv("LINE_STAGING_EXPECTED_BASIC_ID", "@staging");
    vi.stubEnv("VERCEL_ENV", "preview");
    expect(getLineConfigForStore("staging-store")).toMatchObject({ storeSlug: "staging", expectedBasicId: "@staging" });
    vi.stubEnv("VERCEL_ENV", "production");
    expect(getLineConfigForStore("staging-store")).toMatchObject({ expectedBasicId: null, accessToken: null });
  });
  it("uses only a SHA-256 fingerprint for the old user ID", () => {
    const raw = "Uold-line-user-id";
    expect(sha256(raw)).toMatch(/^[a-f0-9]{64}$/);
    expect(sha256(raw)).not.toContain(raw);
  });
});

afterEach(() => vi.unstubAllEnvs());
