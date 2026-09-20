import { afterEach, expect, it, vi } from "vitest";
import { getConfiguredStoreLine, readStoreLineConfigs, storeLineIdentityProvider, requiresCourseLiffEntry } from "@/lib/store-line-config";
import { getLineAccessTokenForStore, getLineSecretForStore } from "@/lib/line-config";
import { resolveStoreLiffContext } from "@/server/services/store-liff-context";
const config = { storeId: "course-a", slug: "course-a", providerId: "901", loginChannelId: "902", messagingProviderId: "901", messagingChannelId: "903", liffId: "902-test", basicId: "@isolated-a", destination: "U" + "a".repeat(32), accessTokenEnv: "ISOLATED_A_TOKEN", channelSecretEnv: "ISOLATED_A_SECRET" };
afterEach(() => vi.unstubAllEnvs());
it("keeps explicit LIFF selection even without channels and leaves other web stores alone", () => {
  vi.stubEnv("STORE_LINE_CONFIG_JSON", "");
  vi.stubEnv("COURSE_LIFF_REQUIRED_STORE_SLUGS", "pilot-a,pilot-b");
  expect(requiresCourseLiffEntry("pilot-a")).toBe(true);
  expect(requiresCourseLiffEntry("legacy-web")).toBe(false);
});
it("configured independent channels always use LIFF even without a cohort entry", () => {
  vi.stubEnv("COURSE_LIFF_REQUIRED_STORE_SLUGS", "");
  vi.stubEnv("STORE_LINE_CONFIG_JSON", JSON.stringify([config]));
  expect(requiresCourseLiffEntry("course-a")).toBe(true);
});
it("rejects invalid cohort configuration rather than silently switching to web OAuth", () => {
  vi.stubEnv("COURSE_LIFF_REQUIRED_STORE_SLUGS", "pilot-a,");
  expect(() => requiresCourseLiffEntry("pilot-a")).toThrow();
});
it("uses only the registered store channel and provider namespace", () => {
  vi.stubEnv("STORE_LINE_CONFIG_JSON", JSON.stringify([config]));
  expect(resolveStoreLiffContext("course-a")).toMatchObject({ channelId: "902", identityProvider: "line-provider:901" });
  expect(storeLineIdentityProvider(config)).not.toBe("line");
  expect(getConfiguredStoreLine("other-store")).toBeNull();
});
it("does not fall back to another token when store credentials are missing", () => {
  vi.stubEnv("STORE_LINE_CONFIG_JSON", JSON.stringify([config]));
  vi.stubEnv("ISOLATED_A_TOKEN", ""); vi.stubEnv("ISOLATED_A_SECRET", "");
  vi.stubEnv("STEAM_BUTLER_LINE_CHANNEL_ACCESS_TOKEN", "central-test-only");
  expect(getLineAccessTokenForStore("course-a")).toBeNull();
  expect(getLineSecretForStore("course-a")).toBeNull();
  vi.stubEnv("ISOLATED_A_TOKEN", "own-test-only");
  expect(getLineAccessTokenForStore("course-a")).toBe("own-test-only");
});
it.each([
  { ...config, messagingProviderId: "999" },
  { ...config, liffId: "999-test" },
  { ...config, accessTokenEnv: "NEXT_PUBLIC_TOKEN" },
])("rejects incompatible provider, audience or public secrets", invalid => {
  vi.stubEnv("STORE_LINE_CONFIG_JSON", JSON.stringify([invalid]));
  expect(() => resolveStoreLiffContext("course-a")).toThrow();
});
it("rejects ambiguous store or destination mapping", () => {
  vi.stubEnv("STORE_LINE_CONFIG_JSON", JSON.stringify([config, { ...config, storeId: "course-b", slug: "course-b" }]));
  expect(readStoreLineConfigs).toThrow();
});
it("fails closed on malformed configuration instead of assuming central", () => {
  vi.stubEnv("STORE_LINE_CONFIG_JSON", "{bad");
  expect(() => resolveStoreLiffContext("course-a")).toThrow();
});
it("preserves the legacy central channel when no per-store configuration is installed", () => {
  vi.stubEnv("STORE_LINE_CONFIG_JSON", "");
  vi.stubEnv("CENTRAL_MEMBER_LINE_LOGIN_CHANNEL_ID", "legacy-channel");
  expect(resolveStoreLiffContext("zhubei")).toMatchObject({ channelId: "legacy-channel", identityProvider: "line", config: null });
});
