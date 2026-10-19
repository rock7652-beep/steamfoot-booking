import { describe, it, expect } from "vitest";
import { sameSportsScheduleRule } from "@/lib/sports-staging-types";
import {
  readActionResult,
  assertActionSuccess,
} from "../../scripts/qa/sports-redesign/action-result.mjs";
const rule = {
  frequency: "WEEKLY",
  enrollment: "ASSIGNED",
  planId: "plan",
  students: [{ customerId: "member", cardId: null }],
  trialPrice: 0,
};
describe("sports schedule replay intent", () => {
  it("accepts JSONB-reordered outer and nested object keys", () => {
    const stored = {
      trialPrice: 0,
      planId: "plan",
      students: [{ cardId: null, customerId: "member" }],
      enrollment: "ASSIGNED",
      frequency: "WEEKLY",
    };
    expect(JSON.stringify(stored)).not.toBe(JSON.stringify(rule));
    expect(sameSportsScheduleRule(stored, rule)).toBe(true);
  });
  it("accepts an original allocated card when the request asks for automatic selection", () => {
    expect(
      sameSportsScheduleRule(
        {
          ...rule,
          students: [{ customerId: "member", cardId: "original-card" }],
        },
        rule,
      ),
    ).toBe(true);
  });
  it.each([
    { frequency: "BIWEEKLY" },
    { enrollment: "OPEN" },
    { planId: "other" },
    { trialPrice: 499 },
    { students: [{ customerId: "other", cardId: null }] },
    { students: [{ customerId: "member", cardId: "different-card" }] },
    { students: [] },
  ])("rejects changed intent %j", (change) => {
    expect(sameSportsScheduleRule(rule, { ...rule, ...change })).toBe(false);
  });
  it("rejects malformed stored payload", () => {
    expect(sameSportsScheduleRule({}, rule)).toBe(false);
  });
});
describe("Server Action acceptance evidence", () => {
  it("reads the action value rather than the transport envelope", () => {
    expect(
      readActionResult(
        '0:{"a":"$@1"}\n1:{"success":true,"data":{"count":8}}\n',
      ),
    ).toEqual({ success: true, data: { count: 8 } });
  });
  it("fails on HTTP 200 with a rejected business result", async () => {
    const response = {
      ok: () => true,
      status: () => 200,
      text: async () => '1:{"success":false,"error":"conflict"}\n',
    };
    await expect(assertActionSuccess(response)).rejects.toThrow("conflict");
  });
  it("fails closed if no action value was decoded", () => {
    expect(() => readActionResult('0:{"a":"$@1"}\n')).toThrow(
      "explicit business result",
    );
  });
});
