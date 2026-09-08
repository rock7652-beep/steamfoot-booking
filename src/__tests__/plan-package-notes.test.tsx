import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PlanPackageNotes } from "@/components/plan-package-notes";

describe("shared plan terms", () => {
  it("renders annual totals and clearly scopes add-on terms", () => {
    const html = renderToStaticMarkup(createElement(PlanPackageNotes));
    for (const text of ["12 個月", "14 個月", "NT$17,880", "NT$29,880", "NT$59,880", "NT$500／月", "NT$800／月", "額度內選配不另收費", "保留各門市獨立開關", "數位管家需個別確認開通", "以上年繳總額僅計主方案"]) {
      expect(html).toContain(text);
    }
  });
});
