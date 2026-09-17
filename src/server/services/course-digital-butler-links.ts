import { prisma } from "@/lib/db";
import { deriveBaseUrl } from "@/lib/base-url";
import { ZHUBEI_EXPERIENCE_BOOKING_URL } from "@/lib/booking-links";
import type { DigitalButlerRuntimeResult } from "./digital-butler-runtime";

/** Adapt only the mature runtime's hard-coded booking shortcuts; preserve non-course output. */
export async function adaptCourseButlerLinks(storeId: string, result: DigitalButlerRuntimeResult): Promise<DigitalButlerRuntimeResult> {
  if (!result.messages.some(message => message.type === "text" && (message.urlButton?.url === ZHUBEI_EXPERIENCE_BOOKING_URL || message.text.includes(ZHUBEI_EXPERIENCE_BOOKING_URL)))) return result;
  const store = await prisma.store.findUnique({ where: { id: storeId }, select: { industryModule: true, slug: true } });
  if (store?.industryModule !== "COURSE") return result;
  const url = new URL(`/s/${encodeURIComponent(store.slug)}/book`, deriveBaseUrl()).toString();
  return { ...result, messages: result.messages.map(message => {
    if (message.type !== "text" || (message.urlButton?.url !== ZHUBEI_EXPERIENCE_BOOKING_URL && !message.text.includes(ZHUBEI_EXPERIENCE_BOOKING_URL))) return message;
    return { ...message, text: message.text.replaceAll(ZHUBEI_EXPERIENCE_BOOKING_URL, url).replaceAll("想體驗蒸足嗎？", "想預約課程嗎？").replaceAll("體驗日期", "上課日期").replaceAll("體驗時間", "上課時間").replaceAll("預約體驗", "預約課程"), ...(message.urlButton?.url === ZHUBEI_EXPERIENCE_BOOKING_URL ? { urlButton: { label: "預約課程", url } } : {}) };
  }) };
}
