import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(path.join(process.cwd(), "src/app/(dashboard)/dashboard/settings/messenger-audit/recent-conversations-panel.tsx"), "utf8");

describe("recent Messenger conversations panel contract", () => {
  it("uses the existing diagnosis and safe end actions with an explicit second confirmation", () => {
    expect(source).toContain("onDiagnose(conversation.id)");
    expect(source).toContain("endMessengerConversationAction({ conversationId, confirmationConversationId: conversationId })");
    expect(source).toContain("確認結束這筆對話？顧客下次傳送訊息時會使用目前最新流程。");
    expect(source).toContain("setConfirmingId(null)");
  });

  it("does not render raw identity or answer fields and hides end controls for inactive conversations", () => {
    expect(source).not.toContain("senderIdCiphertext");
    expect(source).not.toContain("submittedAnswers");
    expect(source).not.toContain("phone");
    expect(source).toContain("activeStatuses.has(conversation.status)");
    expect(source).toContain("目前沒有 Messenger 對話紀錄。");
  });
});
