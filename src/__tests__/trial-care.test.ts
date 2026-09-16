import { describe, expect, it } from "vitest";
import { defaultTrialCareRules, trialCareDueAt, trialCareRulesSchema, trialCareSkipReason, renderTrialCareBody } from "@/lib/trial-care";
const now = new Date("2026-09-17T02:00:00Z");
const base = { now, dueAt: now, updatedAt: new Date("2026-09-16T00:00:00Z"), enabled: true, stopped: false, stage: 1, purchased: false, booked: false, alreadySentToday: false };
describe("trial care policy", () => {
  it("defaults to 1/4/10 at 10:00; third invitation disabled", () => {
    const rules = defaultTrialCareRules();
    expect(rules.map(r => r.days)).toEqual([1, 4, 10]);
    expect(rules.map(r => r.enabled)).toEqual([true, true, false]);
    expect(trialCareRulesSchema.safeParse(rules).success).toBe(true);
  });
  it("uses the Taiwan calendar, including late-night completion", () => {
    expect(trialCareDueAt(new Date("2026-09-16T15:59:00Z"), { days: 1, time: "10:00" }).toISOString()).toBe("2026-09-17T02:00:00.000Z");
    expect(trialCareDueAt(new Date("2026-09-16T16:01:00Z"), { days: 1, time: "10:00" }).toISOString()).toBe("2026-09-18T02:00:00.000Z");
  });
  it.each([
    [{ stopped: true }, "顧客已停止接收"], [{ purchased: true }, "已購買方案或儲值"],
    [{ booked: true }, "已預約下次到店"], [{ alreadySentToday: true }, "今日已有體驗關懷"],
    [{ enabled: false }, "此階段已關閉"],
    [{ updatedAt: new Date(now.getTime() + 1) }, "設定修改前已錯過，不補發"],
    [{ now: new Date(now.getTime() + 15 * 60000) }, "已錯過發送時間，不補發"],
  ])("suppresses inappropriate delivery %j", (patch, reason) => expect(trialCareSkipReason({ ...base, ...patch })).toBe(reason));
  it("still sends a non-promotional check-in after purchase", () => expect(trialCareSkipReason({ ...base, stage: 0, purchased: true, booked: true })).toBeNull());
  it("rejects compressed intervals and nighttime delivery", () => {
    const rules = defaultTrialCareRules(); rules[1].days = 2;
    expect(trialCareRulesSchema.safeParse(rules).success).toBe(false);
    rules[1].days = 4; rules[0].time = "23:00";
    expect(trialCareRulesSchema.safeParse(rules).success).toBe(false);
  });
  it("renders names literally without replacement-string interpolation", () => expect(renderTrialCareBody("{{customerName}} {{storeName}}", "$&", "店A")).toBe("$& 店A"));
});
