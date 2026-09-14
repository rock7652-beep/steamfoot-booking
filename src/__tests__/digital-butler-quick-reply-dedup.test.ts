import assert from "node:assert/strict";
import { it } from "vitest";
import type { LineMessage } from "@/lib/line";
import { addDigitalButlerEscapeQuickReplies, sanitizeDigitalButlerReplyMessages } from "@/server/services/digital-butler-line-reply";

const action = (label: string, text = label) => ({ type: "action" as const, action: { type: "message" as const, label, text } });
const menu = (labels: string[]): LineMessage[] => [{ type: "text", text: "請選擇", quickReply: { items: labels.map(label => action(label)) } }];
const items = (messages: LineMessage[]) => messages.flatMap(message => message.type === "text" ? message.quickReply?.items ?? [] : []);
for (const outcome of ["WAITING_INPUT", "VALIDATION_FAILED", "INFORMATION_ANSWERED"]) {
  it(`deduplicates the screenshot menu for ${outcome}`, () => {
    const original = menu(["我想預約體驗", "蒸足如何進行", "適合哪些人", "地址與營業時間", "轉接客服", "聯絡真人", "結束"]);
    const snapshot = JSON.stringify(original);
    const result = addDigitalButlerEscapeQuickReplies(original, outcome);
    assert.deepEqual(items(result).map(item => item.action.label), ["我想預約體驗", "蒸足如何進行", "適合哪些人", "地址與營業時間", "聯絡真人", "結束數位管家"]);
    assert.equal(JSON.stringify(original), snapshot);
    assert.deepEqual(addDigitalButlerEscapeQuickReplies(result, outcome), result);
  });
}
it("retains the contact collection action", () => {
  const original: LineMessage[] = [{ type: "text", text: "選單", quickReply: { items: [
    action("請店家聯絡我", "CONTACT_STORE"),
  ] } }];
  assert.deepEqual(items(addDigitalButlerEscapeQuickReplies(original, "WAITING_INPUT")).slice(0, 1), items(original));
});
it("deduplicates across messages before an invisible carrier is sanitized", () => {
  const original: LineMessage[] = [...menu(["我想預約體驗", "轉接客服"]), { type: "text", text: "\u200B", quickReply: { items: [action("真人客服")] } }];
  const result = sanitizeDigitalButlerReplyMessages(addDigitalButlerEscapeQuickReplies(original, "WAITING_INPUT"));
  assert.deepEqual(items(result).map(item => item.action.label), ["我想預約體驗", "聯絡真人", "結束數位管家"]);
});
it("removes an empty earlier quick reply and respects the 13-action limit", () => {
  const original = [...menu(["轉接客服"]), ...menu(Array.from({ length: 13 }, (_, i) => "項目" + i))];
  const result = addDigitalButlerEscapeQuickReplies(original, "WAITING_INPUT");
  assert.equal(result[0].type === "text" && result[0].quickReply, undefined);
  assert.equal(items(result).length, 13);
  assert.deepEqual(items(result).slice(-2).map(item => item.action.label), ["聯絡真人", "結束數位管家"]);
});
it("leaves terminal replies untouched", () => {
  const original = menu(["轉接客服"]);
  for (const outcome of ["HANDOFF_REQUESTED", "DIRECT_BOOKING", "COMPLETED", "CANCELLED_BY_USER"])
    assert.equal(addDigitalButlerEscapeQuickReplies(original, outcome), original);
});
