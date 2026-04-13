import { z } from "zod";

export const createReferralSchema = z.object({
  referrerId: z.string().min(1, "請選擇介紹人"),
  referredName: z.string().min(1, "請輸入被介紹人姓名").max(50),
  referredPhone: z
    .string()
    .regex(/^09\d{8}$/, "手機格式：09xxxxxxxx")
    .optional()
    .or(z.literal("")),
  note: z.string().max(500).optional(),
});

export const updateReferralStatusSchema = z.object({
  referralId: z.string().min(1),
  newStatus: z.enum(["VISITED", "CONVERTED", "CANCELLED"]),
});

export const convertReferralSchema = z.object({
  referralId: z.string().min(1),
  convertedCustomerId: z.string().min(1, "請選擇對應顧客"),
  /** 是否同時設定 sponsorId（預設 false，保留人工判斷空間） */
  setSponsor: z.boolean().default(false),
});
