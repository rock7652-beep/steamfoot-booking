/**
 * deriveCustomerSource — pure helper unit tests
 *
 * 涵蓋 9 種真實情境（取材於 zhubei prod 觀察）：
 *   1. 純 LINE 登入（authSource=LINE + Account[line] + lineUserId）
 *   2. 純 Google 登入
 *   3. 手機+密碼註冊（無 email、無 OAuth）— 17 位 zhubei 顧客的真實樣態
 *   4. 手機+密碼註冊（含 email）— 林彥佑型
 *   5. 後台手建未啟用（無 User）
 *   6. LINE 合併殘留（authSource=EMAIL 但有 LINE 證據）— 張舒閔/黃芊文型
 *   7. /register 硬寫 EMAIL（authSource=EMAIL + 有密碼 + 無 OAuth）
 *   8. authSource=LINE 但無證據（資料漂移）
 *   9. 完全未知（有 User 但無密碼也無 OAuth）
 */
import { describe, it, expect } from "vitest";
import {
  deriveCustomerSource,
  type CustomerSourceSnapshot,
} from "@/lib/customer-source";

function snap(over: Partial<CustomerSourceSnapshot> = {}): CustomerSourceSnapshot {
  return {
    authSource: "MANUAL",
    email: null,
    lineUserId: null,
    lineLinkStatus: "UNLINKED",
    googleId: null,
    hasUser: true,
    hasPassword: false,
    accountProviders: [],
    ...over,
  };
}

describe("deriveCustomerSource — 9 種情境", () => {
  it("1. 純 LINE 登入：authSource=LINE + Account[line] + lineUserId → 一致", () => {
    const r = deriveCustomerSource(
      snap({
        authSource: "LINE",
        lineUserId: "Uxxx",
        lineLinkStatus: "LINKED",
        accountProviders: ["line"],
      }),
    );
    expect(r.kind).toBe("LINE");
    expect(r.label).toBe("LINE 登入");
    expect(r.inconsistent).toBe(false);
    expect(r.inconsistencyReason).toBeNull();
  });

  it("2. 純 Google 登入 → 一致", () => {
    const r = deriveCustomerSource(
      snap({
        authSource: "GOOGLE",
        googleId: "g-xxx",
        accountProviders: ["google"],
        email: "u@example.com",
      }),
    );
    expect(r.kind).toBe("GOOGLE");
    expect(r.label).toBe("Google 登入");
    expect(r.inconsistent).toBe(false);
  });

  it("3. 手機+密碼註冊（無 email）— 17/zhubei 型 → derived=PHONE_PASSWORD，但 authSource=EMAIL 為不一致", () => {
    const r = deriveCustomerSource(
      snap({
        authSource: "EMAIL",
        email: null,
        hasPassword: true,
        accountProviders: [],
      }),
    );
    expect(r.kind).toBe("PHONE_PASSWORD");
    expect(r.label).toBe("手機/密碼註冊");
    expect(r.inconsistent).toBe(true);
    expect(r.inconsistencyReason).toContain("手機/密碼註冊");
    expect(r.inconsistencyReason).toContain("Email 註冊");
    // 必須帶安撫語句 + 後續建議（避免店長 panic）
    expect(r.inconsistencyReason).toContain("不影響使用");
  });

  it("4. 手機+密碼（含 email）— 林彥佑型 → 同樣 PHONE_PASSWORD + 不一致", () => {
    const r = deriveCustomerSource(
      snap({
        authSource: "EMAIL",
        email: "kmes@gmail.com",
        hasPassword: true,
        accountProviders: [],
      }),
    );
    expect(r.kind).toBe("PHONE_PASSWORD");
    expect(r.inconsistent).toBe(true);
  });

  it("5. 後台手建未啟用（無 User）→ MANUAL，一致", () => {
    const r = deriveCustomerSource(
      snap({
        authSource: "MANUAL",
        hasUser: false,
        hasPassword: false,
      }),
    );
    expect(r.kind).toBe("MANUAL");
    expect(r.label).toBe("店長手建");
    expect(r.inconsistent).toBe(false);
  });

  it("6. LINE 合併殘留：authSource=EMAIL 但有 Account[line]+lineUserId（張舒閔/黃芊文型）→ derived=LINE + 不一致", () => {
    const r = deriveCustomerSource(
      snap({
        authSource: "EMAIL",
        lineUserId: "Uce01ac6",
        lineLinkStatus: "LINKED",
        accountProviders: ["line"],
        hasPassword: false,
      }),
    );
    expect(r.kind).toBe("LINE");
    expect(r.label).toBe("LINE 登入");
    expect(r.inconsistent).toBe(true);
    expect(r.inconsistencyReason).toContain("合併");
  });

  it("7. authSource=EMAIL 但 Customer 無 user 且無證據 → MANUAL + 不一致", () => {
    const r = deriveCustomerSource(
      snap({
        authSource: "EMAIL",
        hasUser: false,
        hasPassword: false,
      }),
    );
    expect(r.kind).toBe("MANUAL");
    expect(r.inconsistent).toBe(true);
    expect(r.inconsistencyReason).toContain("後台手動建立");
    expect(r.inconsistencyReason).toContain("不影響使用");
  });

  it("8. authSource=LINE 但無 Account[line] 也無 lineUserId（資料漂移）→ derived 不是 LINE + 不一致", () => {
    const r = deriveCustomerSource(
      snap({
        authSource: "LINE",
        hasPassword: true,
        accountProviders: [],
      }),
    );
    expect(r.kind).toBe("PHONE_PASSWORD"); // 證據走 password 路徑
    expect(r.inconsistent).toBe(true);
    expect(r.inconsistencyReason).toContain("LINE");
  });

  it("9. 完全未知：有 User 但無密碼也無 OAuth → UNKNOWN + 不一致", () => {
    const r = deriveCustomerSource(
      snap({
        authSource: "EMAIL",
        hasUser: true,
        hasPassword: false,
        accountProviders: [],
      }),
    );
    expect(r.kind).toBe("UNKNOWN");
    expect(r.label).toBe("來源未知");
    expect(r.inconsistent).toBe(true);
  });
});

describe("deriveCustomerSource — 邊界與 OAuth 部分綁定", () => {
  it("Account[line] 存在但 Customer.lineUserId 為 null → 不算 LINE（資料未同步）", () => {
    const r = deriveCustomerSource(
      snap({
        authSource: "LINE",
        lineUserId: null,
        accountProviders: ["line"],
        hasPassword: false,
      }),
    );
    // 條件 1 不成立（缺 lineUserId），條件 2/3/4 也不成立 → UNKNOWN
    expect(r.kind).toBe("UNKNOWN");
    expect(r.inconsistent).toBe(true);
  });

  it("Customer.lineUserId 存在但 Account[line] 不存在 → 不算 LINE（NextAuth 紀錄缺失）", () => {
    const r = deriveCustomerSource(
      snap({
        authSource: "LINE",
        lineUserId: "Uxxx",
        accountProviders: [],
        hasPassword: false,
      }),
    );
    expect(r.kind).toBe("UNKNOWN");
    expect(r.inconsistent).toBe(true);
  });

  it("同時有 LINE 與 Google Account（罕見）→ 取 LINE 優先", () => {
    const r = deriveCustomerSource(
      snap({
        authSource: "LINE",
        lineUserId: "Uxxx",
        googleId: "gxxx",
        accountProviders: ["line", "google"],
      }),
    );
    expect(r.kind).toBe("LINE");
    expect(r.inconsistent).toBe(false);
  });

  it("authSource=GOOGLE 但證據缺失 → UNKNOWN + 提示 GOOGLE 不一致", () => {
    const r = deriveCustomerSource(
      snap({
        authSource: "GOOGLE",
        googleId: null,
        accountProviders: [],
        hasPassword: false,
      }),
    );
    expect(r.kind).toBe("UNKNOWN");
    expect(r.inconsistent).toBe(true);
  });
});
