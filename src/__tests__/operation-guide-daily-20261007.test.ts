import { describe, expect, it } from "vitest";
import { availableGuides, findOperationGuides, guideCategoryForPath, operationGuides } from "../lib/operation-guide";
import type { GuideAccess } from "../lib/operation-guide-types";

const permissions = ["work_order.read", "work_order.write", "business_hours.manage", "customer.read", "staff.view", "staff.manage"] as const;
const access = (module: "steamfoot" | "spa" | "course", enabled = true): GuideAccess => ({
  module, permissions: [...permissions], features: { work_orders: enabled, line_reminder: true, customer_care: true },
});

describe("October 7 operation guide audit", () => {
  it("adds five work order guides and one course LINE guide", () => {
    expect(operationGuides).toHaveLength(199);
    expect(guideCategoryForPath("/dashboard/work-orders")).toBe("work-orders");
    for (const id of ["W01", "W02", "W03", "W04", "W05", "C167"]) {
      expect(operationGuides.find((guide) => guide.id === id)?.verification).toBe("source-reviewed");
    }
  });

  it("gates work orders by feature and permissions", () => {
    expect(availableGuides(access("steamfoot")).filter((guide) => guide.id.startsWith("W"))).toHaveLength(5);
    expect(availableGuides(access("spa")).map((guide) => guide.id)).toContain("W04");
    expect(availableGuides(access("course", false)).some((guide) => guide.id.startsWith("W"))).toBe(false);
    expect(availableGuides({ module: "course", permissions: ["work_order.read"], features: { work_orders: true } }).filter((guide) => guide.id.startsWith("W")).map((guide) => guide.id))
      .toEqual(["W01", "W05"]);
  });

  it("keeps payment, inventory, cancellation and printing boundaries searchable", () => {
    expect(findOperationGuides("工單 分次收款 取件", access("course")).map((guide) => guide.id)).toContain("W03");
    expect(findOperationGuides("退回材料 回補庫存", access("course")).map((guide) => guide.id)).toContain("W04");
    expect(findOperationGuides("雙聯 QR", access("course")).map((guide) => guide.id)).toContain("W05");
    expect(operationGuides.find((guide) => guide.id === "W02")?.important).toContain("贈品仍扣庫存");
  });

  it("documents current course LINE actions and shared-account isolation", () => {
    const item = operationGuides.find((guide) => guide.id === "C167")!;
    expect(item.steps.join(" ")).toContain("確認會到");
    expect(item.important).toContain("不等於已報到");
    expect(item.details.join(" ")).toContain("不會合併兩店會員");
  });

  it("keeps every guide id unique", () => {
    expect(new Set(operationGuides.map((guide) => guide.id)).size).toBe(operationGuides.length);
  });
});
