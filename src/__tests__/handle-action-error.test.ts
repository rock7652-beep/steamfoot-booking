/**
 * handleActionError — ZodError branch + AppError regression tests
 *
 * 背景：先前 ZodError 不是 AppError，handleActionError 會 fall through 到
 * 字串匹配分類器（msg.includes("...")），但 ZodError.message 是 JSON 化的
 * issues 陣列，匹配不到任何條件 → 落到 UNKNOWN → 使用者看到
 * 「系統錯誤，請稍後再試」。這條 fix 加上 ZodError 分支讓 schema 的
 * 自訂訊息（例如 `cuid({ message: "請選擇歸屬店長" })`）能直接傳給 UI。
 */

import { describe, it, expect } from "vitest";
import { z, ZodError } from "zod";
import { handleActionError, AppError } from "@/lib/errors";

describe("handleActionError — ZodError branch", () => {
  it("回傳 schema 的自訂訊息（issues[0].message）", () => {
    const schema = z.object({
      assignedStaffId: z.string().cuid({ message: "請選擇歸屬店長" }),
    });
    let caught: unknown;
    try {
      schema.parse({ assignedStaffId: "" });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ZodError);
    expect(handleActionError(caught)).toEqual({
      success: false,
      error: "請選擇歸屬店長",
    });
  });

  it("schema 沒自訂訊息時，回傳 Zod 預設 issue.message（不是 generic「系統錯誤」）", () => {
    const schema = z.object({ customerId: z.string().cuid() });
    let caught: unknown;
    try {
      schema.parse({ customerId: "not-a-cuid" });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ZodError);
    const result = handleActionError(caught);
    expect(result.success).toBe(false);
    // 重點是不能掉回 generic UNKNOWN 訊息
    expect(result).not.toEqual({
      success: false,
      error: "系統錯誤，請稍後再試",
    });
  });

  it("ZodError issues 陣列為空時，fallback 顯示「輸入格式有誤」", () => {
    expect(handleActionError(new ZodError([]))).toEqual({
      success: false,
      error: "輸入格式有誤",
    });
  });
});

describe("handleActionError — AppError regression (行為不變)", () => {
  it("AppError 訊息原樣回傳（NOT_FOUND）", () => {
    expect(handleActionError(new AppError("NOT_FOUND", "顧客不存在"))).toEqual({
      success: false,
      error: "顧客不存在",
    });
  });

  it("AppError 訊息原樣回傳（VALIDATION）", () => {
    expect(
      handleActionError(new AppError("VALIDATION", "店長不屬於此店別"))
    ).toEqual({ success: false, error: "店長不屬於此店別" });
  });
});

describe("handleActionError — 其他 Error regression (行為不變)", () => {
  it("一般 Error 落到 UNKNOWN 分類，顯示「系統錯誤」", () => {
    expect(handleActionError(new Error("some unexpected runtime error"))).toEqual({
      success: false,
      error: "系統錯誤，請稍後再試",
    });
  });

  it("含「權限」字串的 Error 被分類為 PERMISSION", () => {
    expect(handleActionError(new Error("UNKNOWN 權限問題"))).toEqual({
      success: false,
      error: "權限不足，無法執行此操作",
    });
  });
});
