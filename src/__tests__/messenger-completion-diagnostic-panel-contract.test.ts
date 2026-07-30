import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(path.join(process.cwd(), "src/app/(dashboard)/dashboard/settings/messenger-audit/conversation-reset-panel.tsx"), "utf8");

describe("Messenger completion diagnostic panel", () => {
  it("renders only the safe diagnostic fields", () => {
    expect(source).toContain("Conversation flow version");
    expect(source).toContain("Active flow version");
    expect(source).toContain("requestType selector");
    expect(source).toContain("Selector category");
    expect(source).toContain("Predicted completion");
    expect(source).toContain("Completion reason");
    expect(source).not.toContain("submittedAnswers");
    expect(source).not.toContain("externalUserId");
    expect(source).not.toContain("PSID");
    expect(source).not.toContain("phoneCiphertext");
  });
});
