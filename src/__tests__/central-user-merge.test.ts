import { describe, expect, it } from "vitest";
import {
  buildCentralUserMergePlan,
  type CentralUserMergeSnapshot,
} from "@/server/services/central-user-merge";

function user(overrides: Partial<CentralUserMergeSnapshot> = {}): CentralUserMergeSnapshot {
  return {
    id: "user-1",
    name: "測試會員",
    role: "CUSTOMER",
    status: "ACTIVE",
    hasPassword: true,
    accounts: [],
    identityLinks: [],
    customer: null,
    ...overrides,
  };
}

describe("buildCentralUserMergePlan", () => {
  it("allows a non-conflicting cross-store identity consolidation", () => {
    const source = user({
      accounts: [{ id: "account-line", provider: "line", providerAccountId: "line-a" }],
      identityLinks: [{ id: "link-a", storeId: "store-a", customerId: "customer-a", provider: "line", providerAccountId: "line-a" }],
    });
    const target = user({
      id: "user-2",
      accounts: [{ id: "account-google", provider: "google", providerAccountId: "google-b" }],
      identityLinks: [{ id: "link-b", storeId: "store-b", customerId: "customer-b", provider: "google", providerAccountId: "google-b" }],
    });

    expect(buildCentralUserMergePlan(source, target)).toMatchObject({
      executable: true,
      blockers: [],
      moves: { accounts: 1, identityLinks: 1, directCustomer: 0 },
    });
  });

  it("blocks different provider identities instead of choosing one", () => {
    const source = user({ accounts: [{ id: "a", provider: "line", providerAccountId: "line-a" }] });
    const target = user({ id: "user-2", accounts: [{ id: "b", provider: "line", providerAccountId: "line-b" }] });
    const plan = buildCentralUserMergePlan(source, target);
    expect(plan.executable).toBe(false);
    expect(plan.blockers).toContain("兩個會員各自綁定不同的 line 帳號");
  });

  it("blocks two direct Customer relations and same-store link conflicts", () => {
    const source = user({
      customer: { id: "customer-a", storeId: "store-a", name: "A", phone: "0911111111" },
      identityLinks: [{ id: "link-a", storeId: "store-a", customerId: "customer-a", provider: "line", providerAccountId: "line-a" }],
    });
    const target = user({
      id: "user-2",
      customer: { id: "customer-b", storeId: "store-a", name: "B", phone: "0911111111" },
      identityLinks: [{ id: "link-b", storeId: "store-a", customerId: "customer-b", provider: "line", providerAccountId: "line-b" }],
    });
    const plan = buildCentralUserMergePlan(source, target);
    expect(plan.executable).toBe(false);
    expect(plan.blockers).toEqual(expect.arrayContaining([
      "兩個會員都直接連到顧客資料；請先完成店內重複顧客處理",
      "分店 store-a 的 line 會員連結指向不同顧客",
      "分店 store-a 對應不同顧客；一個中央會員在同店只能有一筆會員資料",
    ]));
  });

  it("blocks different customers in the same store even across providers", () => {
    const source = user({
      accounts: [{ id: "account-line", provider: "line", providerAccountId: "line-a" }],
      identityLinks: [{
        id: "link-line",
        storeId: "store-a",
        customerId: "customer-a",
        provider: "line",
        providerAccountId: "line-a",
      }],
    });
    const target = user({
      id: "user-2",
      accounts: [{ id: "account-google", provider: "google", providerAccountId: "google-b" }],
      identityLinks: [{
        id: "link-google",
        storeId: "store-a",
        customerId: "customer-b",
        provider: "google",
        providerAccountId: "google-b",
      }],
    });

    expect(buildCentralUserMergePlan(source, target)).toMatchObject({
      executable: false,
      blockers: [
        "分店 store-a 對應不同顧客；一個中央會員在同店只能有一筆會員資料",
      ],
    });
  });

  it("blocks a direct customer and a different linked customer in the same store", () => {
    const source = user({
      customer: {
        id: "customer-a",
        storeId: "store-a",
        name: "A",
        phone: "0911111111",
      },
    });
    const target = user({
      id: "user-2",
      identityLinks: [{
        id: "link-google",
        storeId: "store-a",
        customerId: "customer-b",
        provider: "google",
        providerAccountId: "google-b",
      }],
    });

    expect(buildCentralUserMergePlan(source, target).blockers).toContain(
      "分店 store-a 對應不同顧客；一個中央會員在同店只能有一筆會員資料",
    );
  });

  it("allows multiple providers when they resolve to the same customer", () => {
    const source = user({
      accounts: [{ id: "account-line", provider: "line", providerAccountId: "line-a" }],
      identityLinks: [{
        id: "link-line",
        storeId: "store-a",
        customerId: "customer-a",
        provider: "line",
        providerAccountId: "line-a",
      }],
    });
    const target = user({
      id: "user-2",
      accounts: [{ id: "account-google", provider: "google", providerAccountId: "google-b" }],
      identityLinks: [{
        id: "link-google",
        storeId: "store-a",
        customerId: "customer-a",
        provider: "google",
        providerAccountId: "google-b",
      }],
    });

    expect(buildCentralUserMergePlan(source, target)).toMatchObject({
      executable: true,
      blockers: [],
    });
  });

  it("never permits staff or an already suspended source", () => {
    expect(buildCentralUserMergePlan(
      user({ role: "OWNER", status: "SUSPENDED" }),
      user({ id: "user-2" }),
    ).blockers).toEqual(expect.arrayContaining([
      "只能整合顧客帳號；總部與店員帳號不可合併",
      "來源會員不是啟用狀態",
    ]));
  });
});
