import { describe, expect, it } from "vitest";
import { getLineConfigForStore } from "@/lib/line-config";
import { sha256 } from "@/server/services/line-rebind";

describe("LINE rebind prerequisites", () => {
  it("keeps the verified Hsinchu Basic ID in centralized config", () => {
    expect(getLineConfigForStore("store-hsinchu").expectedBasicId).toBe("@788umzem");
  });
  it("fails closed for stores without an explicitly configured Basic ID", () => {
    expect(getLineConfigForStore("store-zhubei").expectedBasicId).toBeNull();
    expect(getLineConfigForStore("store-taichung").expectedBasicId).toBeNull();
  });
  it("uses only a SHA-256 fingerprint for the old user ID", () => {
    const raw = "Uold-line-user-id";
    expect(sha256(raw)).toMatch(/^[a-f0-9]{64}$/);
    expect(sha256(raw)).not.toContain(raw);
  });
});
