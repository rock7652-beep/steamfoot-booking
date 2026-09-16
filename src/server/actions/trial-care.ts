"use server";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireWritablePermission } from "@/lib/permissions";
import { resolveWriteStoreId } from "@/lib/store";
import { requireStoreFeature } from "@/lib/feature-gate";
import { FEATURES } from "@/lib/feature-flags";
import { AppError, handleActionError } from "@/lib/errors";
import { trialCareRulesSchema } from "@/lib/trial-care";

const schema = z.object({ storeId: z.string().min(1), enabled: z.boolean(), rules: trialCareRulesSchema });
export async function saveTrialCareSettings(input: z.infer<typeof schema>) {
  try {
    const user = await requireWritablePermission("business_hours.manage");
    const storeId = await resolveWriteStoreId(user);
    const data = schema.parse(input);
    if (data.storeId !== storeId) throw new AppError("CONFLICT", "目前店家已切換，請重新整理後設定");
    await requireStoreFeature(storeId, FEATURES.LINE_REMINDER);
    await prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`trial-care:${storeId}`}, 0))`;
      const previous = await tx.trialCareSetting.findUnique({ where: { storeId } });
      const activatedAt = data.enabled && !previous?.enabled ? new Date() : previous?.activatedAt ?? null;
      await tx.trialCareSetting.upsert({
        where: { storeId },
        create: { storeId, enabled: data.enabled, rules: data.rules, activatedAt },
        update: { enabled: data.enabled, rules: data.rules, activatedAt },
      });
    });
    revalidatePath("/dashboard/reminders");
    return { success: true as const };
  } catch (e) { return handleActionError(e); }
}

// Staff can stop, but cannot override a customer's opt-out by resuming.
export async function stopCustomerTrialCare(customerId: string) {
  try {
    const user = await requireWritablePermission("customer.update");
    const storeId = await resolveWriteStoreId(user);
    const customer = await prisma.customer.findFirst({ where: { id: z.string().min(1).parse(customerId), storeId }, select: { id: true } });
    if (!customer) throw new AppError("NOT_FOUND", "找不到本店顧客");
    await prisma.trialCarePreference.upsert({
      where: { storeId_customerId: { storeId, customerId } },
      create: { storeId, customerId, token: randomBytes(24).toString("hex"), stoppedAt: new Date(), lastEventAt: new Date() },
      update: { stoppedAt: new Date(), lastEventAt: new Date() },
    });
    revalidatePath("/dashboard/reminders");
    return { success: true as const };
  } catch (e) { return handleActionError(e); }
}
