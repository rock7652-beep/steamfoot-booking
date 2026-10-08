import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { availableGuides, findOperationGuides, operationGuides } from "@/lib/operation-guide";
import type { GuideAccess } from "@/lib/operation-guide-types";

const access: GuideAccess = {
  module: "course",
  permissions: [...new Set(operationGuides.flatMap(guide => [guide.permission, ...(guide.additionalPermissions ?? [])]).filter(Boolean))],
  features: Object.fromEntries(operationGuides.filter(guide => guide.feature).map(guide => [guide.feature!, true])),
};
const text = (id: string, state: GuideAccess["sharedCardState"]) => JSON.stringify(availableGuides({...access,sharedCardState:state}).find(guide=>guide.id===id));

describe("sports shared-card backend help", () => {
  it.each(["HIDDEN", "LOCKED"] as const)("hides creation help in %s without hiding existing-rights and finance help", sharedCardState => {
    const current = {...access,sharedCardState};
    const ids = availableGuides(current).map(guide=>guide.id);
    expect(ids).not.toContain("C101"); expect(ids).not.toContain("C118");
    expect(ids).toEqual(expect.arrayContaining(["C102", "C105", "C111", "C112", "C113"]));
    for (const query of ["新增成員", "允許共卡", "指定成員 同行模式"]) {
      expect(findOperationGuides(query,current).some(guide=>["C101","C111","C118"].includes(guide.id))).toBe(false);
    }
    expect(text("C111",sharedCardState)).not.toContain("允許共卡");
    expect(text("C111",sharedCardState)).toContain("保留既有使用授權");
    expect(findOperationGuides("取消",current).map(guide=>guide.id)).toContain("C102");
    expect(findOperationGuides("退款",current).map(guide=>guide.id)).toContain("C105");
  });
  it("preserves default music guide access and explicit enabled sports help", () => {
    for (const sharedCardState of [undefined,"ENABLED"] as const) {
      expect(availableGuides({...access,sharedCardState}).map(guide=>guide.id)).toEqual(expect.arrayContaining(["C101","C111","C118"]));
      expect(text("C111",sharedCardState)).toContain("允許共卡");
    }
  });
  it("does not imply the main sports headcount form can select named authorization",()=>{
    const guide=availableGuides({...access,sharedCardState:"ENABLED"}).find(guide=>guide.id==="C101")!;
    expect(guide.answer).toContain("含本人 1–3 人同行，姓名選填");
    expect(guide.steps.join(" ")).toContain("沒有該入口請店家協助");
    expect(guide.details.join(" ")).toContain("新增匿名同行不會新增授權成員");
  });
  it("passes presentation only for sports and keeps missing state fail-closed",()=>{
    const sidebar=readFileSync("src/components/sidebar.tsx","utf8");
    expect(sidebar).toContain('sharedCardState: industryModule === "course" && !musicEnabled ? featureStates.shared_card ?? "HIDDEN" : undefined');
  });
});
