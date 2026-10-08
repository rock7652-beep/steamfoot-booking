import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { writeFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ find: vi.fn(), count: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { consultationLead: { findMany: m.find, count: m.count } } }));
vi.mock("@/app/hq/dashboard/trial-applications/consultation-actions", () => ({ updateConsultationLead: vi.fn() }));
vi.mock("next/link", () => ({ default: ({ children, ...props }: Record<string, unknown>) => createElement("a", props, children as never) }));
import { ConsultationLeadList } from "@/app/hq/dashboard/trial-applications/consultation-list";
import { parseConsultationSearch } from "@/app/hq/dashboard/trial-applications/consultation-view";
describe("consultation local synthetic UI fixture", () => {
  it("renders the real inline forms with long synthetic content and no data connection", async () => {
    m.find.mockResolvedValue([{ id: "d5e15c3e-0512-4c14-ad98-04fe7ce5b44a", requestId: "6613bac6-7d97-485c-92c4-c59d71e1cba2", revision: 3, storeName: "僅供本機驗收的測試瑜伽與身心工作室長名稱測試分店", industry: "運動教室／健身／瑜伽", contactName: "測試聯絡人", phone: "0912-345-678", lineId: "@TEST-DO-NOT-CONTACT", websiteUrl: "https://example.com", facebookUrl: null, instagramUrl: null, status: "FOLLOW_UP", sheetStatus: "UNKNOWN", createdAt: new Date("2026-10-08T00:00:00Z"), sheetConfirmedAt: null, originalPayload: { industry: "運動教室／健身／瑜伽", phone: "0912-345-678", contactName: "測試聯絡人", lineId: "@TEST-DO-NOT-CONTACT", contactWay: "申請體驗帳號", needs: ["會員課程與點數管理", "團體課預約名額控制", "教練排課與管理"], priorityNeed: "會員課程與點數管理", storeCount: "兩間店", staffCount: "6–10 人", otherNeed: "這是本機合成資料，用來確認窄容器與長文字排版。\n未連接任何資料庫，也不會發送聯絡訊息。" }, activities: [{ id: "activity-id", actorId: "synthetic-admin-id", type: "NOTE", note: "本機合成聯繫紀錄：需確認需求與正式申請資料，再人工核對關聯。".repeat(3), createdAt: new Date("2026-10-08T00:05:00Z") }], _count: { activities: 1 }, trialApplicationId: null, trialLinkedAt: null, trialLinkedBy: null, trialApplication: null }]);
    m.count.mockResolvedValue(1);
    const element = await ConsultationLeadList(parseConsultationSearch({ lead: "d5e15c3e-0512-4c14-ad98-04fe7ce5b44a" }));
    const html = renderToStaticMarkup(element);
    expect(html).toContain("textarea"); expect(html).toContain("我已人工核對"); expect(html).toContain("Sheet 結果不明");
    const target = process.env.CONSULTATION_HQ_FIXTURE_PATH;
    if (target?.startsWith("/tmp/consultation-hq-") && target.endsWith(".html")) {
      writeFileSync(target, `<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/consultation-hq-fixture.css"><title>本機合成 HQ 諮詢排版驗收</title><style>body{margin:0;background:#faf8f4;color:#302c28}.fixture-side{display:none}@media(min-width:1024px){.fixture-side{display:block;width:240px;position:fixed;inset:0 auto 0 0;background:#25483f;color:#fff;padding:24px}.fixture-main{margin-left:240px}}.fixture-main{padding:24px}</style><aside class="fixture-side">HQ 總部<br>諮詢與體驗申請<br><br>本機合成資料</aside><main class="fixture-main"><div class="mx-auto min-w-0 max-w-5xl space-y-5 [overflow-wrap:anywhere]"><h1 class="admin-page-title">諮詢與體驗申請</h1><nav class="flex flex-wrap gap-2"><a class="min-h-11 rounded-lg border px-4 py-2" href="#">需求諮詢</a><a class="min-h-11 rounded-lg border px-4 py-2" href="#">體驗版開通資料</a></nav><p class="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">歷史 Sheet 資料尚未匯入 HQ。僅供本機合成排版驗收。</p>${html.replaceAll("<details>", "<details open>")}</div></main><script>window.addEventListener('load',()=>{const result={width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,overflow:document.documentElement.scrollWidth>innerWidth,controls:[...document.querySelectorAll('button,input:not([type=hidden]),textarea,select')].filter(e=>e.getBoundingClientRect().width>0).map(e=>({tag:e.tagName,width:Math.round(e.getBoundingClientRect().width),height:Math.round(e.getBoundingClientRect().height),right:Math.round(e.getBoundingClientRect().right)}))};document.body.dataset.qa=JSON.stringify(result);});</script></html>`);
    }
  });
});
