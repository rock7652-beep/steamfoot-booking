/**
 * fix/wallet-availability-consistency — 顧客前台堂數計算唯一來源
 *
 * 回歸重點（黃彥陸案例與其延伸）：
 *   - 可預約 = WalletSession AVAILABLE；待到店 = RESERVED（逐人／逐堂）
 *   - legacy 無 ledger 時，以 booking.people 加總，不再以 booking 筆數計算
 *   - 已使用 = WalletSession COMPLETED + BACKFILLED（補登紙本已使用要算進去）
 *   - 已註銷 = WalletSession VOIDED（獨立，不可混入已使用）
 *   - 首頁 / my-plans 上方 / booking form 對同一輸入必須得到同一個可預約數字
 */

import { describe, it, expect } from "vitest";
import {
  walletPendingCount,
  walletAvailableToBook,
  totalAvailableToBook,
  ledgerUsage,
} from "@/lib/wallet-availability";

describe("walletAvailableToBook — 可預約 = remaining − 待到店", () => {
  it("黃彥陸案例：total=3, remaining=1, 無預約 → 可預約 1（非 3）", () => {
    const w = { remainingSessions: 1, bookings: [] };
    expect(walletAvailableToBook(w)).toBe(1);
  });

  it("+1 筆非補課 PENDING → 可預約 0", () => {
    const w = {
      remainingSessions: 1,
      bookings: [{ bookingStatus: "PENDING", isMakeup: false }],
    };
    expect(walletPendingCount(w)).toBe(1);
    expect(walletAvailableToBook(w)).toBe(0);
  });

  it("多人預約依 people 占用：remaining=10，兩筆各 2 人 → 可預約 6", () => {
    const w = {
      remainingSessions: 10,
      bookings: [
        { bookingStatus: "PENDING", isMakeup: false, people: 2 },
        { bookingStatus: "PENDING", isMakeup: false, people: 2 },
      ],
    };
    expect(walletPendingCount(w)).toBe(4);
    expect(walletAvailableToBook(w)).toBe(6);
  });

  it("現代 wallet 以逐堂帳本為準，支援跨 wallet 與混用補課券", () => {
    const w = {
      remainingSessions: 5,
      bookings: [{ bookingStatus: "PENDING", isMakeup: true, people: 3 }],
      sessions: [
        { status: "AVAILABLE" },
        { status: "AVAILABLE" },
        { status: "AVAILABLE" },
        { status: "RESERVED" },
        { status: "RESERVED" },
      ],
    };
    expect(walletPendingCount(w)).toBe(2);
    expect(walletAvailableToBook(w)).toBe(3);
  });

  it("CONFIRMED 也算待到店；逐 wallet clamp 不為負", () => {
    const w = {
      remainingSessions: 1,
      bookings: [
        { bookingStatus: "CONFIRMED", isMakeup: false },
        { bookingStatus: "CONFIRMED", isMakeup: false },
      ],
    };
    expect(walletAvailableToBook(w)).toBe(0); // max(0, 1 - 2)
  });

  it("補課預約不佔可預約堂數", () => {
    const w = {
      remainingSessions: 2,
      bookings: [
        { bookingStatus: "PENDING", isMakeup: true },
        { bookingStatus: "CONFIRMED", isMakeup: true },
      ],
    };
    expect(walletPendingCount(w)).toBe(0);
    expect(walletAvailableToBook(w)).toBe(2);
  });

  it("COMPLETED / NO_SHOW 已反映在 remainingSessions，不再二次扣", () => {
    const w = {
      remainingSessions: 1,
      bookings: [
        { bookingStatus: "COMPLETED", isMakeup: false },
        { bookingStatus: "NO_SHOW", isMakeup: false },
      ],
    };
    expect(walletAvailableToBook(w)).toBe(1);
  });
});

describe("totalAvailableToBook — 多 wallet 逐一 clamp 後加總", () => {
  it("一個爆量 pending 的 wallet 不會把另一個拉成負的", () => {
    const wallets = [
      { remainingSessions: 1, bookings: [] }, // 1
      {
        remainingSessions: 1,
        bookings: [
          { bookingStatus: "PENDING", isMakeup: false },
          { bookingStatus: "PENDING", isMakeup: false },
        ],
      }, // max(0, 1-2)=0
    ];
    expect(totalAvailableToBook(wallets)).toBe(1);
  });
});

describe("ledgerUsage — 已使用含 BACKFILLED，VOIDED 獨立", () => {
  it("黃彥陸案例：2 BACKFILLED + 1 AVAILABLE → used=2, voided=0", () => {
    const sessions = [
      { status: "BACKFILLED" },
      { status: "BACKFILLED" },
      { status: "AVAILABLE" },
    ];
    expect(ledgerUsage(sessions)).toEqual({ used: 2, voided: 0 });
  });

  it("COMPLETED 計入已使用；VOIDED 不混入，獨立回報", () => {
    const sessions = [
      { status: "COMPLETED" },
      { status: "COMPLETED" },
      { status: "VOIDED" },
    ];
    expect(ledgerUsage(sessions)).toEqual({ used: 2, voided: 1 });
  });

  it("AVAILABLE / RESERVED 不算已使用", () => {
    const sessions = [{ status: "AVAILABLE" }, { status: "RESERVED" }];
    expect(ledgerUsage(sessions)).toEqual({ used: 0, voided: 0 });
  });

  it("堂數守恆：total = remaining(avail+reserved) + used + voided", () => {
    const sessions = [
      { status: "AVAILABLE" },
      { status: "RESERVED" },
      { status: "COMPLETED" },
      { status: "BACKFILLED" },
      { status: "VOIDED" },
    ];
    const { used, voided } = ledgerUsage(sessions);
    const remaining =
      sessions.filter((s) => s.status === "AVAILABLE" || s.status === "RESERVED").length;
    expect(remaining + used + voided).toBe(sessions.length);
  });
});

describe("跨頁一致性：首頁 / my-plans 上方 / booking form 同輸入同結果", () => {
  it("同一組 wallet，三頁的可預約數字必須相同", () => {
    const wallets = [
      {
        remainingSessions: 1,
        bookings: [{ bookingStatus: "PENDING", isMakeup: false }],
      },
      { remainingSessions: 3, bookings: [] },
    ];
    // 首頁：totalAvailableToBook
    const homepage = totalAvailableToBook(wallets);
    // my-plans 上方：同 helper
    const myPlansTop = totalAvailableToBook(wallets);
    // booking form：逐 wallet walletAvailableToBook 後加總
    const bookingForm = wallets.reduce((s, w) => s + walletAvailableToBook(w), 0);
    expect(homepage).toBe(3);
    expect(myPlansTop).toBe(homepage);
    expect(bookingForm).toBe(homepage);
  });
});
