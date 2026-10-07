import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PlanPackageNotes } from "@/components/plan-package-notes";

describe("shared plan terms", () => {
  it("renders annual totals and clearly scopes add-on terms", () => {
    const html = renderToStaticMarkup(createElement(PlanPackageNotes));
    for (const text of ["首間分店免串接費", "第 2～5 間每間 $500／月", "第 6～15 間每間 $300／月", "16 間起另行報價", "6 間分店的串接費共 $2,300／月", "12 個月", "14 個月", "NT$17,880", "NT$29,880", "NT$59,880", "NT$500／月", "NT$800／月", "額度內選配不另收費", "保留各門市獨立開關", "數位管家需個別確認開通", "以上年繳總額僅計主方案"]) {
      expect(html).toContain(text);
    }
  });
  it("explains included export, deferred free choices and independent materials access", () => {
    const html = renderToStaticMarkup(createElement(PlanPackageNotes));
    expect(html).toContain("顧客經營、分析、現金抽屜、資料匯出內含");
    expect(html).toContain("免費任選可之後再決定");
    expect(html).toContain("兩項各自計費");
    expect(html).not.toContain("資料匯出可選配");
    expect(html).toContain("<details");
  });
});
