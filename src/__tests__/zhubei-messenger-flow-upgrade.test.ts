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
          { label: "我想預約體驗", value: "BOOKING", nextStepKey: "inquiry-name" },
          { label: "請店家聯絡我", value: "CONTACT_STORE", nextStepKey: "inquiry-name" },
        ],
      },
    },
    { stepKey: "process", type: "TEXT", config: { text: "介紹內容", nextStepKey: "menu" } },
    { stepKey: "inquiry-name", type: "FREE_TEXT", required: true, config: { text: "姓名", field: "name", nextStepKey: "inquiry-phone" } },
    { stepKey: "inquiry-phone", type: "TAIWAN_MOBILE", required: true, config: { text: "手機", nextStepKey: "inquiry-create-lead" } },
    { stepKey: "inquiry-create-lead", type: "CREATE_LEAD", config: { requireCompleteContact: true, nameStepKey: "inquiry-name", phoneStepKey: "inquiry-phone", nextStepKey: "completion" } },
    { stepKey: "completion", type: "TEXT", config: { text: "已收到", nextStepKey: "complete" } },
    { stepKey: "complete", type: "COMPLETE_FLOW", config: {} },
  ],
};

describe("Zhubei Messenger flow completion selector upgrade", () => {
  it("preserves v12 steps and adds the menu selector only to inquiry-create-lead", () => {
    const upgraded = upgradeZhubeiLeadCollectionDefinition(currentFlow as never);
    expect(upgraded.trigger.keywords).toEqual(["我想了解蒸足"]);
    expect(upgraded.steps.find((step) => step.stepKey === "process")?.config.text).toBe("介紹內容");
    expect(upgraded.steps.map((step) => step.stepKey)).toEqual(currentFlow.steps.map((step) => step.stepKey));
    expect(upgraded.steps.find((step) => step.stepKey === "inquiry-create-lead")?.config).toMatchObject({
      requestTypeFromStepKey: "menu",
    });
    expect(currentFlow.steps.find((step) => step.stepKey === "inquiry-create-lead")?.config).not.toHaveProperty("requestTypeFromStepKey");
    expect(hasCompleteZhubeiLeadCollection(upgraded as never)).toBe(true);
  });

  it("normalizes only the published v12 legacy contact contract before adding the selector", () => {
    const legacy = structuredClone(currentFlow);
    const name = legacy.steps.find((step) => step.stepKey === "inquiry-name");
    const phone = legacy.steps.find((step) => step.stepKey === "inquiry-phone");
    if (!name || !phone) throw new Error("fixture is missing legacy contact steps");
    delete name.required;
    delete phone.required;

    const upgraded = upgradeZhubeiLeadCollectionDefinition(legacy as never);

    expect(upgraded.steps.find((step) => step.stepKey === "inquiry-name")?.required).toBe(true);
    expect(upgraded.steps.find((step) => step.stepKey === "inquiry-phone")?.required).toBe(true);
    expect(upgraded.steps.find((step) => step.stepKey === "inquiry-create-lead")?.config)
      .toMatchObject({ requestTypeFromStepKey: "menu" });
    expect(name).not.toHaveProperty("required");
    expect(phone).not.toHaveProperty("required");
  });

  it("does not normalize an arbitrary invalid definition", () => {
    const invalid = structuredClone(currentFlow);
    const createLead = invalid.steps.find((step) => step.stepKey === "inquiry-create-lead");
    if (!createLead) throw new Error("fixture is missing create lead step");
    createLead.config.nameStepKey = "unrelated-name";

    expect(() => upgradeZhubeiLeadCollectionDefinition(invalid as never))
      .toThrow("ZHUBEI_V12_LEGACY_CONTACT_CONTRACT_NOT_FOUND");
  });

  it("continues to reject invalid definitions through the standard parser", () => {
    const invalid = structuredClone(currentFlow);
    const menu = invalid.steps.find((step) => step.stepKey === "menu");
    if (!menu) throw new Error("fixture is missing menu step");
    menu.config.text = "";

    expect(() => upgradeZhubeiLeadCollectionDefinition(invalid as never))
      .toThrow("缺少顯示文字");
  });

  it("is idempotent: an already upgraded active definition needs no further version", () => {
    const once = upgradeZhubeiLeadCollectionDefinition(currentFlow as never);
    expect(hasCompleteZhubeiLeadCollection(once as never)).toBe(true);
    expect(upgradeZhubeiLeadCollectionDefinition(once as never)).toEqual(once);
  });
});
