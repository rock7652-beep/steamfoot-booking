import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveLiffId: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  notFound: () => { throw new Error("not found"); },
}));
vi.mock("@/lib/store-resolver", () => ({
  resolveStoreSlugForLiff: async () => "entry-store",
  resolveStorePresentation: async (slug: string) => ({ id: slug, slug }),
  resolveCentralMemberLiffId: mocks.resolveLiffId,
}));
vi.mock("@/lib/industry-module-server", () => ({
  getStoreIndustryModule: async () => "steamfoot",
}));
vi.mock("@/app/(liff)/liff/bookings/bookings-list", () => ({
  BookingsList: () => null,
}));

import LiffMyBookingsPage from "@/app/(liff)/liff/bookings/page";

describe("LINE bookings reentry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveLiffId.mockImplementation(async (slug: string) =>
      slug === "entry-store" || slug === "original-store" ? "shared-app" : "other-app",
    );
  });

  it("returns to the original store when both stores use the same LIFF app", async () => {
    const page = await LiffMyBookingsPage({
      searchParams: Promise.resolve({ bookingStore: "original-store" }),
    });
    expect(page.props.returnStoreSlug).toBe("original-store");
  });

  it.each(["different-app", "//other.example", ["entry-store", "original-store"]])(
    "rejects an invalid or mismatched return store %j",
    async (bookingStore) => {
      await expect(LiffMyBookingsPage({
        searchParams: Promise.resolve({ bookingStore }),
      })).rejects.toThrow("not found");
    },
  );

  it("renders directly when the endpoint already belongs to the original store", async () => {
    const page = await LiffMyBookingsPage({
      searchParams: Promise.resolve({ bookingStore: "entry-store" }),
    });
    expect(page.props.storeSlug).toBe("entry-store");
    expect(page.props.returnStoreSlug).toBeUndefined();
  });
});
