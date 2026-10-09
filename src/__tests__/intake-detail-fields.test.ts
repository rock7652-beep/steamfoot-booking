import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { IntakeDetailFields, intakeDetailText } from "@/app/hq/dashboard/trial-applications/intake-detail-fields";

describe("compact intake answers", () => {
  it("omits absent answers without hiding explicit false or zero", () => {
    const html = renderToStaticMarkup(createElement(IntakeDetailFields, { fields: {
      空字串: "", 空白: " \n ", 空陣列: [], 空值: null, 未知: undefined,
      明確否: false, 明確零: 0, 明確是: true, 原文: "第一行\n第二行", 陣列: ["甲", "", false, 0],
    } }));
    for (const label of ["空字串", "空白", "空陣列", "空值", "未知", "尚未提供"]) expect(html).not.toContain(label);
    for (const text of ["明確否", ">否<", "明確零", ">0<", ">是<", "第一行\n第二行", "甲、否、0"]) expect(html).toContain(text);
  });
  it("does not create empty lists or stringify unknown objects", () => {
    expect(renderToStaticMarkup(createElement(IntakeDetailFields, { fields: { a: " ", b: [] } }))).toBe("");
    expect(intakeDetailText({ hidden: "secret" })).toBeNull();
    expect(intakeDetailText(Infinity)).toBeNull();
  });
});
