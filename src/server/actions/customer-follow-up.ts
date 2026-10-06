"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { AppError, handleActionError } from "@/lib/errors";
import { assertStoreAccess } from "@/lib/manager-visibility";
import { requireWritablePermission } from "@/lib/permissions";
import { requireStoreFeature } from "@/lib/feature-gate";
import { FEATURES } from "@/lib/feature-flags";
import type { ActionResult } from "@/types";
import { CARE_REASONS } from "@/lib/customer-care-lifecycle";
import { dayRange, toLocalDateStr } from "@/lib/date-utils";
import { resolveWriteStoreId } from "@/lib/store";
import { getManagerCustomerWhere } from "@/lib/manager-visibility";

const createCustomerFollowUpSchema = z.object({
  customerId: z.string().min(1, "缺少顧客"),
  result: z.enum(["CONTACTED", "NO_ANSWER", "BOOKED", "OTHER"]),
  careReason: z.enum(CARE_REASONS).optional(),
  careYear: z.number().int().optional(),
  nextFollowUpDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  note: z
    .string()
    .max(500, "備註最多 500 字")
    .optional()
    .nullable()
    .transform((value) => {
      const trimmed = value?.trim() ?? "";
      return trimmed.length > 0 ? trimmed : null;
    }),
});

export async function createCustomerFollowUpAction(
  input: z.input<typeof createCustomerFollowUpSchema>,
): Promise<ActionResult<{ followUpId: string }>> {
  try {
    const user = await requireWritablePermission("customer.update");
    const data = createCustomerFollowUpSchema.parse(input);

    const writeStoreId = await resolveWriteStoreId(user);
    const customer = await prisma.customer.findFirst({
      where: { id: data.customerId, ...getManagerCustomerWhere(user.role, user.staffId, writeStoreId) },
      select: {
        id: true,
        storeId: true,
        mergedIntoCustomerId: true,
        user: { select: { status: true } },
      },
    });
    if (!customer) throw new AppError("NOT_FOUND", "顧客不存在");
    assertStoreAccess(user, customer.storeId);
    if (customer.mergedIntoCustomerId || customer.user?.status === "SUSPENDED") {
      throw new AppError("NOT_FOUND", "顧客不存在");
    }
    await requireStoreFeature(customer.storeId, FEATURES.CUSTOMER_CARE);

    const today = toLocalDateStr();
    const year = Number(today.slice(0, 4));
    if (data.careReason === "birthday" && data.careYear !== year)
      throw new AppError("VALIDATION", "只能記錄今年的生日祝福");
    if (data.careReason && data.careReason !== "birthday" && !data.nextFollowUpDate)
      throw new AppError("VALIDATION", "請選擇下次追蹤日期");
    if (data.nextFollowUpDate && (data.nextFollowUpDate <= today || !/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(data.nextFollowUpDate)
      || toLocalDateStr(dayRange(data.nextFollowUpDate).start) !== data.nextFollowUpDate))
      throw new AppError("VALIDATION", "下次追蹤日期須為今天之後的有效日期");

    const followUp = await prisma.customerFollowUp.create({
      data: {
        customerId: customer.id,
        storeId: customer.storeId,
        createdByUserId: user.id,
        result: data.result,
        note: data.note,
        careReason: data.careReason ?? null,
        careYear: data.careReason === "birthday" ? year : null,
        nextFollowUpDate: data.careReason === "birthday" || !data.nextFollowUpDate ? null : new Date(`${data.nextFollowUpDate}T00:00:00.000Z`),
      },
      select: { id: true },
    });

    revalidatePath("/dashboard/growth");
    revalidatePath("/dashboard/customers");
    revalidatePath(`/dashboard/customers/${customer.id}`);
    return { success: true, data: { followUpId: followUp.id } };
  } catch (e) {
    return handleActionError(e);
  }
}
