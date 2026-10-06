import { afterEach, beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ store: vi.fn(), verify: vi.fn(), links: vi.fn(), update: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: {
  store: { findFirst: m.store }, customerIdentityLink: { findMany: m.links }, customer: { updateMany: m.update },
} }));
vi.mock("@/lib/line", () => ({ verifyLineSignature: m.verify }));
import { handleConfiguredCourseLineWebhook } from "@/server/services/configured-course-line-webhook";
const a = { storeId: "a", slug: "a", providerId: "901", loginChannelId: "902", messagingProviderId: "901", messagingChannelId: "903", liffId: "902-first", basicId: "@test", destination: "U" + "a".repeat(32), accessTokenEnv: "TEST_TOKEN", channelSecretEnv: "TEST_SECRET", sharedAccountKey: "ufun" };
const b = { ...a, storeId: "b", slug: "b", liffId: "902-second" };
const request = () => ({ destination: a.destination, body: "signed-body", signature: "signature", events: [{ type: "unfollow", source: { userId: "verified-subject" }, timestamp: Date.now() - 1000 }] });
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("STORE_LINE_CONFIG_JSON", JSON.stringify([a, b]));
  m.verify.mockReturnValue(true);
  m.store.mockImplementation(async ({ where }) => ({ id: where.id }));
  m.links.mockImplementation(async ({ where }) => [{ customerId: "customer-" + where.storeId }]);
  m.update.mockResolvedValue({ count: 1 });
});
afterEach(() => vi.unstubAllEnvs());
it("updates both verified memberships with their own store predicates", async () => {
  expect(await handleConfiguredCourseLineWebhook(request())).toBe("handled");
  expect(m.verify).toHaveBeenCalledOnce();
  expect(m.update.mock.calls.map(([arg]) => [arg.where.storeId, arg.where.id])).toEqual([["a", "customer-a"], ["b", "customer-b"]]);
  expect(m.update.mock.calls.every(([arg]) => arg.data.lineLinkStatus === "BLOCKED")).toBe(true);
});
it("does not bind a follower who belongs only to one store", async () => {
  m.links.mockImplementation(async ({ where }) => where.storeId === "a" ? [{ customerId: "customer-a" }] : []);
  const input = request(); input.events[0].type = "follow";
  await handleConfiguredCourseLineWebhook(input);
  expect(m.update).toHaveBeenCalledOnce();
  expect(m.update.mock.calls[0][0].where.storeId).toBe("a");
});
it("rejects an invalid signature before querying any members or stores", async () => {
  m.verify.mockReturnValue(false);
  expect(await handleConfiguredCourseLineWebhook(request())).toBe("invalid_signature");
  expect(m.store).not.toHaveBeenCalled(); expect(m.links).not.toHaveBeenCalled(); expect(m.update).not.toHaveBeenCalled();
});
it("does not partially dispatch a group containing a missing or non-course store", async () => {
  m.store.mockResolvedValueOnce({ id: "a" }).mockResolvedValueOnce(null);
  expect(await handleConfiguredCourseLineWebhook(request())).toBe("handled");
  expect(m.links).not.toHaveBeenCalled();
});
it("does not infer a store from chat text or create memberships", async () => {
  const input = request(); input.events[0].type = "message";
  expect(await handleConfiguredCourseLineWebhook(input)).toBe("handled");
  expect(m.links).not.toHaveBeenCalled(); expect(m.update).not.toHaveBeenCalled();
});
it("leaves an unrelated official account on its existing route", async () => {
  expect(await handleConfiguredCourseLineWebhook({ ...request(), destination: "unrelated" })).toBe("unconfigured");
  expect(m.verify).not.toHaveBeenCalled(); expect(m.update).not.toHaveBeenCalled();
});
it("keeps timestamp ordering predicates for redelivered friendship events", async () => {
  const input = request(); await handleConfiguredCourseLineWebhook(input);
  expect(m.update.mock.calls[0][0].where.OR).toContainEqual({ lineLinkedAt: { lt: new Date(input.events[0].timestamp) } });
});
