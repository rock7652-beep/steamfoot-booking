import { z } from "zod";
import { toLocalDateStr } from "@/lib/date-utils";

const date = z.string().refine(value => !value || (/^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value), "日期格式有誤");
export const announcementSchema = z.object({
  id: z.string().uuid(),
  startsOn: date,
  endsOn: date,
  enabled: z.boolean(),
}).refine(item => !item.startsOn || !item.endsOn || item.startsOn <= item.endsOn, "下架日期不可早於上架日期");
export const announcementListSchema = z.array(announcementSchema).max(5, "最多 5 張圖片").refine(items => new Set(items.map(item => item.id)).size === items.length, "圖片不可重複");
export type ImageAnnouncement = z.infer<typeof announcementSchema>;
export type AnnouncementSnapshot = { revision: number; items: ImageAnnouncement[] };
export function announcementStatus(item: ImageAnnouncement, today = toLocalDateStr()) {
  if (!item.enabled) return "已停用";
  if (item.endsOn && item.endsOn < today) return "已到期";
  if (item.startsOn && item.startsOn > today) return "排程中";
  return "顯示中";
}
export function activeAnnouncements(items: ImageAnnouncement[], today = toLocalDateStr()) {
  return items.filter(item => announcementStatus(item, today) === "顯示中");
}
export function announcementImageUrl(storeSlug: string, id: string, preview = false) {
  return `/api/image-announcements/${id}?store=${encodeURIComponent(storeSlug)}${preview ? "&preview=1" : ""}`;
}
