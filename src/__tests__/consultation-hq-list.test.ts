import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ find: vi.fn(), count: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { consultationLead: { findMany: m.find, count: m.count } } }));
vi.mock("next/link", () => ({ default: ({ children, ...props }: Record<string, unknown>) => createElement("a", props, children as never) }));
vi.mock("@/app/hq/dashboard/trial-applications/consultation-forms", () => ({
  ConsultationStatusForm: () => createElement("div", {}, "status-form"), ConsultationNoteForm: () => createElement("div", {}, "note-form"), ConsultationLinkForm: () => createElement("div", {}, "link-form"), CopyLineId: ({ value }: { value: string }) => createElement("button", {}, `複製 LINE ID ${value}`),
}));
import { ConsultationLeadList } from "@/app/hq/dashboard/trial-applications/consultation-list";
import { parseConsultationSearch } from "@/app/hq/dashboard/trial-applications/consultation-view";
const lead = () => ({ id: "lead-id", requestId: "request-id", revision: 3, storeName: "很長的原始店家名稱與分店", industry: "美容／服務", contactName: "原留聯絡人", phone: "0912-345-678", lineId: "@actual-id", websiteUrl: "https://example.com", facebookUrl: null, instagramUrl: "javascript:alert(1)", status: "NEW", sheetStatus: "UNKNOWN", createdAt: new Date("2026-10-07T18:30:00Z"), sheetConfirmedAt: null, originalPayload: { industry: "美容／服務", phone: "0912-345-678", contactName: "原留聯絡人", lineId: "@actual-id", contactWay: "希望電話聯繫", needs: ["原始需求A", "原始需求B"], otherNeed: "原始補充\n保留換行" }, activities: [{ id: "activity", actorId: "admin-123", type: "NOTE", note: "既有聯繫紀錄", createdAt: new Date("2026-10-08T00:00:00Z") }], _count: { activities: 21 }, trialApplicationId: "formal-id", trialLinkedAt: new Date("2026-10-08T00:00:00Z"), trialLinkedBy: "admin-123", trialApplication: { id: "formal-id", storeName: "已核對店家", status: "RECEIVED" } });
const render = async (params: Record<string, string> = {}) => renderToStaticMarkup(await ConsultationLeadList(parseConsultationSearch(params)));
beforeEach(() => { vi.resetAllMocks(); m.find.mockResolvedValue([lead()]); m.count.mockResolvedValue(21); });
describe("consultation HQ lead details", () => {
  it("renders original needs, exact contact and separate HQ/Sheet statuses", async () => {
    const html = await render();
    for (const text of ["原始需求A", "原始補充", "原留聯絡人", "HQ 已收件", "Sheet 結果不明，請先查核，勿重送", "admin-123", "既有聯繫紀錄", "2026/10/8", "修訂 3"]) expect(html).toContain(text);
    expect(html).toContain('href="tel:0912345678"'); expect(html).toContain("複製 LINE ID @actual-id"); expect(html).not.toContain("line.me/"); expect(html).not.toContain('href="javascript:');
    expect(html).toContain("stage=applications&amp;application=formal-id"); expect(html).toContain("下一頁"); expect(html).toContain("查看全部紀錄");
  });
  it("suppresses all contact controls for no-contact fitness leads, even if old bad data retains contacts", async () => {
    const item = lead(); item.originalPayload = { ...item.originalPayload, ...{ formVersion: "fitness-v2", source: "fitness-intake", contactWay: "目前暫不考慮" } }; m.find.mockResolvedValue([item]);
    const html = await render(); expect(html).toContain("請勿主動聯繫"); expect(html).not.toContain('href="tel:'); expect(html).not.toContain("複製 LINE ID"); expect(html).not.toContain("原留聯絡人");
  });
  it("uses only supplied LINE links", async () => {
    m.find.mockResolvedValue([{ ...lead(), lineId: "https://lin.ee/original" }]); const html = await render(); expect(html).toContain('href="https://lin.ee/original"'); expect(html).not.toContain("複製 LINE ID");
  });
  it("bounds queries and uses parameterized contains without concatenated SQL", async () => {
    await render({ q: "' OR 1=1 --", page: "2", status: "NEW" });
    expect(m.find).toHaveBeenCalledWith(expect.objectContaining({ skip: 20, take: 20, where: { status: "NEW", OR: expect.arrayContaining([{ storeName: { contains: "' OR 1=1 --", mode: "insensitive" } }]) } }));
  });
  it("paginates append-only history and supports formal application back-links", async () => {
    await render({ stage: "consultations", application: "formal-id", lead: "lead-id", activityPage: "2" });
    const query = m.find.mock.calls[0][0]; expect(query.where).toMatchObject({ id: "lead-id", trialApplicationId: "formal-id" }); expect(query.include.activities).toMatchObject({ skip: 20, take: 20 });
  });
  it("does not describe empty HQ data as an empty historical intake", async () => {
    m.find.mockResolvedValue([]); m.count.mockResolvedValue(0); expect(await render()).toContain("歷史資料請查閱上方原有 Sheet");
  });
});
