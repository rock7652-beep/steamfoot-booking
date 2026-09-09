import { describe, expect, it } from "vitest";
import { getLineConfigForStore } from "@/lib/line-config";
import { sha256 } from "@/server/services/line-rebind";

describe("LINE rebind prerequisites", () => {
  it("keeps the configured Hsinchu Basic ID in centralized config", () => {
    expect(getLineConfigForStore("store-hsinchu").expectedBasicId).toBe("@059rrqpw");
  });
  it("fails closed for stores without an explicitly configured Basic ID", () => {
    expect(getLineConfigForStore("unconfigured-store").expectedBasicId).toBeNull();
  });
  it("keeps each operating store on its own configured Basic ID", () => {
    expect(getLineConfigForStore("store-zhubei").expectedBasicId).toBe("@083vmikb");
    expect(getLineConfigForStore("store-taichung").expectedBasicId).toBe("@096ulbei");
  });
  it("uses only a SHA-256 fingerprint for the old user ID", () => {
    const raw = "Uold-line-user-id";
    expect(sha256(raw)).toMatch(/^[a-f0-9]{64}$/);
    expect(sha256(raw)).not.toContain(raw);
  });
});
