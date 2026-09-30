import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { availableGuides, findOperationGuides, operationGuides } from "../lib/operation-guide";
import type { GuideAccess } from "../lib/operation-guide-types";

const guide = (id: string) => operationGuides.find(item => item.id === id)!;
const allCourse: GuideAccess = {
  module: "course",
  permissions: [
    "booking.read", "booking.create", "booking.update", "customer.read", "plans.edit",
    "wallet.create", "wallet.read", "staff.view", "staff.manage", "cashbook.create",
  ],
  features: { cashbook: true },
};
const steam: GuideAccess = {
  module: "steamfoot",
  permissions: ["booking.read", "booking.update", "cashbook.create"],
  features: { cashbook: true },
};

describe("September 28 guide review", () => {
  it("adds music setup, scheduling, attendance, absence, availability, reschedule and validity guides", () => {
    expect(operationGuides).toHaveLength(167);
    expect(availableGuides(allCourse).map(item => item.id)).toEqual(expect.arrayContaining([
      "C143", "C144", "C145", "C146", "C147", "C148", "C149",
    ]));
    expect(findOperationGuides("音樂 自組班 請假", allCourse).map(item => item.id)).toContain("C145");
    expect(findOperationGuides("老師曠課 免費補課", allCourse).map(item => item.id)).toContain("C146");
    expect(findOperationGuides("找空位 老師 教室", allCourse).map(item => item.id)).toContain("C144");
    expect(findOperationGuides("第一堂 到期日", allCourse).map(item => item.id)).toContain("C149");
  });

  it("keeps music instructions in course and behind action permissions", () => {
    expect(availableGuides(steam).some(item => item.id.startsWith("C14"))).toBe(false);
    expect(availableGuides({ ...allCourse, permissions: ["booking.read"] }).some(item => item.id === "C145")).toBe(false);
    expect(availableGuides({ ...allCourse, permissions: ["staff.manage"] }).some(item => item.id === "C147")).toBe(false);
    expect(availableGuides({ ...allCourse, permissions: ["plans.edit", "wallet.create", "wallet.read"] }).some(item => item.id === "C149")).toBe(false);
  });

  it("documents current cashbook filters, draft conflicts and responsive completion", () => {
    expect(findOperationGuides("搜尋記帳 顧客電話", steam).map(item => item.id)).toContain("E08");
    expect(findOperationGuides("正在確認最新狀態", steam).map(item => item.id)).toContain("A10");
    expect(JSON.stringify(guide("A06"))).toContain("背景派送");
    expect(JSON.stringify(guide("C127"))).toContain("資料已有更新");
    expect(JSON.stringify(guide("C130"))).toContain("不會自動送出");
  });

  it("keeps every affected article traceable to current source files", () => {
    for (const id of ["A06", "A10", "E08", "C103", "C123", "C127", "C130", "C143", "C144", "C145", "C146", "C147", "C148", "C149"]) {
      expect(guide(id).verification).toBe("source-reviewed");
      for (const source of guide(id).sources) expect(existsSync(source), `${id}: ${source}`).toBe(true);
    }
  });
});
