import { beforeEach, describe, expect, it, vi } from "vitest";
const store = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db", () => ({ prisma: { store: { findUnique: store } } }));
vi.mock("@/lib/base-url", () => ({ deriveBaseUrl: () => "https://isolated.example.test" }));
import { adaptCourseButlerLinks } from "@/server/services/course-digital-butler-links";
import { ZHUBEI_EXPERIENCE_BOOKING_URL } from "@/lib/booking-links";
const result = { handled: true, outcome: "DIRECT_BOOKING", messages: [{ type: "text" as const, text: `想體驗蒸足嗎？\n${ZHUBEI_EXPERIENCE_BOOKING_URL}`, urlButton: { label: "立即預約體驗", url: ZHUBEI_EXPERIENCE_BOOKING_URL } }] };
beforeEach(() => { vi.clearAllMocks(); });
describe("course digital butler destinations", () => {
  it("routes course shortcuts to the same store and deployment without changing outcome", async () => {
    store.mockResolvedValue({ industryModule: "COURSE", slug: "course-test" });
    expect(await adaptCourseButlerLinks("course-id", result)).toMatchObject({ outcome: "DIRECT_BOOKING", messages: [{ text: "想預約課程嗎？\nhttps://isolated.example.test/s/course-test/book", urlButton: { label: "預約課程", url: "https://isolated.example.test/s/course-test/book" } }] });
    expect(store).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "course-id" } }));
  });
  it("leaves Steamfoot and SPA messages unchanged", async () => {
    for (const industryModule of ["STEAMFOOT", "SPA"]) { store.mockResolvedValue({ industryModule }); expect(await adaptCourseButlerLinks("other", result)).toBe(result); }
  });
  it("does not query a store or mutate ordinary messages and duplicate events", async () => {
    const plain = { ...result, outcome: "DUPLICATE", messages: [] };
    expect(await adaptCourseButlerLinks("a", plain)).toBe(plain);
    expect(store).not.toHaveBeenCalled();
  });
});
