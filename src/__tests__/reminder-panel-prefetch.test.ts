// @vitest-environment jsdom
import { createElement as h, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({usePathname: () => "/s/a/admin/dashboard/settings"}));
vi.mock("@/components/app-link", () => ({AppLink: ({children,prefetch}:{children:ReactNode;prefetch?:boolean}) => h("a", {"data-prefetch": String(prefetch)}, children)}));
import { DashboardLink } from "@/components/dashboard-link";
import { SettingsPanelContext } from "@/components/admin/settings-panel-context";
it("disables full-route prefetch inside independent panels while preserving ordinary link behavior", () => {
 const link=h(DashboardLink,{href:"/dashboard/reminders?tab=customer",children:"顧客"});
 expect(renderToStaticMarkup(link)).toContain('data-prefetch="undefined"');
 expect(renderToStaticMarkup(h(SettingsPanelContext.Provider,{value:{report:()=>{},navigate:()=>{},registerReader:()=>()=>{}}},link))).toContain('data-prefetch="false"');
});
