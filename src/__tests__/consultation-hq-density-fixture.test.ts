import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ find: vi.fn(), count: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { consultationLead: { findMany: m.find, count: m.count } } }));
vi.mock("@/app/hq/dashboard/trial-applications/consultation-actions", () => ({ updateConsultationLead: vi.fn() }));
vi.mock("@/components/admin/roster-primitives", () => ({ RosterToolbar: ({ children }: { children: React.ReactNode }) => createElement("div", { className: "flex flex-wrap items-center gap-2" }, children) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));
vi.mock("next/link", () => ({ default: ({ children, ...props }: Record<string, unknown>) => createElement("a", props, children as never) }));
import { ConsultationLeadList } from "@/app/hq/dashboard/trial-applications/consultation-list";
import { ConsultationFilters } from "@/app/hq/dashboard/trial-applications/consultation-filters";
import { parseConsultationSearch } from "@/app/hq/dashboard/trial-applications/consultation-view";
import styles from "@/app/hq/dashboard/trial-applications/intake-list.module.css";

describe("HQ compact list: synthetic density and full-dataset queries", () => {
  it("keeps six useful fields in every collapsed row and filters before pagination", async () => {
    const rows = Array.from({ length: 20 }, (_, index) => ({
      id: `synthetic-${index}`, requestId: `synthetic-request-${index}`, revision: 1,
      storeName: index === 0 ? "本機合成資料｜很長的瑜伽與音樂課程複合空間分店名稱" : `合成門市 ${index + 1}`,
      industry: "運動教室／健身／瑜伽", contactName: "示範聯絡人", phone: "0912-000-000", lineId: "@synthetic-only", websiteUrl: null, facebookUrl: null, instagramUrl: null,
      status: ["NEW", "CONTACTED", "FOLLOW_UP", "CLOSED"][index % 4], sheetStatus: "CONFIRMED", createdAt: new Date("2026-10-07T18:30:00Z"), sheetConfirmedAt: new Date("2026-10-07T18:31:00Z"),
      originalPayload: { industry: "運動教室／健身／瑜伽", contactName: "示範聯絡人", contactWay: "申請體驗帳號", needs: ["課程預約", "會員管理", "自動提醒"], priorityNeed: "課程預約", otherNeed: "僅供本機排版與鍵盤驗收。沒有真實店家資料，也不會發送訊息。" },
      activities: [], _count: { activities: 0 }, trialApplicationId: null, trialLinkedAt: null, trialLinkedBy: null, trialApplication: null,
    }));
    m.find.mockResolvedValue(rows); m.count.mockResolvedValue(43);
    const search = parseConsultationSearch({ q: "合成", status: "NEW", page: "2" });
    const list = await ConsultationLeadList(search);
    const html = renderToStaticMarkup(list);
    expect((html.match(/<summary/g) ?? []).length).toBeGreaterThanOrEqual(20);
    const firstSummary = html.match(/<summary[^>]*>(.*?)<\/summary>/)?.[1] ?? "";
    for (const text of ["示範聯絡人", "課程預約", "待聯繫", "依原留方式聯繫", "2026/10/8"]) expect(firstSummary).toContain(text);
    expect(m.find.mock.calls[0][0]).toMatchObject({ skip: 20, take: 20, where: { status: "NEW", OR: expect.any(Array) } });
    expect(m.count).toHaveBeenCalledWith({ where: m.find.mock.calls[0][0].where });
    expect(html).toContain("共 43 件"); expect(html).toContain("下一頁");
    const target = process.env.HQ_INTAKE_FIXTURE_DIR;
    if (!target || !target.startsWith("/tmp/hq-intake-")) return;
    mkdirSync(target, { recursive: true });
    const source = readFileSync("src/app/hq/dashboard/trial-applications/intake-list.module.css", "utf8");
    const css = source.replace(/\.([A-Za-z][A-Za-z0-9]*)/g, (whole, name: string) => styles[name] ? `.${styles[name]}` : whole);
    writeFileSync(`${target}/intake-module.css`, css);
    const chrome = `<aside class="fixture-sidebar"><strong>蒸管家 HQ</strong><p>品牌總覽</p><p>店鋪管理</p><p class="active">諮詢與體驗申請</p></aside><header class="fixture-header">HQ 總部 · 全部店鋪 <span>本機合成驗收</span></header>`;
    const wrap = (body: string) => `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"><link rel="stylesheet" href="/intake-module.css"><title>本機合成 HQ 列表</title><style>*{box-sizing:border-box}body{margin:0}.fixture-sidebar{display:none}.fixture-header{padding:16px;border-bottom:1px solid #e7e0d4;background:white;display:flex;justify-content:space-between;font-size:14px}.fixture-main{padding:16px}.fixture-sidebar p{padding:12px 8px}.fixture-sidebar .active{background:#dce8e1;color:#2f5d50;border-radius:8px}@media(min-width:1024px){.fixture-sidebar{display:block;position:fixed;left:0;top:0;bottom:0;width:240px;background:white;padding:24px 16px;border-right:1px solid #e7e0d4}.fixture-main,.fixture-header{margin-left:240px}.fixture-main{padding:24px}}</style></head><body>${chrome}<main class="fixture-main"><div class="w-full min-w-0 space-y-3"><header><h1 class="admin-page-title">諮詢與體驗申請</h1><p class="mt-1 text-sm text-earth-600">先看需求，再核對開通資料。兩階段需人工關聯。</p></header>${renderToStaticMarkup(createElement(ConsultationFilters, { search: parseConsultationSearch({}) }))}<p class="flex flex-wrap items-center gap-x-2 text-sm text-earth-600"><span>歷史 Sheet 資料尚未匯入 HQ。</span><a class="inline-flex min-h-11 items-center text-primary-800 underline" href="#legacy">查看原有需求諮詢 Sheet ↗</a></p>${body}</div></main></body></html>`;
    writeFileSync(`${target}/index.html`, wrap(html));
    m.find.mockResolvedValue([]); m.count.mockResolvedValue(0);
    writeFileSync(`${target}/empty.html`, wrap(renderToStaticMarkup(await ConsultationLeadList(parseConsultationSearch({})))));
  });
});
