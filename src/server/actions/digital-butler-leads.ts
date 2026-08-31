"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { AppError, handleActionError } from "@/lib/errors";
import { requireDigitalButlerEntitlement } from "@/lib/digital-butler-entitlement";
import { validateStoreAccess } from "@/lib/store";
import { requireWritablePermission } from "@/lib/permissions";
import type { ActionResult } from "@/types";

const updateSchema = z.object({
  leadId: z.string().min(1),
  storeId: z.string().min(1),
  status: z.enum(["NEW", "CONTACTING", "QUOTED", "WON", "LOST", "PAUSED"]),
  assignedStaffId: z.string().min(1).nullable().optional(),
  note: z.string().max(1000, "備註最多 1000 字").nullable().optional(),
  recordContact: z.boolean().optional(),
});

export async function updateDigitalButlerLeadAction(
  input: z.input<typeof updateSchema>,
): Promise<ActionResult<void>> {
  try {
    const user = await requireWritablePermission("customer.update");
    const data = updateSchema.parse(input);
    const storeId = await validateStoreAccess(user, data.storeId, "write");
    if (!storeId) throw new AppError("VALIDATION", "請先切換到特定店舖");
    await requireDigitalButlerEntitlement(storeId);
    const note = data.note?.trim() || null;

    await prisma.$transaction(async (tx) => {
      const lead = await tx.digitalButlerLead.findFirst({
        where: { id: data.leadId, storeId },
        select: { id: true, status: true, assignedStaffId: true },
      });
      if (!lead) throw new AppError("NOT_FOUND", "名單不存在");

      if (data.assignedStaffId) {
        const staff = await tx.staff.findFirst({
          where: { id: data.assignedStaffId, storeId, status: "ACTIVE" },
          select: { id: true },
        });
        if (!staff) throw new AppError("VALIDATION", "負責人不屬於目前店舖");
      }

      const contactedAt = data.recordContact ? new Date() : undefined;
      const updated = await tx.digitalButlerLead.updateMany({
        where: { id: data.leadId, storeId },
        data: {
          status: data.status,
          assignedStaffId: data.assignedStaffId,
          internalNote: note,
          ...(contactedAt ? { lastContactedAt: contactedAt } : {}),
        },
      });
      if (updated.count !== 1) throw new AppError("NOT_FOUND", "名單不存在");

      if (lead.status !== data.status || lead.assignedStaffId !== data.assignedStaffId || note || contactedAt) {
        await tx.digitalButlerLeadActivity.create({
          data: {
            leadId: lead.id,
            storeId,
            createdByUserId: user.id,
            fromStatus: lead.status,
            toStatus: data.status,
            note,
            contactedAt,
          },
        });
      }
    });

    revalidatePath("/dashboard/digital-butler/leads");
    return { success: true, data: undefined };
  } catch (error) {
    return handleActionError(error);
  }
}
