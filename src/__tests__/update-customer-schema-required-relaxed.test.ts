/**
 * updateCustomerSchema — 後台編輯放寬必填欄位
 *
 * 背景：店長從後台補顧客資料情境，原本 email / gender / birthday / height 都強制必填，
 * 導致快速建檔後若資料不齊就無法儲存修正。本 PR 放寬：除 name + phone 外皆選填，
 * 空白會被 preprocess 成 undefined，由 action 寫成 null 清空 DB。
 *
 * 重點驗證：
 *   1. 只填 name + phone 仍能通過 schema
 *   2. 空字串 / 空白 → undefined（不報 required error）
 *   3. name / phone 仍為必填，且 phone 須過 09xx 正規化
 *   4. email 有給時仍驗格式
 *   5. height 接受 number / 字串轉 number / 空白都不報 NaN
 *
 * 前台顧客自助 profile / onboarding 走 src/server/actions/profile.ts 的 inline
 * 驗證，不共用本 schema — 放寬此 schema 不影響前台規則。
 */

import { describe, it, expect } from "vitest";
import { updateCustomerSchema } from "@/lib/validators/customer";

describe("updateCustomerSchema — 必填欄位放寬（後台店長編輯）", () => {
  it("只填 name + phone 即可通過", () => {
    const r = updateCustomerSchema.safeParse({
      name: "張三",
      phone: "0912345678",
    });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.email).toBeUndefined();
    expect(r.data.gender).toBeUndefined();
    expect(r.data.birthday).toBeUndefined();
    expect(r.data.height).toBeUndefined();
  });

  it("email / gender / birthday / height 同時填空字串 → 全部 undefined", () => {
    const r = updateCustomerSchema.safeParse({
      name: "李四",
      phone: "0912345678",
      email: "",
      gender: "",
      birthday: "",
      height: "",
    });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.email).toBeUndefined();
    expect(r.data.gender).toBeUndefined();
    expect(r.data.birthday).toBeUndefined();
    expect(r.data.height).toBeUndefined();
  });

  it("空 name 仍報錯", () => {
    const r = updateCustomerSchema.safeParse({
      name: "",
      phone: "0912345678",
    });
    expect(r.success).toBe(false);
    if (r.success) return;
    expect(r.error.issues.some((i) => i.message === "請輸入姓名")).toBe(true);
  });

  it("空 phone 仍報錯（格式不符）", () => {
    const r = updateCustomerSchema.safeParse({
      name: "張三",
      phone: "",
    });
    expect(r.success).toBe(false);
  });

  it("phone 格式錯仍報錯", () => {
    const r = updateCustomerSchema.safeParse({
      name: "張三",
      phone: "0212345678", // 非 09 開頭
    });
    expect(r.success).toBe(false);
  });

  it("phone 接受 +886 / -空格混入並 normalize 成 09xx", () => {
    const r = updateCustomerSchema.safeParse({
      name: "張三",
      phone: "+886 912-345-678",
    });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.phone).toBe("0912345678");
  });

  it("email 有給時仍驗格式 — 無效 email 報錯", () => {
    const r = updateCustomerSchema.safeParse({
      name: "張三",
      phone: "0912345678",
      email: "not-an-email",
    });
    expect(r.success).toBe(false);
    if (r.success) return;
    expect(r.error.issues.some((i) => i.message === "Email 格式不正確")).toBe(true);
  });

  it("email 有給且合法 → 通過", () => {
    const r = updateCustomerSchema.safeParse({
      name: "張三",
      phone: "0912345678",
      email: "abc@example.com",
    });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.email).toBe("abc@example.com");
  });

  it("gender 接受 male / female / other / 空字串", () => {
    for (const g of ["male", "female", "other"] as const) {
      const r = updateCustomerSchema.safeParse({
        name: "張三",
        phone: "0912345678",
        gender: g,
      });
      expect(r.success).toBe(true);
      if (!r.success) continue;
      expect(r.data.gender).toBe(g);
    }
  });

  it("gender 為無效字串 → 報錯（避免錯誤值寫入 DB）", () => {
    const r = updateCustomerSchema.safeParse({
      name: "張三",
      phone: "0912345678",
      gender: "unknown",
    });
    expect(r.success).toBe(false);
  });

  it("height 接受數字", () => {
    const r = updateCustomerSchema.safeParse({
      name: "張三",
      phone: "0912345678",
      height: 170,
    });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.height).toBe(170);
  });

  it("height 接受數字字串並轉成 number", () => {
    const r = updateCustomerSchema.safeParse({
      name: "張三",
      phone: "0912345678",
      height: "168.5",
    });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.height).toBe(168.5);
  });

  it("height 空字串 → undefined（不報 NaN）", () => {
    const r = updateCustomerSchema.safeParse({
      name: "張三",
      phone: "0912345678",
      height: "",
    });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.height).toBeUndefined();
  });

  it("height 範圍外仍報錯", () => {
    const r = updateCustomerSchema.safeParse({
      name: "張三",
      phone: "0912345678",
      height: 30,
    });
    expect(r.success).toBe(false);
  });

  it("birthday 空白 → undefined", () => {
    const r = updateCustomerSchema.safeParse({
      name: "張三",
      phone: "0912345678",
      birthday: "   ",
    });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.birthday).toBeUndefined();
  });

  it("birthday 有給保留字串（action 層轉 Date）", () => {
    const r = updateCustomerSchema.safeParse({
      name: "張三",
      phone: "0912345678",
      birthday: "1990-01-15",
    });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.birthday).toBe("1990-01-15");
  });

  it("lineName / notes 維持選填，null 可清空", () => {
    const r = updateCustomerSchema.safeParse({
      name: "張三",
      phone: "0912345678",
      lineName: null,
      notes: null,
    });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.data.lineName).toBeNull();
    expect(r.data.notes).toBeNull();
  });
});
