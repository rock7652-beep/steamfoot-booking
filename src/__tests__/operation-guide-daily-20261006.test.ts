import { describe, expect, it } from "vitest";
import { availableGuides, findOperationGuides, guideCategoryForPath, operationGuides } from "../lib/operation-guide";
import type { GuideAccess } from "../lib/operation-guide-types";

const inventoryPermissions = [
  "inventory.read",
  "inventory.write",
  "inventory.refund",
  "inventory.payment.correct",
  "inventory.manage",
  "inventory.cost.read",
  "inventory.receive",
  "inventory.purchase.pay",
  "inventory.price.manage",
  "inventory.price.override",
  "report.export",
  "staff.view",
  "staff.manage",
  "booking.update",
] as const;

const access = (module: "steamfoot" | "spa" | "course", inventory = true): GuideAccess => ({
  module,
  permissions: [...inventoryPermissions],
  features: { inventory },
});

const guide = (id: string) => {
  const item = operationGuides.find((entry) => entry.id === id);
  if (!item) throw new Error(`missing guide ${id}`);
  return item;
};

describe("October 6 operation guide audit", () => {
  it("adds one inventory category and ten source-reviewed guides", () => {
    expect(operationGuides).toHaveLength(201);
    expect(guideCategoryForPath("/dashboard/inventory")).toBe("inventory");
    for (const id of ["A13", "G05", "O01", "O02", "O03", "O04", "O05", "O06", "O07", "O08"]) {
      expect(guide(id).verification).toBe("source-reviewed");
    }
  });

  it("gates inventory by feature and each operation permission", () => {
    expect(availableGuides(access("steamfoot")).filter((item) => item.id.startsWith("O"))).toHaveLength(10);
    expect(availableGuides(access("spa")).map((item) => item.id)).toContain("O01");
    expect(availableGuides(access("course")).map((item) => item.id)).toContain("O08");
    expect(availableGuides(access("steamfoot", false)).some((item) => item.id.startsWith("O"))).toBe(false);
    expect(availableGuides({ module: "steamfoot", permissions: ["inventory.read"], features: { inventory: true } }).map((item) => item.id))
      .toEqual(expect.arrayContaining(["O01", "O08"]));
    expect(availableGuides({ module: "steamfoot", permissions: ["inventory.read"], features: { inventory: true } }).some((item) => item.id === "O02")).toBe(false);
  });

  it("keeps receiving, payment, cost and pricing boundaries searchable", () => {
    expect(findOperationGuides("分批到貨 補成本", access("steamfoot")).map((item) => item.id)).toContain("O03");
    expect(findOperationGuides("批次收款 重複入帳", access("steamfoot")).map((item) => item.id)).toContain("O05");
    expect(guide("O06").additionalPermissions).toEqual(["inventory.cost.read", "inventory.purchase.pay"]);
    expect(guide("O08").important).toContain("report.export");
    expect(guide("O04").details.join(" ")).toContain("inventory.price.override");
  });

  it("documents safe batch completion without changing payment state", () => {
    const item = guide("A13");
    expect(item.important).toContain("不改收款狀態");
    expect(item.details.join(" ")).toContain("已完成、取消、未到");
    expect(findOperationGuides("批次完成 全選", access("steamfoot")).map((entry) => entry.id)).toContain("A13");
    expect(availableGuides({ module: "steamfoot", permissions: ["booking.read"], features: {} }).some((entry) => entry.id === "A13")).toBe(false);
  });

  it("separates roles, permissions and service identities", () => {
    expect(guide("G01").modules).toEqual(["steamfoot", "spa", "course"]);
    expect(guide("G01").important).toContain("三件事");
    expect(guide("G03").details.join(" ")).toContain("重新登入");
    expect(guide("G04").details.join(" ")).toContain("最後一位啟用中的 Owner");
    expect(guide("G05").important).toContain("Manager 不能管理自己");
  });

  it("keeps cashbook records linked from inventory read-only", () => {
    const item = guide("E08");
    expect(item.details.join(" ")).toContain("進銷存");
    expect(item.details.join(" ")).toContain("不可獨立修改或刪除");
  });

  it("keeps all ids unique after the incremental update", () => {
    expect(new Set(operationGuides.map((entry) => entry.id)).size).toBe(operationGuides.length);
  });
});
