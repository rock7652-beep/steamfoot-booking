"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import {
  courseManager,
  courseTransaction,
} from "@/server/services/course-access";
import { handleActionError } from "@/lib/errors";
export async function saveCourseSettings(input: unknown) {
  try {
    const { storeId } = await courseManager("business_hours.manage");
    const d = z
      .object({
        name: z.string().trim().min(1).max(100),
        address: z.string().trim().max(300).default(""),
        mapUrl: z.union([z.string().url().refine((v) => v.startsWith("https://"), "請使用 HTTPS 網址"), z.literal("")]).default(""),
        lineOfficialUrl: z.union([z.string().url().refine((v) => v.startsWith("https://"), "請使用 HTTPS 網址"), z.literal("")]).default(""),
        bankName: z.string().trim().max(80).default(""),
        bankCode: z.string().trim().max(10).default(""),
        bankAccountNumber: z.string().trim().max(40).default(""),
        bookingLeadMinutes: z.number().int().min(0).max(43200),
        cancellationLeadMinutes: z.number().int().min(0).max(43200),
      })
      .parse(input);
    await courseTransaction(storeId, async (tx) => {
      await tx.$executeRaw`UPDATE "Store" SET name = ${d.name}, "updatedAt" = NOW() WHERE id = ${storeId}`;
      await tx.$executeRaw`INSERT INTO "ShopConfig" (id, "storeId", "shopName", address, "mapUrl", "lineOfficialUrl", "updatedAt") VALUES (${`course-config:${storeId}`}, ${storeId}, ${d.name}, ${d.address || null}, ${d.mapUrl || null}, ${d.lineOfficialUrl || null}, NOW()) ON CONFLICT ("storeId") DO UPDATE SET "shopName" = EXCLUDED."shopName", address = EXCLUDED.address, "mapUrl" = EXCLUDED."mapUrl", "lineOfficialUrl" = EXCLUDED."lineOfficialUrl", "updatedAt" = NOW()`;
      await tx.$executeRaw`UPDATE "ShopConfig" SET "bankName"=${d.bankName||null}, "bankCode"=${d.bankCode||null}, "bankAccountNumber"=${d.bankAccountNumber||null} WHERE "storeId"=${storeId}`;
      const rules = {
        bookingLeadMinutes: d.bookingLeadMinutes,
        cancellationLeadMinutes: d.cancellationLeadMinutes,
      };
      await tx.courseBookingRule.upsert({
        where: { storeId },
        create: { storeId, ...rules },
        update: rules,
      });
    });
    revalidatePath("/dashboard", "layout");
    revalidatePath("/book");
    return { success: true as const };
  } catch (e) {
    return handleActionError(e);
  }
}
