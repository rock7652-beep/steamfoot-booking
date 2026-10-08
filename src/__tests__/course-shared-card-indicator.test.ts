// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { readFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
import { CourseSharedCardIndicator } from "@/app/(dashboard)/dashboard/courses/course-shared-card-indicator";

it("opens the existing detail action with an accessible complete name without hover", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host), onOpen = vi.fn();
  const name = "長名稱方案與完整課程辨識".repeat(8);
  try {
    await act(async () => root.render(createElement(CourseSharedCardIndicator, { name, onOpen })));
    const button = host.querySelector("button")!;
    expect(button.textContent).toBe("共卡");
    expect(button.getAttribute("aria-label")).toBe(`${name}：允許共卡，查看詳情`);
    expect(button.hasAttribute("title")).toBe(false);
    expect(button.className).toContain("min-h-11");
    expect(button.className).toContain("shrink-0");
    await act(async () => button.click()); expect(onOpen).toHaveBeenCalledOnce();
    await act(async () => root.render(createElement(CourseSharedCardIndicator, { name:"另一個方案", onOpen })));
    expect(host.querySelector("button")!.getAttribute("aria-label")).toBe("另一個方案：允許共卡，查看詳情");
  } finally { await act(async () => root.unmount()); host.remove(); }
});

it("keeps six sports table columns with one inline detail indicator and no hidden filter effect", () => {
  const source=readFileSync("src/app/(dashboard)/dashboard/courses/member-workspace.tsx","utf8");
  expect(source).toContain('["方案／適用課程", "額度", "售價", "有效天數", "購買方式", "操作"]');
  expect(source).not.toContain('"購買方式", "共卡", "操作"');
  expect(source).toContain('sharingVisible && p.allowShared && <CourseSharedCardIndicator');
  expect(source).toContain('sharedCardState === "HIDDEN" ? "all" : savedSharedFilter');
  expect(source).toContain('colSpan={music ? 5 : 6}');
  expect(source).toContain('overflow-x-auto rounded-lg');
  expect(source).toContain('if (!sharingEnabled) { e.preventDefault(); return; }');
  expect(source).toContain('<CourseCardSummary card={card} />');
  expect(source).toContain('<CourseCardEntries card={card} />');
});
