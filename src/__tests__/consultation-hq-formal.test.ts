import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ find: vi.fn(), count: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { trialApplication: { findMany: m.find, count: m.count } } }));
vi.mock("@/app/hq/dashboard/trial-applications/actions", () => ({ updateApplication: vi.fn(), retryApplicationNotification: vi.fn() }));
vi.mock("next/link", () => ({ default: ({ children, ...props }: Record<string, unknown>) => createElement("a", props, children as never) }));
import { TrialApplicationsList } from "@/app/hq/dashboard/trial-applications/trial-application-list";
import { emptyTrialApplication } from "@/lib/trial-application";
import { parseConsultationSearch } from "@/app/hq/dashboard/trial-applications/consultation-view";
const record = () => ({ id: "formal-id", revision: 1, status: "RECEIVED", storeName: "合成測試店", contactEmail: "store+tag@example.com", notificationStatus: "SENT", createdAt: new Date("2026-10-08T00:00:00Z"), payload: { ...emptyTrialApplication, storeName: "合成測試店", contactName: "測試聯絡人", phone: "0912-345-678", email: "store+tag@example.com" } });
beforeEach(() => { vi.resetAllMocks(); vi.stubEnv("CONSULTATION_HQ_ENABLED", "true"); m.find.mockResolvedValue([record()]); m.count.mockResolvedValue(1); });
const render = async () => renderToStaticMarkup(await TrialApplicationsList(parseConsultationSearch({ application: "formal-id" })));
describe("formal setup remains separate in the shared HQ entry", () => {
  it("retains direct detail links, validated contact controls and an exact linked-lead back-link", async () => {
    const html = await render(); expect(html).toMatch(/<details[^>]* open=/); expect(html).toContain('href="tel:0912345678"'); expect(html).toContain('href="mailto:store%2Btag%40example.com"');
    expect(html).toContain("stage=consultations&amp;application=formal-id"); expect(html).toContain("第二階段");
    expect(m.find.mock.calls[0][0]).toMatchObject({ where: { id: "formal-id" }, take: 20 });
  });
  it("continues rendering without any consultation-table query when rollout is off", async () => {
    vi.stubEnv("CONSULTATION_HQ_ENABLED", "false"); const html = await render(); expect(html).toContain("合成測試店"); expect(html).not.toContain("查看人工關聯");
  });
  it("does not manufacture an email or phone action from invalid formal payloads", async () => {
    const item = record(); item.payload.email = "not an email"; m.find.mockResolvedValue([item]); const html = await render(); expect(html).not.toContain('href="mailto:'); expect(html).not.toContain('href="tel:');
  });
});
