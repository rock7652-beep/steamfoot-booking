import { describe, expect, it } from "vitest";
import { findOperationGuides, operationGuides } from "../lib/operation-guide";
import type { GuideAccess } from "../lib/operation-guide-types";

const basePermissions = [
  "booking.read",
  "booking.update",
  "booking.create",
  "customer.read",
  "customer.update",
  "wallet.read",
  "transaction.create",
  "transaction.refund",
  "staff.view",
];

const access = (module: "steamfoot" | "spa" | "course"): GuideAccess => ({
  module,
  permissions: basePermissions,
  features: { frontend_preview: true, multi_store: true },
});

const guide = (id: string) => {
  const found = operationGuides.find((item) => item.id === id);
  if (!found) throw new Error(`missing guide ${id}`);
  return found;
};

describe("October 5 operation guide audit", () => {
  it("keeps the current three device preview presets without treating preview as isolation", () => {
    const item = guide("I08");
    expect(item.steps.join(" ")).not.toContain("768×1024");
    expect(item.steps.join(" ")).toContain("1024×768");
    expect(item.steps.join(" ")).toContain("1440×900");
    expect(item.important).toContain("操作仍可能生效");
    expect(findOperationGuides("平板 直向", access("spa")).map((entry) => entry.id)).toContain("I08");
  });

  it("documents HQ SPA read-only scope without exposing write guidance", () => {
    const item = guide("I05");
    expect(item.modules).toEqual(expect.arrayContaining(["steamfoot", "spa", "course"]));
    expect(item.details.join(" ")).toContain("不能新增或編輯顧客");
    expect(item.details.join(" ")).toContain("退款");
    expect(findOperationGuides("SPA 顧客 唯讀", access("spa")).map((entry) => entry.id)).toContain("I05");
  });

  it("keeps customer list synchronization and preview identity searchable", () => {
    expect(findOperationGuides("顧客 清單同步", access("spa")).map((entry) => entry.id)).toContain("C03");
    expect(guide("I16").details.join(" ")).toContain("CustomerIdentityLink");
    expect(guide("I16").details.join(" ")).toContain("StaffMemberLink");
  });

  it("keeps ids unique after the incremental update", () => {
    expect(new Set(operationGuides.map((entry) => entry.id)).size).toBe(operationGuides.length);
  });
});
