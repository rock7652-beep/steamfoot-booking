// @vitest-environment jsdom
import { act, createElement as el } from "react";
import { createRoot } from "react-dom/client";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PageHeader } from "@/components/desktop/page-header";
import { PageShell } from "@/components/desktop/page-shell";
import { DataTable } from "@/components/desktop/data-table";
import { InfoList } from "@/components/desktop/info-list";
import { ExclusiveMenu } from "@/components/admin/exclusive-menu";
import { ADMIN_SETTINGS_PANEL } from "@/lib/admin-ui";

vi.mock("@/components/dashboard-link", () => ({
  DashboardLink: ({ children, href }: { children: React.ReactNode; href: string }) => el("a", { href }, children),
}));

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });

describe("shared admin visual alignment", () => {
  it("uses the same title and dense page spacing without constraining desktop width", async () => {
    await act(async () => root.render(el(PageShell, { children: el(PageHeader, { title: "顧客管理", subtitle: "搜尋顧客" }) })));
    expect(host.querySelector("h1")?.className).toBe("admin-page-title");
    expect(host.querySelector("p")?.className).toContain("text-sm");
    expect(host.querySelector("[data-page-shell]")?.className).toContain("gap-3 py-2");
    expect(host.innerHTML).not.toContain("max-w-");
  });

  it("keeps compact overrides for already-tuned course pages", async () => {
    await act(async () => root.render(el(PageShell, { compact: true, children: "課表" })));
    expect(host.firstElementChild?.className).toContain("gap-2 py-2");
    await act(async () => root.render(el(PageShell, { className: "course-workspace gap-1", children: "課表" })));
    expect(host.firstElementChild?.className).toBe("course-workspace gap-1");
  });

  it("keeps readable table headers and secondary fields; preserves phone and action interactions", async () => {
    const row = { id: "one", name: "黃彥陸", phone: "0972756667" };
    await act(async () => root.render(el(DataTable<typeof row>, {
      rows: [row], rowKey: r => r.id, rowHref: r => `/customers/${r.id}`,
      columns: [
        { key: "name", header: "姓名", accessor: r => r.name },
        { key: "phone", header: "電話", priority: "secondary", noLink: true, accessor: r => el("a", { href: `tel:${r.phone}` }, r.phone) },
        { key: "actions", header: "操作", align: "center", noLink: true, accessor: () => el("button", { type: "button" }, "⋯") },
      ],
    })));
    expect(host.querySelector("thead")?.className).toContain("text-sm");
    expect(host.querySelectorAll("td")[1].className).toContain("text-sm");
    expect(host.querySelectorAll("th")[2].className).toContain("text-center");
    expect(host.querySelectorAll("td")[2].className).toContain("text-center");
    expect(host.querySelector("a[href='tel:0972756667']")).not.toBeNull();
    expect(host.querySelector("a a, a button")).toBeNull();
  });

  it("shows detail labels and values at the same readable size", async () => {
    await act(async () => root.render(el(InfoList, { items: [{ label: "所屬店長", value: "賴店長" }] })));
    expect(host.querySelector("dt")?.className).toContain("text-sm");
    expect(host.querySelector("dd")?.className).toContain("text-sm");
  });

  it("makes dots borderless and centered without changing text-button menus", async () => {
    await act(async () => root.render(el(ExclusiveMenu, { label: "顧客操作", triggerText: "⋯", children: "編輯" })));
    expect(host.querySelector("button")?.className).not.toContain("border border");
    expect(host.querySelector("button")?.className).toContain("items-center justify-center");
    expect(host.querySelector("button")?.getAttribute("aria-label")).toBe("顧客操作");
    await act(async () => root.render(el(ExclusiveMenu, { label: "批次操作", children: "編輯" })));
    expect(host.querySelector("button")?.className).toContain("border border");
  });

  it("uses one geometry source for course and shared settings", () => {
    expect(ADMIN_SETTINGS_PANEL).toEqual({ width: 1100, maxHeight: 900 });
    for (const path of ["src/components/settings/settings-panel.tsx", "src/app/(dashboard)/dashboard/courses/settings-panel.tsx"]) {
      expect(readFileSync(path, "utf8")).toContain("ADMIN_SETTINGS_PANEL.width");
      expect(readFileSync(path, "utf8")).toContain("ADMIN_SETTINGS_PANEL.maxHeight");
    }
  });

  it("covers legacy dashboard and HQ headings, without changing customer or LIFF pages", () => {
    let headings = 0;
    function scan(dir: string) {
      for (const item of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, item.name);
        if (item.isDirectory()) scan(path);
        else if (path.endsWith(".tsx")) {
          // These routes immediately redirect; their unreachable MVP markup is not rendered.
          if (["analytics", "ops", "ranking", "upgrade-requests"].some(route => path === `src/app/(dashboard)/dashboard/${route}/page.tsx`)) continue;
          for (const heading of readFileSync(path, "utf8").matchAll(/<h1 className="([^"]*)"/g)) {
            headings++;
            expect(heading[1], path).toContain("admin-page-title");
          }
        }
      }
    }
    scan("src/app/(dashboard)"); scan("src/app/hq/dashboard");
    expect(headings).toBeGreaterThan(40);
    const css = readFileSync("src/app/globals.css", "utf8");
    expect(css).toMatch(/\.admin-page-title\s*\{[^}]*font-size: 16px/);
    expect(css).not.toMatch(/\[data-dashboard-content\]\s+h1\s*\{/);
  });
});
