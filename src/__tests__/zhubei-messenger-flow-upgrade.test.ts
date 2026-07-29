import { describe, expect, it } from "vitest";
import {
  hasCompleteZhubeiLeadCollection,
  upgradeZhubeiLeadCollectionDefinition,
} from "../../scripts/upgrade-zhubei-messenger-digital-butler-flow";

const currentFlow = {
  trigger: { keywords: ["我想了解蒸足"] },
  steps: [
    {
      stepKey: "menu", type: "SINGLE_CHOICE", config: {
        text: "請選擇", options: [
          { label: "蒸足如何進行", value: "PROCESS", nextStepKey: "process" },
          { label: "我想預約體驗", value: "BOOKING", nextStepKey: "booking" },
          { label: "請店家聯絡我", value: "CONTACT_STORE", nextStepKey: "booking" },
        ],
      },
    },
    { stepKey: "process", type: "TEXT", config: { text: "介紹內容", nextStepKey: "menu" } },
    { stepKey: "booking", type: "TEXT", config: { text: "舊預約內容", nextStepKey: "complete" } },
    { stepKey: "complete", type: "COMPLETE_FLOW", config: {} },
  ],
};

describe("Zhubei Messenger flow upgrade", () => {
  it("preserves existing trigger and informational branches while replacing only lead collection", () => {
    const upgraded = upgradeZhubeiLeadCollectionDefinition(currentFlow as never);
    expect(upgraded.trigger.keywords).toEqual(["我想了解蒸足"]);
    expect(upgraded.steps.find((step) => step.stepKey === "process")?.config.text).toBe("介紹內容");
    const menu = upgraded.steps.find((step) => step.stepKey === "menu");
    expect(menu?.config.options).toContainEqual(expect.objectContaining({ label: "蒸足如何進行", nextStepKey: "process" }));
    expect(menu?.config.options).toContainEqual(expect.objectContaining({ label: "我想預約體驗", nextStepKey: "name" }));
    expect(hasCompleteZhubeiLeadCollection(upgraded as never)).toBe(true);
  });

  it("is idempotent: an already upgraded active definition needs no further version", () => {
    const once = upgradeZhubeiLeadCollectionDefinition(currentFlow as never);
    expect(hasCompleteZhubeiLeadCollection(once as never)).toBe(true);
  });
});
