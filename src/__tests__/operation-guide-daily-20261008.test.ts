import { describe, expect, it } from "vitest";
import { operationGuides } from "../lib/operation-guide";

describe("2026-10-08 HQ store-view guide corrections", () => {
  it("distinguishes mother-store read-only view from HQ real store capabilities", () => {
    const guide = operationGuides.find((item) => item.id === "I05");
    expect(guide).toBeDefined();
    const text = JSON.stringify(guide);
    expect(text).toContain("母店跨店查看仍是唯讀");
    expect(text).toContain("不會借用店員身分");
    expect(text).toContain("HIDDEN 功能完全不顯示");
    expect(text).toContain("LOCKED 功能");
    expect(text).toContain("返回 HQ");
  });

  it("documents the selected-store scope and HQ return boundary", () => {
    const guide = operationGuides.find((item) => item.id === "I18");
    expect(guide).toBeDefined();
    const text = JSON.stringify(guide);
    expect(text).toContain("讀取、寫入與匯出都只限目前選店");
    expect(text).toContain("不會假扮該店 Staff");
    expect(text).toContain("HIDDEN 功能完全不顯示");
    expect(text).toContain("返回 HQ");
  });

  it("keeps the published guide inventory unchanged", () => {
    expect(operationGuides).toHaveLength(201);
  });
});
