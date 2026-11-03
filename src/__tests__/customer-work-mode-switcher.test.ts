import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("customer portal work mode switcher", () => {
  it("does not expose the retired staff identity switcher or work link", async () => {
    const source = readFileSync("src/app/(customer)/layout.tsx", "utf8");
    expect(source).not.toContain("<IdentityModeSwitcher");
    expect(source).not.toContain("/liff/spa-work");
    const {isRetiredModuleRoute}=await import("@/lib/retired-module-routes");
    for(const path of ["/liff/spa-work","/s/old/liff/spa-work","/s/old/staff/my-bookings"])
      expect(isRetiredModuleRoute(path,new URLSearchParams())).toBe(true);
  });
});
