// @vitest-environment jsdom
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ find: vi.fn(), count: vi.fn(), update: vi.fn(), retry: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { trialApplication: { findMany: mocks.find, count: mocks.count } } }));
vi.mock("@/app/hq/dashboard/trial-applications/actions", () => ({
  updateApplication: mocks.update, retryApplicationNotification: mocks.retry,
}));
vi.mock("next/link", () => ({ default: ({ children, ...props }: Record<string, unknown>) => createElement("a", props, children as never) }));

import { TrialApplicationsList } from "@/app/hq/dashboard/trial-applications/trial-application-list";
import { parseConsultationSearch } from "@/app/hq/dashboard/trial-applications/consultation-view";
import { emptyTrialApplication, setupSections, trialApplicationSchema, type TrialApplicationData } from "@/lib/trial-application";

const record = (payload: Partial<TrialApplicationData> = {}) => ({
  id: "synthetic-application", revision: 0, status: "NEEDS_INFO", storeName: "合成甲館", contactEmail: "synthetic@example.com",
  notificationStatus: "FAILED", createdAt: new Date("2026-10-08T00:00:00Z"),
  payload: {
    ...emptyTrialApplication, storeName: "合成甲館", contactName: "合成聯絡人", phone: "0900-000-001", email: "synthetic@example.com",
    mapsUrl: "https://maps.app.goo.gl/synthetic", lineId: "@synthetic", friendUrl: "https://lin.ee/synthetic",
    inviteUrl: "https://manager.line.biz/invite/synthetic", integration: "existing" as const, integrationName: "合成串接",
    brandName: "合成品牌", otherStores: "合成乙館", slug: "synthetic-branch", additionalManagers: "合成使用者",
    sharedLine: "no" as const, sharedLineStores: "原留門市說明", lineManagerContact: "合成管理聯絡人",
    staffProgress: "provided" as const, staffNotes: "教練甲\n教練乙",
    roomProgress: "none" as const, roomNotes: "保留場地原文",
    scheduleProgress: "help" as const, scheduleNotes: "保留課表原文",
    planProgress: "pending" as const, planNotes: "0", rulesProgress: "provided" as const,
    importStudents: "yes" as const, developers: "help" as const, providerAdmin: "invited" as const,
    messagingAdmin: "pending" as const, loginAdmin: "absent" as const,
    attachments: [{ name: "synthetic-plan.csv", type: "csv" as const, content: "YSxi" }], ...payload,
  },
});

async function render() {
  const host = document.createElement("div");
  host.innerHTML = renderToStaticMarkup(await TrialApplicationsList(parseConsultationSearch({ stage: "applications", application: "synthetic-application" })));
  return host;
}
function valueFor(host: HTMLElement, label: string) {
  const labelNode = [...host.querySelectorAll("dt")].find(node => node.textContent === label);
  return labelNode?.nextElementSibling?.textContent;
}
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv("CONSULTATION_HQ_ENABLED", "true");
  mocks.find.mockResolvedValue([record()]); mocks.count.mockResolvedValue(1);
});
afterEach(() => vi.unstubAllEnvs());

describe("compact trial application details", () => {
  it("optionally exports an unhydrated synthetic SSR fixture for later layout review", async () => {
    const target = process.env.HQ_INTAKE_FIXTURE_DIR;
    if (!target) return;
    const directory = resolve(target);
    if (!directory.startsWith("/tmp/hq-intake-")) throw new Error("HQ_INTAKE_FIXTURE_DIR must be inside /tmp/hq-intake-*");
    const item = { ...record(), revision: 1 };
    trialApplicationSchema.parse(item.payload);
    mocks.find.mockResolvedValue([item]);
    const host = await render();
    expect(host.querySelector<HTMLDetailsElement>("details[name='hq-intake-record']")?.open).toBe(true);
    expect(mocks.update).not.toHaveBeenCalled(); expect(mocks.retry).not.toHaveBeenCalled();
    // React adds a form-replay bootstrap; this fixture deliberately has no runtime.
    host.querySelectorAll("script").forEach(script => script.remove());
    mkdirSync(directory, { recursive: true });
    writeFileSync(resolve(directory, "app-detail.html"), `<!doctype html>
<html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="script-src 'none'; form-action 'none'">
<title>合成 HQ 開通資料詳情</title><link rel="stylesheet" href="./fixture.css"><link rel="stylesheet" href="./intake-module.css">
<style>body{margin:0}header,main{box-sizing:border-box;width:100%;min-width:0;padding:16px}</style></head>
<body><header><h1 class="admin-page-title">體驗版開通資料詳情</h1><p class="text-sm text-earth-600">合成 SSR 靜態預覽，尚未 hydration。僅供後續排版檢視，請勿操作表單或外部連結；不代表完整業務驗收。</p></header>
<main class="w-full min-w-0">${host.innerHTML}</main></body></html>`, "utf8");
  });

  it("shows summary identity once and each setup state with its notes in one row", async () => {
    const host = await render();
    expect(host.textContent?.match(/合成聯絡人/g)).toHaveLength(1);
    expect(host.textContent?.match(/運動教室/g)).toHaveLength(1);
    expect(host.querySelector("pre")).toBeNull();
    for (const [, , label] of setupSections) {
      expect([...host.querySelectorAll("dt")].filter(node => node.textContent === label)).toHaveLength(1);
    }
    expect(valueFor(host, "教練名單")).toBe("已提供 · 教練甲\n教練乙");
    expect(valueFor(host, "教室／場地")).toBe("不需要 · 保留場地原文");
    expect(valueFor(host, "課表")).toBe("需要協助 · 保留課表原文");
    expect(valueFor(host, "收費方案")).toBe("待補充 · 0");
    expect(valueFor(host, "預約規則")).toBe("已提供 · 見附件");
    expect(valueFor(host, "現有學員匯入")).toBe("需要匯入，待提供格式");
  });

  it("retains supplied setup, LINE, integration, historical authorization and file data", async () => {
    const host = await render();
    for (const text of ["合成品牌", "合成乙館", "synthetic-branch", "合成使用者", "合成管理聯絡人", "@synthetic"]) {
      expect(host.textContent).toContain(text);
    }
    expect(valueFor(host, "既有串接")).toBe("已有串接，需確認 · 合成串接");
    expect(valueFor(host, "官方 LINE")).toBe("已有 · @synthetic · 已提供");
    expect(valueFor(host, "共用 LINE")).toBe("否 · 原留門市說明");
    expect(valueFor(host, "Provider 管理員授權")).toBe("已邀請，待確認");
    expect(valueFor(host, "Messaging API 管理員授權")).toBe("待處理");
    expect(valueFor(host, "LINE Login 管理員授權")).toBe("尚未建立");
    expect(valueFor(host, "Developers 授權（歷史填報）")).toBe("需要協助");
    for (const href of ["tel:0900000001", "mailto:synthetic%40example.com", "https://maps.app.goo.gl/synthetic", "https://lin.ee/synthetic", "https://manager.line.biz/invite/synthetic", "/api/trial-applications/synthetic-application/attachments/0"]) {
      expect([...host.querySelectorAll("a")].some(link => link.getAttribute("href") === href)).toBe(true);
    }
    expect(host.textContent?.match(/synthetic-plan.csv/g)).toHaveLength(1);
  });

  it("puts contact and status first, with only source and numbering in one closed secondary disclosure", async () => {
    const host = await render();
    const row = host.querySelector<HTMLDetailsElement>("details[name='hq-intake-record']")!;
    expect(row.open).toBe(true);
    const secondary = [...row.querySelectorAll<HTMLDetailsElement>("details")];
    expect(secondary).toHaveLength(1);
    expect(secondary[0].open).toBe(false);
    expect(secondary[0].querySelector("summary")?.textContent).toBe("來源與編號");
    expect(valueFor(secondary[0], "修訂")).toBe("0");
    expect(secondary[0].querySelector("a")?.getAttribute("href")).toBe("/hq/dashboard/trial-applications?stage=consultations&application=synthetic-application");
    const text = row.textContent!;
    expect(text.indexOf("撥打原留電話")).toBeLessThan(text.indexOf("處理狀態"));
    expect(text.indexOf("處理狀態")).toBeLessThan(text.indexOf("教練名單"));
    expect(text.indexOf("收件通知")).toBeLessThan(text.indexOf("教練名單"));
    expect(text.indexOf("教練名單")).toBeLessThan(text.indexOf("來源與編號"));
    expect(host.querySelector<HTMLSelectElement>("select[name='status']")?.value).toBe("NEEDS_INFO");
    expect(text).toContain("重試通知");
    expect(mocks.update).not.toHaveBeenCalled(); expect(mocks.retry).not.toHaveBeenCalled();
  });

  it("omits empty optional answers but preserves submitted setup progress without attachment evidence", async () => {
    mocks.find.mockResolvedValue([record({ brandName: "", otherStores: "", additionalManagers: "", lineManagerContact: "", attachments: [], rulesProgress: "provided", rulesNotes: "" })]);
    const host = await render();
    for (const label of ["品牌", "其他門市", "其他後台使用者", "LINE 管理聯絡人"]) expect(valueFor(host, label)).toBeUndefined();
    expect(valueFor(host, "預約規則")).toBe("待補充（填報已提供）");
    expect(host.textContent).not.toContain("無／未提供");
    expect(host.textContent).not.toContain("下載");
  });

  it("keeps incomplete LINE information together without repeating the help status", async () => {
    mocks.find.mockResolvedValue([record({ lineStatus: "help", lineId: "", friendUrl: "" })]);
    const host = await render();
    expect(valueFor(host, "官方 LINE")).toBe("需要協助");
    expect(host.querySelector("a[href='https://lin.ee/synthetic']")).toBeNull();
  });

  it("keeps invalid payloads visible without exposing unsupported contact actions", async () => {
    mocks.find.mockResolvedValue([{ ...record(), payload: { storeName: "合成無效資料" } }]);
    const host = await render();
    expect(host.querySelector("[role='alert']")?.textContent).toContain("開通資料格式待核對");
    expect(host.querySelector("a[href^='tel:'], a[href^='mailto:']")).toBeNull();
    expect(host.querySelector("select[name='status']")).not.toBeNull();
    expect(host.textContent).toContain("重試通知");
    expect(host.textContent).toContain("來源與編號");
    expect(mocks.update).not.toHaveBeenCalled(); expect(mocks.retry).not.toHaveBeenCalled();
  });

  it("retains no-contact protection for explicit test records and notification eligibility", async () => {
    mocks.find.mockResolvedValue([{ ...record(), storeName: "【HQ測試】合成甲館", notificationStatus: "SENT" }]);
    const host = await render();
    expect(host.textContent).toContain("請勿聯繫");
    expect(host.querySelector("a[href^='tel:'], a[href^='mailto:']")).toBeNull();
    expect(host.textContent).not.toContain("重試通知");
    expect(host.textContent).toContain("已寄送");
  });
});
