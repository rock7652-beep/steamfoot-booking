import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Zhubei Messenger v13 publish panel contract", () => {
  const panel = readFileSync(resolve(process.cwd(), "src/app/(dashboard)/dashboard/settings/messenger-audit/flow-v13-publish-panel.tsx"), "utf8");
  const actions = readFileSync(resolve(process.cwd(), "src/app/(dashboard)/dashboard/settings/messenger-audit/flow-v13-publish-actions.ts"), "utf8");

  it("requires the fixed confirmation and shows the safe preview fields", () => {
    expect(panel).toContain("PUBLISH_ZHUBEI_MESSENGER_V13");
    expect(panel).toContain("v12／conversation／lead／submittedAnswers：均不修改");
    expect(panel).toContain('preview?.status === "READY"');
  });

  it("keeps the server action owner-only and client input limited to confirmation", () => {
    expect(actions).toContain('user.role !== "OWNER"');
    expect(actions).toContain('store.slug !== "zhubei"');
    expect(actions).toContain("confirmation.trim() !== ZHUBEI_V13_CONFIRMATION");
    expect(actions).not.toContain("flowIdInput");
    expect(actions).toContain("applyZhubeiMessengerV13PublishAction(confirmation: string)");
  });
});
