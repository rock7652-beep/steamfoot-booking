import React from "react";
import { expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
vi.mock("@/components/dashboard-link", () => ({
  DashboardLink: ({children, ...props}: React.ComponentProps<"a">) => React.createElement("a", {...props, "data-client-navigation": true}, children),
}));
import { ErrorState } from "@/components/ui/error-state";
it("uses document navigation to recover across store scopes", () => {
  const html = renderToStaticMarkup(React.createElement(ErrorState, {backHref: "/s/own/admin/dashboard", backLabel: "返回自己的店舖", backReload: true}));
  expect(html).toContain('href="/s/own/admin/dashboard"');
  expect(html).toContain("返回自己的店舖");
  expect(html).not.toContain("data-client-navigation");
});
it("preserves existing client navigation by default", () => {
  const html = renderToStaticMarkup(React.createElement(ErrorState));
  expect(html).toContain('data-client-navigation="true"');
  expect(html).toContain("回首頁");
});
