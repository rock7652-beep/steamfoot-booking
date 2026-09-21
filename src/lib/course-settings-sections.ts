import { z } from "zod";

export const COURSE_SETTINGS_SECTIONS = [
  { id: "store", label: "店家資料" },
  { id: "booking", label: "營業與預約" },
  { id: "payment", label: "收款與體驗" },
  { id: "notifications", label: "通知與顧客經營" },
  { id: "subscription", label: "系統方案與用量" },
] as const;
export type CourseSettingsSection = typeof COURSE_SETTINGS_SECTIONS[number]["id"];
export function courseSettingsSection(value: string | null | undefined): CourseSettingsSection {
  return COURSE_SETTINGS_SECTIONS.find(section => section.id === value)?.id ?? "store";
}
const httpsUrl = z.union([z.string().url().refine(value => value.startsWith("https://"), "請使用 HTTPS 網址"), z.literal("")]);
export const courseSettingsSectionSchema = z.discriminatedUnion("section", [
  z.object({ section: z.literal("store"), name: z.string().trim().min(1).max(100), address: z.string().trim().max(300), mapUrl: httpsUrl, lineOfficialUrl: httpsUrl }),
  z.object({ section: z.literal("booking"), bookingLeadMinutes: z.number().int().min(0).max(43200), cancellationLeadMinutes: z.number().int().min(0).max(43200) }),
  z.object({ section: z.literal("payment"), bankName: z.string().trim().max(100), bankCode: z.string().trim().max(20), bankAccountNumber: z.string().trim().max(50) }),
]);
export type CourseSettingsSectionInput = z.infer<typeof courseSettingsSectionSchema>;
