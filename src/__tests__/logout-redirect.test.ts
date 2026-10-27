import { describe, expect, it } from "vitest";
import { logoutRedirectForStore } from "@/lib/logout-redirect";

describe("logoutRedirectForStore", () => {
  it.each(["taichung", "zhubei", "hsinchu"])('returns to the originating %s login page', (slug) => {
    expect(logoutRedirectForStore(slug)).toBe(`/s/${slug}/`);
  });
  it("returns to HQ login without a valid store slug", () => {
    expect(logoutRedirectForStore(null)).toBe("/hq/login");
    expect(logoutRedirectForStore("https://attacker.example")).toBe("/hq/login");
  });
  it("keeps LIFF logout away from automatic login and rejects arbitrary destinations", () => {
    expect(logoutRedirectForStore("zhubei", "liff")).toBe("/s/zhubei/liff/signed-out");
    expect(logoutRedirectForStore("zhubei", "https://example.test")).toBe("/s/zhubei/");
    expect(logoutRedirectForStore("//example.test", "liff")).toBe("/hq/login");
    expect(logoutRedirectForStore(null, "liff")).toBe("/hq/login");
  });
});
