import { describe, it, expect, vi } from "vitest";
import { activeAnnouncements, announcementListSchema, announcementStatus, type ImageAnnouncement } from "@/lib/image-announcements";
const image: ImageAnnouncement = { id: "00000000-0000-4000-8000-000000000001", modules: ["steamfoot"], startsOn: "", endsOn: "", enabled: true };
describe("圖片公告排程", () => {
  it("空日期持續顯示，單邊與雙邊日期皆包含當天", () => {
    expect(announcementStatus(image, "2026-10-20")).toBe("顯示中");
    expect(announcementStatus({ ...image, startsOn: "2026-10-21" }, "2026-10-20")).toBe("排程中");
    expect(announcementStatus({ ...image, startsOn: "2026-10-20" }, "2026-10-20")).toBe("顯示中");
    expect(announcementStatus({ ...image, endsOn: "2026-10-20" }, "2026-10-20")).toBe("顯示中");
    expect(announcementStatus({ ...image, endsOn: "2026-10-19" }, "2026-10-20")).toBe("已到期");
    expect(announcementStatus({ ...image, enabled: false }, "2026-10-20")).toBe("已停用");
  });
  it("依台灣午夜切換，與伺服器時區無關", () => {
    vi.useFakeTimers();
    try {
      const item = { ...image, startsOn: "2026-10-21", endsOn: "2026-10-21" };
      vi.setSystemTime(new Date("2026-10-20T15:59:59Z"));
      expect(announcementStatus(item)).toBe("排程中");
      vi.setSystemTime(new Date("2026-10-20T16:00:00Z"));
      expect(announcementStatus(item)).toBe("顯示中");
      vi.setSystemTime(new Date("2026-10-21T15:59:59Z"));
      expect(announcementStatus(item)).toBe("顯示中");
      vi.setSystemTime(new Date("2026-10-21T16:00:00Z"));
      expect(announcementStatus(item)).toBe("已到期");
    } finally { vi.useRealTimers(); }
  });
  it("只回傳指定模組有效圖片，保留管理排序", () => {
    const second = { ...image, id: "00000000-0000-4000-8000-000000000002", modules: ["sports", "music"] as ImageAnnouncement["modules"] };
    expect(activeAnnouncements([image, second], "music", "2026-10-20")).toEqual([second]);
    expect(activeAnnouncements([{ ...image, endsOn: "2026-10-19" }, second], "steamfoot", "2026-10-20")).toEqual([]);
  });
  it("拒絕超過五張、重複 ID、空模組、無效日期與反向期間", () => {
    expect(announcementListSchema.safeParse(Array(6).fill(image)).success).toBe(false);
    expect(announcementListSchema.safeParse([image, image]).success).toBe(false);
    for (const patch of [{ modules: [] }, { startsOn: "2026-02-30" }, { startsOn: "2026-11-02", endsOn: "2026-11-01" }]) expect(announcementListSchema.safeParse([{ ...image, ...patch }]).success).toBe(false);
  });
});
