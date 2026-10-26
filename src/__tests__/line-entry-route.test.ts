import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  resolve: vi.fn(),
  entry: vi.fn(),
  createMany: vi.fn(),
  customerFindFirst: vi.fn(),
  customerFindUnique: vi.fn(),
  customerUpdate: vi.fn(),
}));

vi.mock("@/server/queries/line-referral-entry", () => ({
  resolveLineReferralEntry: mocks.resolve,
}));
vi.mock("@/server/services/booking-line-entry", () => ({resolveBookingLineEntry: mocks.entry}));
vi.mock("@/lib/db", () => ({
  prisma: {
    referralEvent: { createMany: mocks.createMany },
    customer: {
      findFirst: mocks.customerFindFirst,
      findUnique: mocks.customerFindUnique,
      update: mocks.customerUpdate,
    },
  },
}));

import { GET } from "@/app/line-entry/route";
import { bindReferralToCustomer } from "@/server/services/referral-binding";

describe("GET /line-entry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.entry.mockImplementation((slug: string) => slug === "taichung" ? {storeId: null, url: "https://liff.line.me/2010761154-mupiLvI6"} : null);
    mocks.resolve.mockResolvedValue({
      status: "READY",
      storeId: "store-t",
      referrerId: "customer-t",
      lineOfficialUrl: "https://lin.ee/taichung",
    });
    mocks.createMany.mockResolvedValue({ count: 2 });
    mocks.customerFindFirst.mockResolvedValue({
      id: "customer-t",
      storeId: "store-t",
    });
    mocks.customerFindUnique.mockResolvedValue({
      id: "new-customer",
      storeId: "store-t",
      sponsorId: null,
    });
    mocks.customerUpdate.mockResolvedValue({ id: "new-customer" });
  });

  it("pending-ref 可由後續註冊流程綁成 sponsorId", async () => {
    const response = await GET(
      new NextRequest("https://example.com/line-entry?ref=ABC234", {
        headers: { "x-store-slug": "taichung" },
      }),
    );
    const pendingCookie = response.headers
      .getSetCookie()
      .find((cookie) => cookie.startsWith("pending-ref="));
    const pendingRef = pendingCookie?.split(";", 1)[0]?.split("=", 2)[1];

    await expect(
      bindReferralToCustomer({
        customerId: "new-customer",
        storeId: "store-t",
        referrerRef: pendingRef,
        source: "oauth-line",
      }),
    ).resolves.toEqual({
      bound: true,
      reason: "ok",
      referrerCustomerId: "customer-t",
    });
    expect(mocks.customerUpdate).toHaveBeenCalledWith({
      where: { id: "new-customer" },
      data: { sponsorId: "customer-t" },
    });
  });

  it("redirect response 保存已驗證的 pending-ref 與 visitor token", async () => {
    const response = await GET(
      new NextRequest("https://example.com/line-entry?ref=ABC234", {
        headers: { "x-store-slug": "taichung" },
      }),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("location")).toBe("https://lin.ee/taichung");
    const cookies = response.headers.getSetCookie().join("\n");
    expect(cookies).toContain("pending-ref=customer-t");
    expect(cookies).toContain("referral-visitor-token=");
    expect(cookies).toContain("HttpOnly");
    expect(cookies).toContain("SameSite=lax");
    expect(cookies).toContain("Path=/");
    expect(cookies).toContain("Max-Age=2592000");
  });

  it("LIFF 店家分享會保留歸屬並進入該店公開體驗 LIFF", async () => {
    const response = await GET(
      new NextRequest(
        "https://example.com/line-entry?ref=ABC234&destination=public-trial&source=liff-store-share",
        { headers: { "x-store-slug": "taichung" } },
      ),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("location")).toBe(
      "https://liff.line.me/2010761154-mupiLvI6",
    );
    expect(response.headers.getSetCookie().join("\n")).toContain(
      "pending-ref=customer-t",
    );
    expect(mocks.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          type: "LINK_CLICK",
          source: "liff-store-share",
          storeId: "store-t",
        }),
      ]),
    });
  });

  it("ReferralEvent 寫入失敗仍 redirect 並保存歸屬 cookie", async () => {
    mocks.createMany.mockRejectedValue(new Error("event db unavailable"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await GET(
      new NextRequest("https://example.com/line-entry?ref=ABC234", {
        headers: { "x-store-slug": "taichung" },
      }),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("location")).toBe("https://lin.ee/taichung");
    expect(response.headers.getSetCookie().join("\n")).toContain(
      "pending-ref=customer-t",
    );
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("驗證失敗時不寫 cookie、不寫事件、不 redirect", async () => {
    mocks.resolve.mockResolvedValue({ status: "INVALID_REFERRAL" });

    const response = await GET(
      new NextRequest("https://example.com/line-entry?ref=WRONG", {
        headers: { "x-store-slug": "taichung" },
      }),
    );

    expect(response.status).toBe(400);
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.getSetCookie()).toHaveLength(0);
    expect(mocks.createMany).not.toHaveBeenCalled();
  });
});


it("課程公開體驗分享保留推薦來源、只記錄點擊並進入同店 LIFF", async () => {
  vi.clearAllMocks();
  mocks.entry.mockReturnValue({storeId: "course", url: "https://liff.line.me/902-course/public-trial?bookingStore=course-test"});
  mocks.resolve.mockResolvedValue({ status: "READY", storeId: "course", referrerId: "course-referrer", lineOfficialUrl: "", coursePath: "/s/course-test/book" });
  const response = await GET(new NextRequest("https://preview.example.test/line-entry?ref=ABC234&destination=public-trial", { headers: { "x-store-slug": "course-test" } }));
  expect(response.headers.get("location")).toBe("https://liff.line.me/902-course/public-trial?bookingStore=course-test");
  expect(response.headers.getSetCookie().join(";")).toContain("pending-ref=course-referrer");
  expect(mocks.createMany).toHaveBeenCalledWith({ data: [{ storeId: "course", referrerId: "course-referrer", type: "LINK_CLICK", source: "course-member-share" }] });
});


it.each([null, {storeId: "another-store", url: "https://liff.line.me/902-other"}])("rejects missing or mismatched trial configuration without losing users into another entry", async entry => {
  vi.clearAllMocks();
  mocks.entry.mockReturnValue(entry);
  mocks.resolve.mockResolvedValue({status:"READY",storeId:"course",referrerId:"ref",coursePath:"/s/course-test/book",lineOfficialUrl:"https://lin.ee/other"});
  const response = await GET(new NextRequest("https://example.test/line-entry?ref=ABC234&destination=public-trial", {headers:{"x-store-slug":"course-test"}}));
  expect(response.status).toBe(400);
  expect(response.headers.get("location")).toBeNull();
  expect(response.headers.getSetCookie()).toHaveLength(0);
  expect(mocks.createMany).not.toHaveBeenCalled();
});
