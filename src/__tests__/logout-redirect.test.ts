import { describe, expect, it } from "vitest";
import { logoutRedirectForStore } from "@/lib/logout-redirect";

describe("logoutRedirectForStore", () => {
  it.each(["taichung", "zhubei", "hsinchu"])('returns to the originating %s login page', (slug) => {
    expect(logoutRedirectForStore(slug)).toBe(`/s/${slug}/`);
  });
  it("fails safely to store selection without a valid store slug", () => {
    expect(logoutRedirectForStore(null)).toBe("/store-select");
    expect(logoutRedirectForStore("https://attacker.example")).toBe("/store-select");
  });
});
