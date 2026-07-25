import { describe, expect, it } from "vitest";
import { parseDigitalButlerDraftDefinition } from "@/lib/digital-butler-flow-definition";

const valid = {
  trigger: { keywords: ["我想了解"] },
  steps: [
    { stepKey: "question", type: "FREE_TEXT", required: true, config: { text: "怎麼稱呼您？" } },
    { stepKey: "complete", type: "COMPLETE_FLOW", config: {} },
  ],
};

describe("digital butler draft definition", () => {
  it("normalizes a valid linear flow", () => {
    expect(parseDigitalButlerDraftDefinition(valid).trigger.keywords).toEqual(["我想了解"]);
  });

  it("rejects reserved binding codes and commands", () => {
    expect(() => parseDigitalButlerDraftDefinition({
      ...valid,
      trigger: { keywords: ["123456"] },
    })).toThrow("保留指令");
  });

  it("requires a single complete step at the end", () => {
    expect(() => parseDigitalButlerDraftDefinition({
      ...valid,
      steps: valid.steps.slice(0, 1),
    })).toThrow("最後一步");
  });

  it("requires at least two single-choice options", () => {
    expect(() => parseDigitalButlerDraftDefinition({
      ...valid,
      steps: [
        { stepKey: "choice", type: "SINGLE_CHOICE", config: { text: "請選擇", options: ["A"] } },
        valid.steps[1],
      ],
    })).toThrow("至少需要兩個選項");
  });

  it("keeps browser actions scoped to the authenticated store", async () => {
    const source = await import("node:fs/promises").then((fs) =>
      fs.readFile(
        "src/app/(dashboard)/dashboard/settings/digital-butler/actions.ts",
        "utf8",
      ),
    );
    expect(source).toContain("getActiveStoreForRead(user)");
    expect(source).not.toMatch(/input\.storeId/);
    expect(source).toContain('requirePermission("plans.edit")');
  });
});
