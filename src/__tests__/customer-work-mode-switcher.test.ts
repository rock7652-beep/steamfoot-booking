import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("customer portal work mode switcher", () => {
  it("is gated by the active store-scoped staff link", () => {
    const source = readFileSync("src/app/(customer)/layout.tsx", "utf8");

    expect(source).toContain("resolveActiveStaffMemberForStore");
    expect(source).toContain("activeStaffMember &&");
    expect(source).toContain("<IdentityModeSwitcher");
  });

  it("links the shared member portal to the SPA work page", () => {
    const source = readFileSync(
      "src/components/spa-identity-mode-switcher.tsx",
      "utf8",
    );

    expect(source).toContain('aria-label="身分切換"');
    expect(source).toContain("會員專區");
    expect(source).toContain("我的工作");
    expect(source).toContain("/liff/spa-work");
    expect(source).toContain('activeMode: "member" | "work"');
  });
});
