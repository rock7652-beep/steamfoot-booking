import { afterEach, expect, it, vi } from "vitest";
import { getConfiguredStoreLine, readStoreLineConfigs, storeLineIdentityProvider, requiresCourseLiffEntry } from "@/lib/store-line-config";
import { getLineAccessTokenForStore, getLineSecretForStore } from "@/lib/line-config";
import { resolveStoreLiffContext } from "@/server/services/store-liff-context";
import { storeLineAdditionsPreflight } from "../../scripts/store-line-additions-preflight";
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
it("allows an explicit shared OA with separate store identities and LIFF entries", () => {
  const shared = { ...config, sharedAccountKey: "ufun" };
  vi.stubEnv("STORE_LINE_CONFIG_JSON", JSON.stringify([shared, { ...shared, storeId: "course-b", slug: "course-b", liffId: "902-second" }]));
  expect(readStoreLineConfigs()).toHaveLength(2);
  expect(getConfiguredStoreLine("course-b")?.storeId).toBe("course-b");
  expect(resolveStoreLiffContext("course-b").config?.liffId).toBe("902-second");
});
it("allows a shared LIFF only in the same explicit account group", () => {
  const shared = { ...config, sharedAccountKey: "ufun" };
  vi.stubEnv("STORE_LINE_CONFIG_JSON", JSON.stringify([shared, { ...shared, storeId: "course-b", slug: "course-b" }]));
  expect(readStoreLineConfigs()).toHaveLength(2);
});
it("treats omitted and explicit PROVIDER modes as the same shared identity namespace", () => {
  const shared = { ...config, sharedAccountKey: "ufun" };
  vi.stubEnv("STORE_LINE_CONFIG_JSON", JSON.stringify([shared, { ...shared, storeId: "course-b", slug: "course-b", identityMode: "PROVIDER" }]));
  const entries = readStoreLineConfigs();
  expect(entries).toHaveLength(2);
  expect(storeLineIdentityProvider(entries[0])).toBe(storeLineIdentityProvider(entries[1]));
});
it.each([
  { sharedAccountKey: "other" },
  { channelSecretEnv: "OTHER_SECRET" },
  { accessTokenEnv: "OTHER_TOKEN" },
  { messagingChannelId: "999" },
  { providerId: "999", messagingProviderId: "999" },
  { identityMode: "CENTRAL" },
  { destination: "U" + "b".repeat(32), liffId: "902-second" },
])("rejects conflicting shared channel configuration %j", change => {
  const shared = { ...config, sharedAccountKey: "ufun" };
  vi.stubEnv("STORE_LINE_CONFIG_JSON", JSON.stringify([shared, { ...shared, storeId: "course-b", slug: "course-b", ...change }]));
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

const addition = {
  ...config, storeId: "store-soulife", slug: "soulife", providerId: "2005295754",
  messagingProviderId: "2005295754", loginChannelId: "2010761154",
  messagingChannelId: "2012197466", liffId: "2010761154-CmcQZ9Db",
  basicId: "@046mqwnp", destination: "U" + "b".repeat(32),
  accessTokenEnv: "LINE_SOULIFE_CHANNEL_ACCESS_TOKEN", channelSecretEnv: "LINE_SOULIFE_CHANNEL_SECRET",
};
it("adds an independent store without replacing or mutating the existing configuration", () => {
  const existing = JSON.stringify([config]);
  vi.stubEnv("STORE_LINE_CONFIG_JSON", existing);
  vi.stubEnv("STORE_LINE_ADDITIONAL_CONFIG_JSON", JSON.stringify([addition]));
  vi.stubEnv(addition.accessTokenEnv, "soulife-test-token");
  vi.stubEnv(addition.channelSecretEnv, "soulife-test-secret");
  expect(readStoreLineConfigs()).toEqual([config, addition]);
  expect(process.env.STORE_LINE_CONFIG_JSON).toBe(existing);
  expect(getLineAccessTokenForStore(addition.storeId)).toBe("soulife-test-token");
  expect(getLineSecretForStore(addition.slug)).toBe("soulife-test-secret");
  expect(resolveStoreLiffContext(addition.slug)).toMatchObject({ channelId: addition.loginChannelId, config: addition });
});
it("supports an additional store when the original source is absent", () => {
  vi.stubEnv("STORE_LINE_CONFIG_JSON", "");
  vi.stubEnv("STORE_LINE_ADDITIONAL_CONFIG_JSON", JSON.stringify([addition]));
  expect(readStoreLineConfigs()).toEqual([addition]);
});
it.each([
  { storeId: config.storeId }, { slug: config.slug }, { storeId: config.slug },
  { destination: config.destination }, { messagingChannelId: config.messagingChannelId },
  { liffId: config.liffId, loginChannelId: config.loginChannelId },
])("rejects a conflicting addition instead of overriding the original %j", conflict => {
  vi.stubEnv("STORE_LINE_CONFIG_JSON", JSON.stringify([config]));
  vi.stubEnv("STORE_LINE_ADDITIONAL_CONFIG_JSON", JSON.stringify([{ ...addition, ...conflict }]));
  expect(readStoreLineConfigs).toThrow();
});
it.each(["{bad", "null", "{}", JSON.stringify([{ ...addition, accessTokenEnv: "NEXT_PUBLIC_TOKEN" }])])(
  "rejects malformed additional configuration without exposing its contents", raw => {
    vi.stubEnv("STORE_LINE_CONFIG_JSON", JSON.stringify([config]));
    vi.stubEnv("STORE_LINE_ADDITIONAL_CONFIG_JSON", raw);
    expect(readStoreLineConfigs).toThrow();
  },
);
it("does not mask an invalid existing configuration with a valid addition", () => {
  vi.stubEnv("STORE_LINE_CONFIG_JSON", "{bad");
  vi.stubEnv("STORE_LINE_ADDITIONAL_CONFIG_JSON", JSON.stringify([addition]));
  expect(readStoreLineConfigs).toThrow();
});
it.each(["", "999"])("blocks the release when an addition's central Provider is unconfirmed (%s)", provider => {
  vi.stubEnv("STORE_LINE_CONFIG_JSON", JSON.stringify([config]));
  vi.stubEnv("STORE_LINE_ADDITIONAL_CONFIG_JSON", JSON.stringify([{ ...addition, identityMode: "CENTRAL" }]));
  vi.stubEnv("CENTRAL_LINE_PROVIDER_ID", provider);
  expect(storeLineAdditionsPreflight).toThrow("中央 Provider");
});
it("passes the release check using the existing matching central Provider value", () => {
  vi.stubEnv("STORE_LINE_CONFIG_JSON", JSON.stringify([config]));
  vi.stubEnv("STORE_LINE_ADDITIONAL_CONFIG_JSON", JSON.stringify([{ ...addition, identityMode: "CENTRAL" }]));
  vi.stubEnv("CENTRAL_LINE_PROVIDER_ID", addition.providerId);
  expect(storeLineAdditionsPreflight()).toEqual({ enabled: true });
  expect(process.env.CENTRAL_LINE_PROVIDER_ID).toBe(addition.providerId);
});
