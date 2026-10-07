import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { availableGuides, findOperationGuides, operationGuides } from "../lib/operation-guide";
import type { GuideAccess } from "../lib/operation-guide-types";

const guide = (id: string) => operationGuides.find(item => item.id === id)!;
const course: GuideAccess = {
  module: "course",
  permissions: ["booking.read", "booking.create", "wallet.create", "transaction.create"],
  features: {},
};
const steam: GuideAccess = {
  module: "steamfoot",
  permissions: ["booking.update", "cashbook.create"],
  features: { cashbook: true },
};

describe("September 29 guide review", () => {
  it("adds the checkout, term history, makeup and renewal workflows", () => {
    expect(operationGuides.length).toBeGreaterThanOrEqual(179);
    expect(availableGuides(steam).map(item => item.id)).toContain("A12");
    expect(availableGuides(course).map(item => item.id)).toEqual(expect.arrayContaining(["C150", "C151", "C152"]));
    expect(findOperationGuides("同行 多人 799", steam).map(item => item.id)).toContain("A12");
    expect(findOperationGuides("下期已繳 尚未排課", course).map(item => item.id)).toContain("C150");
    expect(findOperationGuides("原請假 取消補課 重排", course).map(item => item.id)).toContain("C151");
    expect(findOperationGuides("學員繳費 轉帳末四碼", course).map(item => item.id)).toContain("C152");
  });

  it("keeps new workflows in the right module and behind all required permissions", () => {
    expect(availableGuides({ ...course, module: "steamfoot" }).some(item => item.id.startsWith("C15"))).toBe(false);
    expect(availableGuides({ ...steam, module: "course" }).some(item => item.id === "A12")).toBe(false);
    expect(availableGuides({ ...course, permissions: ["booking.read"] }).some(item => item.id === "C151")).toBe(false);
    expect(availableGuides({ ...course, permissions: ["wallet.create", "booking.read"] }).some(item => item.id === "C152")).toBe(false);
  });

  it("updates existing search terms and traces every affected article to source", () => {
    expect(findOperationGuides("預設零售收入", steam).map(item => item.id)).toContain("E08");
    expect(JSON.stringify(guide("C145"))).toContain("原請假紀錄");
    expect(JSON.stringify(guide("C149"))).toContain("名單續報");
    for (const id of ["A12", "E08", "C145", "C149", "C150", "C151", "C152"]) {
      expect(guide(id).verification).toBe("source-reviewed");
      for (const source of guide(id).sources) expect(existsSync(source), `${id}: ${source}`).toBe(true);
    }
  });
});

