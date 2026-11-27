import { createHash } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { aiLinePlatformPreflight, type AiLinePlatformInventory } from "../../scripts/ai-line-platform-preflight";
const now = new Date("2026-11-26T09:00:00Z");
const facts = (): AiLinePlatformInventory => ({ project: "prj_EAXZKpdoYgLciwH9FTvLJZxuR8iR", database: "ttworfzgwejdeolegkxl", branch: "feat/ai-digital-butler-core", stopped: true,
  stores: ["steamfoot", "beauty", "fitness", "music"].map(name => ({ id: `ai-preview-${name}` as AiLinePlatformInventory["stores"][number]["id"], isDemo: true, enabled: false, channels: ["TEST"], hasLineDestination: false })),
  envs: [], reservedDestinationHashes: [], platformIngressVerified: false, liveSenderImplemented: false, messagingIdentityReadReady: false, originalRuntimePersistenceReady: false });
const proposal = () => ({ storeId: "ai-preview-beauty", providerId: "901", messagingChannelId: "903", destination: `U${"e".repeat(32)}`, independentTestOaConfirmed: true,
  secretEnv: "LINE_AI_TEST_CHANNEL_SECRET", accessTokenEnv: "LINE_AI_TEST_CHANNEL_ACCESS_TOKEN", testUserHashes: ["a".repeat(64)], expiresAt: "2026-11-26T09:30:00Z", maxReplies: 4, maxOpenaiRequests: 0, mode: "GUEST_PUBLIC_KNOWLEDGE" });
beforeEach(() => vi.stubGlobal("fetch", vi.fn(() => { throw Error("NO_NETWORK"); })));
afterEach(() => { expect(fetch).not.toHaveBeenCalled(); vi.unstubAllGlobals(); });
it("reports the current blocked sink, identity and ingress gaps without granting access", () => {
  expect(aiLinePlatformPreflight(facts(), undefined, now)).toMatchObject({ readyForLiveRun: false, blockedBy: ["BLOCKED_SINK_HAS_NO_LIVE_SENDER", "DEDICATED_TEST_OA_PROPOSAL_REQUIRED", "LINE_PLATFORM_INGRESS_UNVERIFIED", "MESSAGING_IDENTITY_RLS_NOT_READY", "ORIGINAL_RUNTIME_PERSISTENCE_NOT_READY"] });
});
it("accepts a bounded guest-only proposal without Login/LIFF or secrets", () => {
  expect(aiLinePlatformPreflight(facts(), proposal(), now)).toMatchObject({ proposalValid: true, readyForLiveRun: false, requiresFreshAuthorization: true, effects: { connections: 0, messages: 0, credentialsCreated: 0, settingsChanged: 0 } });
});
it.each([{ storeId: "real-store" }, { maxOpenaiRequests: 1 }, { maxReplies: 5 }, { mode: "MEMBER" }, { secretEnv: "LINE_ZHUBEI_CHANNEL_SECRET" }, { accessTokenEnv: "NEXT_PUBLIC_TOKEN" }, { accessToken: "never-accept-secrets" }])("rejects an unsafe or secret-bearing proposal %#", extra => {
  expect(aiLinePlatformPreflight(facts(), { ...proposal(), ...extra }, now).blockedBy).toContain("TEST_OA_PROPOSAL_INVALID");
});
it.each(["2026-11-26T08:59:00Z", "2026-11-26T09:30:01Z"])("rejects expired/overlong window %s", expiresAt => { expect(aiLinePlatformPreflight(facts(), { ...proposal(), expiresAt }, now).blockedBy).toContain("TEST_WINDOW_INVALID"); });
it("rejects production/shared OA destination and duplicate test-user hashes", () => {
  const f = facts(); f.reservedDestinationHashes = [createHash("sha256").update(proposal().destination).digest("hex")];
  const result = aiLinePlatformPreflight(f, { ...proposal(), testUserHashes: ["a".repeat(64), "a".repeat(64)] }, now);
  expect(result.blockedBy).toEqual(expect.arrayContaining(["OA_DESTINATION_ALREADY_RESERVED", "TEST_USER_ALLOWLIST_DUPLICATE"]));
});
it.each(["production", "development", "other-branch", "shared-preview", "plain"])("rejects dedicated credential metadata scoped to %s", mode => {
  const f = facts(); f.envs = [{ key: "LINE_AI_TEST_CHANNEL_SECRET", type: mode === "plain" ? "plain" : "sensitive", target: [mode === "production" || mode === "development" ? mode : "preview"], gitBranch: mode === "shared-preview" ? null : mode === "other-branch" ? "other" : f.branch }];
  expect(aiLinePlatformPreflight(f, proposal(), now).blockedBy).toContain("DEDICATED_SECRET_SCOPE_UNSAFE");
});
it.each(["global-running", "store-enabled", "not-demo", "duplicate-store"])("requires restored safety baseline for %s", mode => {
  const f = facts(); if (mode === "global-running") f.stopped = false; if (mode === "store-enabled") f.stores[0].enabled = true; if (mode === "not-demo") f.stores[0].isDemo = false; if (mode === "duplicate-store") f.stores[0] = { ...f.stores[1] };
  expect(aiLinePlatformPreflight(f, proposal(), now).blockedBy).toContain("SAFE_BASELINE_REQUIRED");
});
it("does not authorize live sends even if input claims all capabilities are ready", () => {
  const f = facts(); f.liveSenderImplemented = f.platformIngressVerified = f.messagingIdentityReadReady = f.originalRuntimePersistenceReady = true;
  for (const s of f.stores) { s.channels = ["LINE"]; s.hasLineDestination = true; }
  f.envs = ["LINE_AI_TEST_CHANNEL_SECRET", "LINE_AI_TEST_CHANNEL_ACCESS_TOKEN"].map(key => ({ key, type: "sensitive", target: ["preview"], gitBranch: f.branch }));
  expect(aiLinePlatformPreflight(f, proposal(), now)).toMatchObject({ proposalValid: true, blockedBy: [], readyForLiveRun: false, requiresFreshAuthorization: true });
});
it("reports inherited LINE keys, never their values", () => {
  const f = facts(); f.envs = [{ key: "LINE_ZHUBEI_CHANNEL_SECRET", type: "sensitive", target: ["preview", "production"], gitBranch: null }];
  expect(aiLinePlatformPreflight(f, undefined, now).inheritedLineKeys).toEqual(["LINE_ZHUBEI_CHANNEL_SECRET"]);
});
it("fails closed for a different repository branch or database", () => { expect(() => aiLinePlatformPreflight({ ...facts(), database: "production" }, proposal(), now)).toThrow(); });
it("does not treat an unconfirmed OA as independent", () => { expect(aiLinePlatformPreflight(facts(), { ...proposal(), independentTestOaConfirmed: false }, now).blockedBy).toContain("OA_INDEPENDENCE_UNCONFIRMED"); });
