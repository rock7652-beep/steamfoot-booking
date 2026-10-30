import { afterEach, beforeEach, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ bind:vi.fn(),store: vi.fn(), verify: vi.fn(), links: vi.fn(), update: vi.fn(), reply: vi.fn(), rebind: vi.fn() }));
vi.mock("@/server/services/store-line-notification-binding",()=>({bindStoreLineNotificationRecipient:m.bind}));
vi.mock("@/server/services/phone-line-rebind",()=>({completePhoneLineRebind:m.rebind}));
vi.mock("@/lib/db", () => ({ prisma: {
  store: { findFirst: m.store }, customerIdentityLink: { findMany: m.links }, customer: { updateMany: m.update },
} }));
vi.mock("@/lib/line", () => ({ verifyLineSignature: m.verify, replyMessage: m.reply }));
import { handleConfiguredCourseLineWebhook } from "@/server/services/configured-course-line-webhook";
const a = { storeId: "a", slug: "a", providerId: "901", loginChannelId: "902", messagingProviderId: "901", messagingChannelId: "903", liffId: "902-first", basicId: "@test", destination: "U" + "a".repeat(32), accessTokenEnv: "TEST_TOKEN", channelSecretEnv: "TEST_SECRET", sharedAccountKey: "ufun" };
const b = { ...a, storeId: "b", slug: "b", liffId: "902-second" };
const request = () => ({ destination: a.destination, body: "signed-body", signature: "signature", events: [{ type: "unfollow", source: { userId: "verified-subject" }, timestamp: Date.now() - 1000 }] });
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("STORE_LINE_CONFIG_JSON", JSON.stringify([a, b]));
  vi.stubEnv("STORE_LINE_ADDITIONAL_CONFIG_JSON", "");
  vi.stubEnv("NEXTAUTH_URL", "https://booking.example");
  m.verify.mockReturnValue(true);
  m.rebind.mockResolvedValue("not_requested");
  m.store.mockImplementation(async ({ where }) => ({ id: where.id, slug: where.slug, name: `門市 ${where.id}`, shopConfig: null }));
  m.links.mockImplementation(async ({ where }) => [{ customerId: "customer-" + where.storeId }]);
  m.update.mockResolvedValue({ count: 1 });
});
it("dispatches an authorized phone rebind only after the official account signature is verified", async () => {
  m.rebind.mockResolvedValue("linked");
  const input = { ...request(), events: [{ type: "message", source: { userId: "U" + "1".repeat(32) }, message: { type: "text", text: "0912345678" }, replyToken: "reply", timestamp: Date.now() }] };
  expect(await handleConfiguredCourseLineWebhook(input)).toBe("handled");
  expect(m.rebind).toHaveBeenCalledWith(expect.objectContaining({ storeIds: ["a", "b"], phone: "0912345678", destination: a.destination }));
  expect(m.reply).toHaveBeenCalledWith("a", "reply", [{ type: "text", text: "LINE 綁定已完成。" }]);
  m.rebind.mockClear(); m.verify.mockReturnValue(false);
  expect(await handleConfiguredCourseLineWebhook(input)).toBe("invalid_signature");
  expect(m.rebind).not.toHaveBeenCalled();
});
it.each([false,true])("never welcomes a follower, including a shared OA (%s)",async shared=>{
 vi.stubEnv("STORE_LINE_CONFIG_JSON",JSON.stringify(shared?[a,b]:[{...a,sharedAccountKey:undefined}]));
 m.links.mockResolvedValue([]);
 await handleConfiguredCourseLineWebhook({...request(),events:[{type:"follow",source:{userId:"new"},timestamp:Date.now(),replyToken:"reply"}]});
 expect(m.verify).toHaveBeenCalledOnce();expect(m.reply).not.toHaveBeenCalled();expect(m.update).not.toHaveBeenCalled();expect(m.rebind).not.toHaveBeenCalled();
});
it("does not welcome an invalid signature, non-follow event or invalid timestamp", async () => {
  m.verify.mockReturnValue(false);
  const input = { ...request(), events: [{ type: "follow", source: { userId: "new" }, timestamp: Date.now(), replyToken: "reply" }] };
  await handleConfiguredCourseLineWebhook(input);
  expect(m.store).not.toHaveBeenCalled(); expect(m.reply).not.toHaveBeenCalled();
  m.verify.mockReturnValue(true);
  await handleConfiguredCourseLineWebhook({ ...input, events: [{ ...input.events[0], timestamp: NaN }] });
  await handleConfiguredCourseLineWebhook({ ...input, events: [{ ...input.events[0], type: "unfollow" }] });
  expect(m.reply).not.toHaveBeenCalled();
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
it("routes an additional official account only to its own verified memberships", async () => {
  const addition = {
    ...a, storeId: "store-soulife", slug: "soulife", sharedAccountKey: undefined,
    messagingChannelId: "904", liffId: "902-soulife", basicId: "@046mqwnp",
    destination: "U" + "c".repeat(32), accessTokenEnv: "SOULIFE_TOKEN", channelSecretEnv: "SOULIFE_SECRET",
  };
  vi.stubEnv("STORE_LINE_ADDITIONAL_CONFIG_JSON", JSON.stringify([addition]));
  expect(await handleConfiguredCourseLineWebhook({ ...request(), destination: addition.destination })).toBe("handled");
  expect(m.verify).toHaveBeenCalledWith("store-soulife", "signed-body", "signature");
  expect(m.store).toHaveBeenCalledOnce();
  expect(m.update).toHaveBeenCalledOnce();
  expect(m.update.mock.calls[0][0].where.storeId).toBe("store-soulife");
});

it('dispatches a notification code before member handling and uses its matched store',async()=>{
 m.bind.mockResolvedValue({storeId:'b',reply:'綁定成功'});
 const input={...request(),events:[{type:'message',source:{userId:'verified-subject'},message:{type:'text',text:'綁定通知 ABCDEF1234'},replyToken:'reply'}]};
 expect(await handleConfiguredCourseLineWebhook(input)).toBe('handled');expect(m.bind).toHaveBeenCalledWith({storeIds:['a','b'],lineUserId:'verified-subject',bindingCode:'ABCDEF1234'});expect(m.reply).toHaveBeenCalledWith('b','reply',[{type:'text',text:'綁定成功'}]);expect(m.links).not.toHaveBeenCalled();expect(m.update).not.toHaveBeenCalled();
 m.bind.mockClear();m.verify.mockReturnValue(false);await handleConfiguredCourseLineWebhook(input);expect(m.bind).not.toHaveBeenCalled();
});
