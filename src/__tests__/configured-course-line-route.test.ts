import { afterEach, beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ links: vi.fn(), account: vi.fn(), storeProbe: vi.fn(), centralProbe: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { customerIdentityLink: { findMany: m.links }, account: { findUnique: m.account } } }));
vi.mock("@/lib/line", () => ({ probeStoreLineRecipient: m.storeProbe, probeSteamButlerLineRecipient: m.centralProbe }));
import { resolveVerifiedReminderLineRoute } from "@/server/services/verified-reminder-line-route";
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("STORE_LINE_CONFIG_JSON", JSON.stringify([{ storeId: "a", slug: "a", providerId: "901", loginChannelId: "902", messagingProviderId: "901", messagingChannelId: "903", liffId: "902-test", basicId: "@test", destination: "U" + "a".repeat(32), accessTokenEnv: "TEST_TOKEN", channelSecretEnv: "TEST_SECRET" }]));
  m.links.mockResolvedValue([{ userId: "member", providerAccountId: "verified" }]);
  m.account.mockResolvedValue({ userId: "member" });
  m.storeProbe.mockResolvedValue({ status: "COMPATIBLE" });
});
afterEach(() => vi.unstubAllEnvs());
it("uses the verified store membership and own provider, not the legacy subject", async () => {
  expect(await resolveVerifiedReminderLineRoute("a", "untrusted-legacy", null, "customer-a")).toMatchObject({ status: "READY", channel: "STORE", recipientLineUserId: "verified" });
  expect(m.links).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ storeId: "a", customerId: "customer-a", provider: "line-provider:901" }) }));
  expect(m.storeProbe).toHaveBeenCalledWith("a", "verified");
  expect(m.centralProbe).not.toHaveBeenCalled();
});
it.each(["missing", "conflict", "unreachable"])("blocks %s identity without central fallback", async mode => {
  if (mode === "missing") m.links.mockResolvedValue([]);
  if (mode === "conflict") m.account.mockResolvedValue({ userId: "another" });
  if (mode === "unreachable") m.storeProbe.mockResolvedValue({ status: "INCOMPATIBLE" });
  expect(await resolveVerifiedReminderLineRoute("a", "legacy", null, "customer-a")).toMatchObject({ status: "BLOCKED" });
  expect(m.centralProbe).not.toHaveBeenCalled();
});
it("refuses requests with no scoped customer", async () => {
  expect(await resolveVerifiedReminderLineRoute("a", "legacy", null)).toMatchObject({ status: "BLOCKED" });
  expect(m.links).not.toHaveBeenCalled();
});
it("uses the supplied transaction connection for identity checks", async () => {
  const links = vi.fn().mockResolvedValue([{ userId: "member", providerAccountId: "verified" }]);
  const account = vi.fn().mockResolvedValue({ userId: "member" });
  const tx = { customerIdentityLink: { findMany: links }, account: { findUnique: account } };
  expect(await resolveVerifiedReminderLineRoute("a", null, null, "customer-a", tx as unknown as Parameters<typeof resolveVerifiedReminderLineRoute>[4])).toMatchObject({ status: "READY" });
  expect(links).toHaveBeenCalledOnce(); expect(account).toHaveBeenCalledOnce();
  expect(m.links).not.toHaveBeenCalled(); expect(m.account).not.toHaveBeenCalled();
});
