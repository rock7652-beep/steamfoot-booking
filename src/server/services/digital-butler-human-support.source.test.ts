import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

describe("Digital Butler human support handoff contract", () => {
  it("records a durable support lead only after HANDOFF_REQUESTED", () => {
    const wrapper = source("src/server/services/digital-butler-runtime-with-handoff.ts");
    const handoff = source("src/server/services/human-support-handoff.ts");

    expect(wrapper).toContain('result.outcome === "HANDOFF_REQUESTED"');
    expect(wrapper).toContain("await recordHumanSupportHandoff(input)");
    expect(handoff).toContain('HUMAN_SUPPORT_COMPLETION_ACTION_KEY = "__human_support_handoff__"');
    expect(handoff).toContain("digitalButlerLead.upsert");
    expect(handoff).toContain('status: "CANCELLED"');
  });

  it("sends one immediate notification and keeps a deduplicated 30-minute reminder worker ready", () => {
    const handoff = source("src/server/services/human-support-handoff.ts");
    const messages = source("src/server/services/store-manager-line-notifications.ts");

    expect(handoff).toContain('eventKey = `human-support-requested:${lead.id}`');
    expect(handoff).toContain('eventKey = `human-support-final-reminder:${candidate.id}`');
    expect(handoff).toContain('status: "NEW"');
    expect(handoff).toContain("30 * 60 * 1000");
    expect(handoff).toContain("digitalButlerExecutionLog.create");
    expect(messages).toContain("🙋 顧客要求真人客服");
    expect(messages).toContain("⚠️ 真人客服仍未接手");
    expect(messages).toContain("這是最後一次即時提醒");
  });

  it("adds unresolved support to the 09:00 digest and keeps Hobby cron config deployable", () => {
    const digest = source("src/server/services/daily-action-digest.ts");
    const route = source("src/app/api/cron/human-support-reminders/route.ts");
    const vercel = source("vercel.json");

    expect(digest).toContain("waitingSupportCount");
    expect(digest).toContain("HUMAN_SUPPORT_COMPLETION_ACTION_KEY");
    expect(route).toContain("CRON_SECRET");
    expect(route).toContain("Bearer ${cronSecret}");
    expect(vercel).not.toContain('"schedule": "*/30 * * * *"');
  });
});
