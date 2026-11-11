import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({ context: vi.fn(), slug: vi.fn(), presentation: vi.fn(), liff: vi.fn() }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("not found"); } }));
vi.mock("@/lib/store-resolver", () => ({ resolveStoreSlugForLiff: m.slug, resolveStorePresentation: m.presentation, resolveCentralMemberLiffId: m.liff }));
vi.mock("@/server/queries/liff-public-context", () => ({ readLiffPublicContext: m.context }));
vi.mock("@/app/(liff)/liff/liff-shell", () => ({ LiffShell: () => null }));
vi.mock("@/app/(liff)/liff/member-booking/member-booking-form", () => ({ MemberBookingForm: () => null }));
import Page from "@/app/(liff)/liff/member-booking/page";
import { LiffShell } from "@/app/(liff)/liff/liff-shell";
import { MemberBookingForm } from "@/app/(liff)/liff/member-booking/member-booking-form";
beforeEach(() => { vi.clearAllMocks(); m.slug.mockResolvedValue("local-store"); m.presentation.mockResolvedValue({id:"store",slug:"local-store",name:"Synthetic",contactUrl:""}); m.liff.mockResolvedValue("synthetic-liff"); });
describe("direct LIFF member booking links", () => {
  it.each(["course", "beauty"])("initializes the verified %s bridge instead of reading Steam wallets", async id => {
    m.context.mockResolvedValue({industry:{id,customer:{}},healthEnabled:false});
    const view = await Page();
    expect(view.type).toBe(LiffShell);
    expect(view.props).toMatchObject({memberDataSource:id,bookingIntent:true,storeSlug:"local-store",liffId:"synthetic-liff"});
  });
  it("preserves Steam booking", async () => {
    m.context.mockResolvedValue({industry:{id:"steamfoot",customer:{}},healthEnabled:true});
    expect((await Page()).type).toBe(MemberBookingForm);
  });
  it("fails closed when module context is unavailable", async () => { m.context.mockResolvedValue(null); await expect(Page()).rejects.toThrow("not found"); });
});
