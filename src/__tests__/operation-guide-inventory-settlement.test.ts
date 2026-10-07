import { existsSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { availableGuides, findOperationGuides, operationGuides } from "../lib/operation-guide";
import type { GuideAccess } from "../lib/operation-guide-types";

vi.mock("react", () => ({ cache: (fn: unknown) => fn }));
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));
const requestContext = vi.hoisted(() => ({ activeStoreId: "__all__" }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-next-pathname": "/hq/dashboard" }),
  cookies: async () => ({
    get: (name: string) => name === "active-store-id" ? { value: requestContext.activeStoreId } : undefined,
  }),
}));
const grants = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db", () => ({ prisma: { staffPermission: { findMany: grants } } }));
import { checkPermission, getDefaultPermissionsForRole } from "../lib/permissions";

const correctedIds = ["G05", "O01", "O04", "O05", "O07", "O08", "O09", "O10"];
const settlementIds = ["O09", "O10"];
const guide = (id: string) => {
  const item = operationGuides.find((entry) => entry.id === id);
  if (!item) throw new Error(`missing guide ${id}`);
  return item;
};
const text = (id: string) => {
  const item = guide(id);
  return [item.answer, ...item.steps, item.important, ...item.details].join(" ");
};
const access = (permissions: readonly string[], module: GuideAccess["module"] = "steamfoot", enabled = true): GuideAccess => ({
  module, permissions, features: { inventory: enabled },
});
const visibleSettlementIds = (scope: GuideAccess) => availableGuides(scope)
  .filter((item) => settlementIds.includes(item.id)).map((item) => item.id);

describe("inventory return and receipt-correction guide source review", () => {
  it("keeps corrected articles source-reviewed with traceable sources", () => {
    for (const id of correctedIds) {
      const item = guide(id);
      expect(item.verification).toBe("source-reviewed");
      expect(item.answer.trim()).not.toBe("");
      expect(item.steps.length).toBeGreaterThan(0);
      for (const source of item.sources) expect(existsSync(source), `${id}: ${source}`).toBe(true);
    }
    for (const id of settlementIds) {
      expect(operationGuides.filter((item) => item.id === id)).toHaveLength(1);
      expect(guide(id).additionalPermissions).toEqual(["inventory.read"]);
    }
  });

  it.each(["steamfoot", "spa", "course"] as const)("gates both workflows independently in %s", (module) => {
    expect(visibleSettlementIds(access(["inventory.read", "inventory.write"], module))).toEqual([]);
    expect(visibleSettlementIds(access(["inventory.read", "inventory.refund"], module))).toEqual(["O09"]);
    expect(visibleSettlementIds(access(["inventory.read", "inventory.payment.correct"], module))).toEqual(["O10"]);
    expect(visibleSettlementIds(access(["inventory.refund", "inventory.payment.correct"], module))).toEqual([]);
    expect(visibleSettlementIds(access(["inventory.read", "inventory.refund", "inventory.payment.correct"], module))).toEqual(settlementIds);
    expect(visibleSettlementIds(access(["inventory.read", "inventory.refund", "inventory.payment.correct"], module, false))).toEqual([]);
  });

  it("distinguishes role defaults from existing staff grants", async () => {
    expect(visibleSettlementIds(access(getDefaultPermissionsForRole("MANAGER")))).toEqual(settlementIds);
    expect(visibleSettlementIds(access(getDefaultPermissionsForRole("STAFF")))).toEqual([]);
    grants.mockResolvedValue([{ permission: "inventory.read" }, { permission: "inventory.write" }]);
    expect(await checkPermission("MANAGER", "existing-manager", "inventory.refund")).toBe(false);
    expect(await checkPermission("MANAGER", "existing-manager", "inventory.payment.correct")).toBe(false);
    expect(text("G05")).toContain("Staff 預設不含後兩項");
    expect(text("G05")).toContain("不會因新增權限自動取得授權");
    expect(text("O01")).toContain("實際已儲存權限");
    expect(text("O01")).toContain("inventory.refund");
    expect(text("O01")).toContain("inventory.payment.correct");
  });

  it("finds pending refunds, sale voids, exchanges and receipt corrections without crossing permission gates", () => {
    const scope = access(["inventory.read", "inventory.refund", "inventory.payment.correct"]);
    for (const query of ["延後退款 待退款", "作廢銷貨 放回庫存", "換貨 分別結清", "退貨 折扣 贈品"]) {
      expect(findOperationGuides(query, scope).map((item) => item.id)).toContain("O09");
    }
    for (const query of ["付款方式填錯", "作廢收款 恢復欠款", "更正收款 多張單"]) {
      expect(findOperationGuides(query, scope).map((item) => item.id)).toContain("O10");
    }
    expect(findOperationGuides("待退款", access(["inventory.read"])).map((item) => item.id)).toContain("O08");
    expect(findOperationGuides("延後退款", access(["inventory.read", "inventory.write"])).some((item) => item.id === "O09")).toBe(false);
    expect(findOperationGuides("更正收款", access(["inventory.read", "inventory.refund"])).some((item) => item.id === "O10")).toBe(false);
  });

  it("separates return, restock, sale void and deferred money-only refunds", () => {
    expect(text("O09")).toContain("尚未退錢填 0");
    expect(text("O09")).toContain("只有可再次販售的商品才勾「放回庫存」");
    expect(text("O09")).toContain("全部剩餘商品與運費");
    expect(text("O09")).toContain("作廢銷貨不表示款項已退清");
    expect(text("O09")).toContain("淨已收扣除保留商品及剩餘運費");
    expect(text("O09")).toContain("不再退商品、退運費或增加庫存");
    expect(text("O09")).toContain("已作廢且仍待退款");
    expect(text("O09")).toContain("不會自動轉帳或退刷");
    expect(text("O09")).toContain("同一顧客的新銷貨單");
    expect(text("O09")).toContain("工單請改走工單入口");
  });

  it("routes receipt correction through the original sale detail and preserves its non-refund meaning", () => {
    expect(guide("O10").path).toBe("進銷存 → 銷貨單 → 收付款紀錄 → 該筆收款的更多操作 → 更正付款方式／作廢收款");
    expect(text("O10")).toContain("保留原收款金額、欠款不變");
    expect(text("O10")).toContain("作廢收款紀錄（恢復欠款）");
    expect(text("O10")).toContain("同一筆收款分配的全部單據");
    expect(text("O10")).toContain("不會退款給顧客，也不改庫存");
    expect(text("O10")).toContain("同額、同分配的替代收款");
    expect(text("O10")).toContain("工單、已作廢、已有退貨／退款");
    expect(text("O05")).toContain("O10");
    expect(text("O05")).toContain("O09");
  });

  it("keeps cashbook, closed-date, revision and draft recovery safeguards explicit", () => {
    for (const id of settlementIds) {
      expect(text(id)).toContain("cashbook.create 及現金收支功能開通");
      expect(text(id)).toContain("處理日已結帳");
      expect(text(id)).toContain("取消放棄或重讀失敗");
    }
    expect(text("O04")).toContain("已有退貨／退款處理紀錄的銷貨不能再直接編輯");
    expect(text("O04")).toContain("重新開啟核對版本");
    expect(text("O04")).toContain("先重讀最新單據");
    expect(text("O09")).toContain("最近收款或退貨紀錄");
    expect(text("O10")).toContain("進銷存連動現金帳為唯讀");
  });

  it("separates pending refunds from receivables and dates returns by their processing month", () => {
    expect(text("O08")).toContain("淨已收大於應收");
    expect(text("O08")).toContain("不能向顧客再收該差額");
    expect(text("O08")).toContain("銷售按原銷貨日，商品退貨按處理日");
    expect(text("O08")).toContain("跨月退貨列在退貨月份");
    expect(text("O08")).toContain("不再增加商品退貨數量或退貨金額");
    expect(text("O08")).toContain("未回庫不會自動沖回成本");
  });

  it("keeps store stock-count history distinct from headquarters-only audit access", async () => {
    expect(guide("O07").steps.join(" ")).toContain("展開「盤點紀錄」");
    expect(guide("O07").steps.join(" ")).not.toContain("操作紀錄");
    expect(text("O07")).toContain("僅供總部 ADMIN 查閱");
    expect(text("O07")).toContain("即使有舊 audit.read 授權也不能開啟");
    grants.mockResolvedValue([{ permission: "audit.read" }]);
    for (const role of ["OWNER", "MANAGER", "STAFF", "PARTNER"] as const) {
      expect(await checkPermission(role, "legacy-audit-grant", "audit.read")).toBe(false);
    }
    expect(await checkPermission("ADMIN", null, "audit.read")).toBe(true);
    requestContext.activeStoreId = "selected-store";
    try {
      expect(await checkPermission("ADMIN", null, "audit.read")).toBe(false);
    } finally {
      requestContext.activeStoreId = "__all__";
    }
  });
});
