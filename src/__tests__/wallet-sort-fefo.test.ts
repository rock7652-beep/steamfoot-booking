/**
 * FEFO 排序規則 (First Expiring, First Out)：
 *   1. 有到期日的方案 < 沒到期日的方案
 *   2. 兩者都有到期日 → expiryDate ASC
 *   3. expiryDate 相同 → createdAt ASC
 *   4. createdAt 也相同 → id ASC（穩定）
 */

import { describe, it, expect } from "vitest";
import { compareWalletByFEFO, sortWalletsByFEFO } from "@/lib/wallet-sort";

const W = (
  id: string,
  expiry: string | null,
  created: string,
): { id: string; expiryDate: Date | null; createdAt: Date } => ({
  id,
  expiryDate: expiry ? new Date(expiry) : null,
  createdAt: new Date(created),
});

describe("compareWalletByFEFO / sortWalletsByFEFO", () => {
  it("最早到期的方案排第一", () => {
    const wallets = [
      W("a", "2026-08-01", "2026-01-01"),
      W("b", "2026-06-01", "2026-02-01"),
      W("c", "2026-07-01", "2026-03-01"),
    ];
    expect(sortWalletsByFEFO(wallets).map((w) => w.id)).toEqual(["b", "c", "a"]);
  });

  it("無到期日方案排在有到期日方案之後", () => {
    const wallets = [
      W("no-expiry-old", null, "2025-01-01"),
      W("expires-soon", "2026-06-01", "2026-04-01"),
      W("no-expiry-new", null, "2026-05-01"),
    ];
    expect(sortWalletsByFEFO(wallets).map((w) => w.id)).toEqual([
      "expires-soon",
      "no-expiry-old",
      "no-expiry-new",
    ]);
  });

  it("到期日相同 → 依 createdAt ASC fallback", () => {
    const wallets = [
      W("later", "2026-06-30", "2026-03-15"),
      W("earlier", "2026-06-30", "2026-01-10"),
    ];
    expect(sortWalletsByFEFO(wallets).map((w) => w.id)).toEqual([
      "earlier",
      "later",
    ]);
  });

  it("expiryDate + createdAt 都相同 → 依 id ASC，排序穩定", () => {
    const wallets = [
      W("zzz", "2026-06-30", "2026-01-01"),
      W("aaa", "2026-06-30", "2026-01-01"),
      W("mmm", "2026-06-30", "2026-01-01"),
    ];
    expect(sortWalletsByFEFO(wallets).map((w) => w.id)).toEqual([
      "aaa",
      "mmm",
      "zzz",
    ]);
  });

  it("無到期日且 createdAt 不同 → createdAt ASC", () => {
    const wallets = [
      W("c", null, "2026-03-01"),
      W("a", null, "2026-01-01"),
      W("b", null, "2026-02-01"),
    ];
    expect(sortWalletsByFEFO(wallets).map((w) => w.id)).toEqual(["a", "b", "c"]);
  });

  it("FEFO 不是 FIFO：先買無期限 vs 後買快到期 → 先扣後買快到期", () => {
    // 故事：A 先買、無期限、剩 5 堂；B 後買、月底到期、剩 3 堂
    const a = W("oldest-no-expiry", null, "2025-12-01");
    const b = W("newest-with-expiry", "2026-05-31", "2026-04-01");
    expect(sortWalletsByFEFO([a, b]).map((w) => w.id)).toEqual([
      "newest-with-expiry",
      "oldest-no-expiry",
    ]);
  });

  it("compareWalletByFEFO 直接比對：return 值符號正確", () => {
    const earlyExpiry = W("a", "2026-06-01", "2026-01-01");
    const lateExpiry = W("b", "2026-08-01", "2026-01-01");
    const noExpiry = W("c", null, "2026-01-01");
    expect(compareWalletByFEFO(earlyExpiry, lateExpiry)).toBeLessThan(0);
    expect(compareWalletByFEFO(lateExpiry, earlyExpiry)).toBeGreaterThan(0);
    expect(compareWalletByFEFO(earlyExpiry, noExpiry)).toBeLessThan(0);
    expect(compareWalletByFEFO(noExpiry, earlyExpiry)).toBeGreaterThan(0);
  });

  it("接受 string 形式的日期欄位（serialized from server）", () => {
    const wallets = [
      { id: "a", expiryDate: "2026-08-01", createdAt: "2026-01-01" },
      { id: "b", expiryDate: "2026-06-01", createdAt: "2026-02-01" },
    ];
    expect(sortWalletsByFEFO(wallets).map((w) => w.id)).toEqual(["b", "a"]);
  });

  it("不會 mutate 輸入陣列", () => {
    const wallets = [
      W("a", "2026-08-01", "2026-01-01"),
      W("b", "2026-06-01", "2026-02-01"),
    ];
    const before = wallets.map((w) => w.id);
    sortWalletsByFEFO(wallets);
    expect(wallets.map((w) => w.id)).toEqual(before);
  });
});
