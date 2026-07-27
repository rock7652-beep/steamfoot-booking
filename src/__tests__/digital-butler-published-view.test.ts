import { describe, expect, it } from "vitest";
import {
  isDigitalButlerDraftDirty,
  publishedMenuOptions,
} from "@/lib/digital-butler-published-view";

describe("Digital Butler published view", () => {
  const publishedSteps = [
    { stepKey: "opening", position: 0, type: "TEXT", config: { text: "歡迎" } },
    {
      stepKey: "想了解的內容",
      position: 1,
      type: "SINGLE_CHOICE",
      config: {
        options: [
          { label: "我想預約體驗", value: "booking", nextStepKey: "name" },
          { label: "首次體驗與費用", value: "price", nextStepKey: "price" },
          { label: "蒸足如何進行", value: "process", nextStepKey: "process" },
        ],
      },
    },
  ];

  it("keeps the published step-row option order without consulting draft JSON", () => {
    const draftWithDifferentOrder = {
      steps: [{ stepKey: "想了解的內容", config: { options: [{ label: "舊草稿選項" }] } }],
    };
    void draftWithDifferentOrder;

    expect(publishedMenuOptions(publishedSteps)).toEqual([
      { label: "我想預約體驗", value: "booking", nextStepKey: "name" },
      { label: "首次體驗與費用", value: "price", nextStepKey: "price" },
      { label: "蒸足如何進行", value: "process", nextStepKey: "process" },
    ]);
  });

  it("requires the current editor content to match the persisted draft before publishing", () => {
    expect(isDigitalButlerDraftDirty({
      name: "流程", persistedName: "流程", definition: "{\"v\":2}", persistedDefinition: "{\"v\":1}",
    })).toBe(true);
    expect(isDigitalButlerDraftDirty({
      name: "流程", persistedName: "流程", definition: "{\"v\":2}", persistedDefinition: "{\"v\":2}",
    })).toBe(false);
  });
});
