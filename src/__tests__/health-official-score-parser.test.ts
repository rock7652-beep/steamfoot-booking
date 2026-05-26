/**
 * normalizeOfficial parser tests (PR feat/liff-health-official-score)
 *
 * HealthFlow API 回應 → HealthSummary.official 的 normalization。
 * 確保：
 *   - 完整 valid response → 正確 narrow
 *   - score 缺 / 非數字 → 整段 undefined (UI graceful fallback)
 *   - adviceSummary 不是 array → 變空 array，不 throw
 *   - scoreExplanation 缺 / 非 string → 變 null
 *   - 額外欄位忽略
 */

import { describe, it, expect } from "vitest";
import { normalizeOfficial } from "@/lib/health-service";

describe("normalizeOfficial", () => {
  it("完整 valid response → 正確 narrow", () => {
    const raw = {
      score: 86,
      scoreLevel: "excellent",
      riskLevel: "warning",
      riskLabel: "注意",
      scoreExplanation: "從目前的健康資料來看，整體基礎不錯。",
      adviceSummary: ["每週 2-3 次有氧", "每天 2000ml 水", "規律作息"],
    };
    const result = normalizeOfficial(raw);
    expect(result).toEqual({
      score: 86,
      scoreLevel: "excellent",
      riskLevel: "warning",
      riskLabel: "注意",
      scoreExplanation: "從目前的健康資料來看，整體基礎不錯。",
      adviceSummary: ["每週 2-3 次有氧", "每天 2000ml 水", "規律作息"],
    });
  });

  it("score 缺 → undefined（整段 graceful fallback）", () => {
    const raw = {
      scoreLevel: "excellent",
      riskLevel: "warning",
      adviceSummary: ["tip"],
    };
    expect(normalizeOfficial(raw)).toBeUndefined();
  });

  it("score 非數字 → undefined", () => {
    expect(normalizeOfficial({ score: "86" })).toBeUndefined();
    expect(normalizeOfficial({ score: null })).toBeUndefined();
    expect(normalizeOfficial({ score: NaN })).toBeUndefined();
    expect(normalizeOfficial({ score: Infinity })).toBeUndefined();
  });

  it("score 浮點 → Math.round 整數化", () => {
    expect(normalizeOfficial({ score: 86.4 })?.score).toBe(86);
    expect(normalizeOfficial({ score: 86.6 })?.score).toBe(87);
  });

  it("adviceSummary 非 array → 空 array", () => {
    const r = normalizeOfficial({ score: 80, adviceSummary: "single string" });
    expect(r?.adviceSummary).toEqual([]);
    const r2 = normalizeOfficial({ score: 80 });
    expect(r2?.adviceSummary).toEqual([]);
  });

  it("adviceSummary array 內有非 string 元素 → filter 掉", () => {
    const r = normalizeOfficial({
      score: 80,
      adviceSummary: ["good", 42, "bad", null, "ok"],
    });
    expect(r?.adviceSummary).toEqual(["good", "bad", "ok"]);
  });

  it("scoreExplanation 缺 / 非 string → null", () => {
    expect(normalizeOfficial({ score: 80 })?.scoreExplanation).toBeNull();
    expect(
      normalizeOfficial({ score: 80, scoreExplanation: 123 })?.scoreExplanation,
    ).toBeNull();
  });

  it("scoreLevel / riskLevel / riskLabel 缺 → 空字串（不 throw）", () => {
    const r = normalizeOfficial({ score: 80 });
    expect(r?.scoreLevel).toBe("");
    expect(r?.riskLevel).toBe("");
    expect(r?.riskLabel).toBe("");
  });

  it("非 object 輸入 → undefined", () => {
    expect(normalizeOfficial(null)).toBeUndefined();
    expect(normalizeOfficial(undefined)).toBeUndefined();
    expect(normalizeOfficial(42)).toBeUndefined();
    expect(normalizeOfficial("string")).toBeUndefined();
  });

  it("額外不認識的欄位 → 忽略，不影響 narrow", () => {
    const r = normalizeOfficial({
      score: 86,
      unknown_field: "x",
      __debug: { a: 1 },
    });
    expect(r?.score).toBe(86);
    expect((r as unknown as Record<string, unknown>).unknown_field).toBeUndefined();
  });
});
