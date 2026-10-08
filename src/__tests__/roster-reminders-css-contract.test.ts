/** CSS-source contract only. Parsing declarations is not a viewport/pixel test. */
import { readFileSync } from "node:fs";
import postcss from "postcss";
import { expect, it } from "vitest";
function css(relative: string) { return postcss.parse(readFileSync(new URL(relative, import.meta.url), "utf8")); }
function topDeclarations(sheet: ReturnType<typeof css>, selector: string) {
  const values: Record<string, string> = {};
  sheet.walkRules(rule => { if (rule.selector === selector && rule.parent?.type === "root") rule.walkDecls(declaration => { values[declaration.prop] = declaration.value; }); });
  return values;
}
const shared = css("../components/admin/roster-reminders.module.css");
it("defines two 20px summary rows, 14px text and distinct 44px controls", () => {
  expect(topDeclarations(shared, ".overview")).toMatchObject({ "grid-template-rows": "20px 20px", gap: "4px", height: "44px", "min-height": "44px", "font-size": "14px", "line-height": "20px", "min-width": "0" });
  expect(topDeclarations(shared, ".reminders")).toMatchObject({ "grid-template-columns": "minmax(0, 1fr) 44px 44px", "min-width": "0" });
  expect(topDeclarations(shared, ".actionSlot, .iconAction")).toMatchObject({ width: "44px", height: "44px", "min-width": "44px", "min-height": "44px" });
});
it("clips only the summary text and reserves source labels instead of shrinking type", () => {
  expect(topDeclarations(shared, ".noteText")).toMatchObject({ "text-overflow": "ellipsis", "white-space": "nowrap", "min-width": "0" });
  expect(topDeclarations(shared, ".noteSource")["flex-shrink"]).toBe("0");
  const sizes: string[] = []; shared.walkDecls("font-size", declaration => { sizes.push(declaration.value); });
  expect(sizes).toEqual(["14px"]);
});
it.each([
  ["steam", "../app/(dashboard)/dashboard/bookings/day-detail-panel.module.css", "booking-roster", ["min-width: 1000px", "max-width: 639px", "min-width: 640px"]],
  ["spa", "../app/(dashboard)/dashboard/spa-schedule/booking-roster.module.css", "spa-roster", ["max-width: 959px", "max-width: 559px"]],
  ["sports", "../app/(dashboard)/dashboard/courses/sports-roster.module.css", "sports-roster", ["max-width: 1023px", "max-width: 879px", "max-width: 639px", "max-width: 359px"]],
] as const)("%s keeps container-responsive tracks and the original 56px minimum row", (_module, relative, name, requiredBreakpoints) => {
  void _module;
  const sheet = css(relative), queries: string[] = [];
  sheet.walkAtRules("container", rule => { queries.push(rule.params); });
  for (const breakpoint of requiredBreakpoints) expect(queries.some(query => query.includes(name) && query.includes(breakpoint))).toBe(true);
  const heights: string[] = []; sheet.walkDecls("min-height", declaration => { heights.push(declaration.value); });
  expect(heights).toContain("56px");
  expect(sheet.toString()).toContain("minmax(0, 1fr)");
});
it("keeps modal content scrollable on narrow and short coarse-pointer viewports", () => {
  const sheet = css("../components/admin/right-sheet.module.css");
  const queries: string[] = []; sheet.walkAtRules("media", rule => { queries.push(rule.params); });
  expect(queries.some(query => query.includes("max-width: 639px"))).toBe(true);
  expect(queries.some(query => query.includes("max-height: 500px") && query.includes("pointer: coarse"))).toBe(true);
  expect(sheet.toString()).toContain("overflow-y: auto");
  expect(sheet.toString()).toContain("max-height: 100dvh");
});
