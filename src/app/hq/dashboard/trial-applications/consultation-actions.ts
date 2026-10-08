"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireAdminSession } from "@/lib/session";
import { requirePermission } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { consultationLeadStatusSchema } from "@/lib/consultation-lead";
import { trialApplicationDatabaseAllowed } from "@/server/services/trial-application-access";
import { consultationDatabaseAllowed } from "@/server/services/consultation-lead-access";

const base = z.object({ id: z.string().uuid(), revision: z.coerce.number().int().min(1).max(2147483646) });
const inputSchema = z.discriminatedUnion("operation", [
  base.extend({ operation: z.literal("status"), status: consultationLeadStatusSchema }),
  base.extend({ operation: z.literal("note"), note: z.string().trim().min(1).max(2000) }),
  base.extend({ operation: z.literal("link"), applicationId: z.string().uuid(), verified: z.literal("yes") }),
]);
export type ConsultationMutationResult = {
  success: boolean;
  message: string;
  revision?: number;
  conflict?: { revision: number; status: string; applicationId: string | null };
};
class LeadConflict extends Error {
  constructor(readonly current: NonNullable<ConsultationMutationResult["conflict"]>) { super("revision conflict"); }
}
class MissingApplication extends Error {}

export async function updateConsultationLead(form: FormData): Promise<ConsultationMutationResult> {
  const user = await requireAdminSession();
  if (user.role !== "ADMIN") throw new Error("此功能僅限總部使用");
  await requirePermission("staff.manage");
  if (!trialApplicationDatabaseAllowed()) throw new Error("預覽收件資料庫尚未設定");
  if (process.env.CONSULTATION_HQ_ENABLED !== "true") throw new Error("HQ 需求諮詢尚未啟用");
  if (!consultationDatabaseAllowed()) throw new Error("諮詢測試資料庫尚未確認隔離");
  const parsed = inputSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { success: false, message: "請確認資料格式、修訂編號與人工核對勾選。備註限 1–2000 字。" };
  const input = parsed.data;
  try {
    const revision = await prisma.$transaction(async (tx) => {
      const previous = await tx.consultationLead.findUniqueOrThrow({ where: { id: input.id } });
      const current = { revision: previous.revision, status: previous.status, applicationId: previous.trialApplicationId };
      if (previous.revision !== input.revision) throw new LeadConflict(current);
      if (input.operation === "link") {
        // An exact, existing application plus explicit human verification is mandatory.
        // Never match records by name, email, phone or LINE display name.
        const application = await tx.trialApplication.findUnique({ where: { id: input.applicationId }, select: { id: true } });
        if (!application) throw new MissingApplication();
      }
      const changed = await tx.consultationLead.updateMany({
        where: { id: input.id, revision: input.revision },
        data: {
          revision: { increment: 1 },
          ...(input.operation === "status" ? { status: input.status } : {}),
          ...(input.operation === "link" ? { trialApplicationId: input.applicationId, trialLinkedAt: new Date(), trialLinkedBy: user.id } : {}),
        },
      });
      if (changed.count !== 1) {
        const latest = await tx.consultationLead.findUniqueOrThrow({ where: { id: input.id } });
        throw new LeadConflict({ revision: latest.revision, status: latest.status, applicationId: latest.trialApplicationId });
      }
      const activity = await tx.consultationLeadActivity.create({ data: {
        leadId: input.id,
        actorId: user.id,
        type: input.operation === "note" ? "NOTE" : input.operation === "link" ? "LINK" : "STATUS",
        note: input.operation === "note" ? input.note : input.operation === "link"
          ? `${previous.trialApplicationId ?? "未關聯"} → ${input.applicationId}`
          : `${previous.status} → ${input.status}`,
      } });
      // Contact notes belong only in their append-only activity record, never in audit JSON.
      await tx.auditLog.create({ data: {
        actorUserId: user.id, targetType: "ConsultationLead", targetId: input.id,
        action: "UPDATE", module: "consultation-leads",
        beforeJson: { revision: previous.revision, ...(input.operation === "status" ? { status: previous.status } : {}), ...(input.operation === "link" ? { trialApplicationId: previous.trialApplicationId } : {}) },
        afterJson: { revision: input.revision + 1, activityId: activity.id, ...(input.operation === "status" ? { status: input.status } : {}), ...(input.operation === "link" ? { trialApplicationId: input.applicationId } : {}) },
      } });
      return input.revision + 1;
    });
    revalidatePath("/hq/dashboard/trial-applications");
    return { success: true, message: "已儲存 ✓", revision };
  } catch (error) {
    if (error instanceof LeadConflict) return { success: false, message: "資料已有更新，這次未儲存。輸入已保留；請核對最新狀態與關聯後再試。", conflict: error.current };
    if (error instanceof MissingApplication) return { success: false, message: "找不到這個開通資料編號。請先到「體驗版開通資料」核對完整編號。" };
    return { success: false, message: "尚未儲存，請稍後再試。輸入已保留。" };
  }
}
