import assert from "node:assert/strict";
import { it, vi } from "vitest";
import { DigitalButlerRuntime } from "@/server/services/digital-butler-runtime";

vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/lib/digital-butler-entitlement", () => ({ requireDigitalButlerConversationActivation: async () => {} }));
vi.mock("@/server/services/store-manager-line-notifications", () => ({ notifyStoreManagerOnLine: async () => {} }));

const menu = { id: "menu", stepKey: "menu", position: 0, type: "SINGLE_CHOICE", required: true, config: {
  text: "請選擇", options: [
    { label: "我想預約體驗", value: "BOOKING", nextStepKey: "name" },
    { label: "請店家聯絡我", value: "CONTACT_STORE", nextStepKey: "name" },
  ],
} };
const name = { id: "name", stepKey: "name", position: 1, type: "FREE_TEXT", required: true, config: { text: "請問怎麼稱呼您？", field: "name" } };

function fixture(provider = "LINE", active = true, cancelSucceeds = true) {
  process.env.DIGITAL_BUTLER_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64url");
  const calls: string[] = [];
  const conversation = { id: "conversation", storeId: "store-hsinchu", provider, flowId: "flow", flowVersionId: "v1",
    currentStepKey: "menu", expiresAt: new Date(Date.now() + 60_000), flowVersion: { steps: [menu, name] }, answers: [] };
  const repository = {
    claimEvent: async () => true, setEventOutcome: async () => {},
    findActiveConversation: async () => active ? conversation : null,
    expireConversation: async () => {},
    cancelConversation: async (storeId: string, id: string) => { assert.equal(storeId, "store-hsinchu"); assert.equal(id, "conversation"); calls.push("cancel"); return cancelSucceeds; },
    hasPreviousValidationFailure: async () => true,
    findTriggeredFlow: async () => ({ id: "flow", currentPublishedVersionId: "v1", publishedVersion: { steps: [menu, name] },
      startStepKey: "name", initialAnswer: { step: menu, value: { value: "BOOKING", label: "我想預約體驗" } } }),
    createConversation: async () => { calls.push("createConversation"); return conversation; },
    saveAnswer: async () => { calls.push("saveAnswer"); return true; },
    advanceConversation: async () => { calls.push("advance"); return true; },
    createLead: async () => { calls.push("createLead"); return { leadId: "lead", created: true }; },
  };
  const runtime = new DigitalButlerRuntime(repository as never, async () => {});
  return { calls, send: (text: string) => runtime.handleText({ storeId: "store-hsinchu", provider, channelAccountId: "oa-hsinchu", senderId: "user", webhookEventId: "event", text } as never) };
}

for (const text of ["我想預約體驗", "預約體驗", "立即預約體驗", " 我想預約體驗！ ", "BOOKING"]) {
  for (const active of [true, false]) {
    it(`LINE ${text} opens booking without contact collection (active=${active})`, async () => {
      const f = fixture("LINE", active);
      const result = await f.send(text);
      assert.equal(result.outcome, "DIRECT_BOOKING");
      assert.equal(result.messages[0]?.type, "text");
      assert.ok(result.messages[0] && "urlButton" in result.messages[0] && result.messages[0].urlButton);
      assert.deepEqual(f.calls, active ? ["cancel"] : []);
    });
  }
}
it("retains contact collection for CONTACT_STORE", async () => {
  const f = fixture();
  const result = await f.send("CONTACT_STORE");
  assert.equal(result.outcome, "WAITING_INPUT");
  assert.deepEqual(f.calls, ["saveAnswer", "advance"]);
  assert.deepEqual(result.messages, [{ type: "text", text: "請問怎麼稱呼您？" }]);
});
for (const text of ["轉真人", "無法符合選項的問題"]) {
  it(`LINE handoff offers optional booking: ${text}`, async () => {
    const f = fixture();
    const result = await f.send(text);
    assert.equal(result.outcome, "HANDOFF_REQUESTED");
    assert.ok(result.messages[0] && "urlButton" in result.messages[0] && result.messages[0].urlButton);
    assert.deepEqual(f.calls, ["cancel"]);
  });
}
for (const text of ["BOOKING", "我想預約體驗", "轉真人"]) {
  it(`suppresses replies when cancellation loses a race: ${text}`, async () => {
    const result = await fixture("LINE", true, false).send(text);
    assert.equal(result.outcome, "INACTIVE_CONVERSATION");
    assert.deepEqual(result.messages, []);
  });
}
it("preserves Messenger menu contact collection", async () => {
  const f = fixture("MESSENGER");
  assert.equal((await f.send("BOOKING")).outcome, "WAITING_INPUT");
  assert.deepEqual(f.calls, ["saveAnswer", "advance"]);
});
it("preserves Messenger handoff without a booking button", async () => {
  const result = await fixture("MESSENGER").send("轉真人");
  assert.equal(result.outcome, "HANDOFF_REQUESTED");
  assert.deepEqual(result.messages, [{ type: "text", text: "好的，已停止自動流程，將由門市夥伴接手協助您。" }]);
});
