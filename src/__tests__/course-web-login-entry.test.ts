import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ module: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Map([["x-store-slug", "own-store"]]), cookies: async () => new Map() }));
vi.mock("next/link", () => ({ default: "a" }));
vi.mock("@/components/steam-butler-logo", () => ({ SteamButlerLogo: "logo" }));
vi.mock("@/components/ref-capture", () => ({ RefCapture: "ref" }));
vi.mock("@/app/oauth-buttons", () => ({ OAuthButtons: "oauth" }));
vi.mock("@/app/customer-login-form", () => ({ CustomerLoginForm: "login" }));
vi.mock("@/lib/store-resolver", () => ({ resolveStoreBySlug: async () => ({ id: "store-own", slug: "own-store", name: "Store" }) }));
vi.mock("@/lib/industry-module-server", () => ({ getStoreIndustryModule: m.module }));
import HomePage from "@/app/page";
function findOAuth(node: React.ReactNode): Record<string, unknown> | undefined {
  if (!React.isValidElement<{ children?: React.ReactNode }>(node)) return;
  if (node.type === "oauth") return node.props;
  for (const child of React.Children.toArray(node.props.children)) {
    const found = findOAuth(child);
    if (found) return found;
  }
}
beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal("React", React); vi.stubEnv("STORE_LINE_CONFIG_JSON", ""); vi.stubEnv("COURSE_LIFF_REQUIRED_STORE_SLUGS", ""); });
afterEach(() => vi.unstubAllEnvs());
it.each(["course", "steamfoot", "spa"])("routes %s LINE to its appropriate authentication flow", async module => {
  m.module.mockResolvedValue(module);
  const page = await HomePage({ searchParams: Promise.resolve({}) });
  expect(findOAuth(page)?.lineEntryHref).toBeUndefined();
  expect(m.module).toHaveBeenCalledWith("store-own");
});
it.each(["course", "steamfoot", "spa"])("only selects the intended course cohort, preserving %s", async module => {
  m.module.mockResolvedValue(module);
  vi.stubEnv("COURSE_LIFF_REQUIRED_STORE_SLUGS", "own-store,other-store");
  const page = await HomePage({ searchParams: Promise.resolve({}) });
  expect(findOAuth(page)?.lineEntryHref).toBe(module === "course" ? "/s/own-store/liff" : undefined);
});
it("does not redirect an unselected course web trial", async () => {
  m.module.mockResolvedValue("course");
  vi.stubEnv("COURSE_LIFF_REQUIRED_STORE_SLUGS", "other-store");
  expect(findOAuth(await HomePage({ searchParams: Promise.resolve({}) }))?.lineEntryHref).toBeUndefined();
});
