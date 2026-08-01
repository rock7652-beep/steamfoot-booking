"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { resolveWriteStoreId } from "@/lib/store";
import { applyZhubeiMessengerV13Publish, classifyZhubeiV13PublishFailure, previewZhubeiMessengerV13Publish, ZHUBEI_V13_CONFIRMATION } from "@/server/services/zhubei-messenger-v13-publish";

async function ownerZhubeiContext() {
  const user = await requirePermission("plans.edit");
  if (user.role !== "OWNER") throw new Error("ZHUBEI_MESSENGER_V13_OWNER_ONLY");
  const storeId = await resolveWriteStoreId(user);
  const store = await prisma.store.findUnique({ where: { id: storeId }, select: { id: true, slug: true } });
  if (!store || store.slug !== "zhubei") throw new Error("ZHUBEI_MESSENGER_V13_ZHUBEI_ONLY");
  return { storeId: store.id, actorUserId: user.id };
}

export async function previewZhubeiMessengerV13PublishAction() {
  try {
    const { storeId } = await ownerZhubeiContext();
    const { preview } = await previewZhubeiMessengerV13Publish(storeId);
    return { success: true as const, preview };
  } catch {
    return { success: false as const, error: "目前無法安全預覽 Messenger Flow v13 發布。" };
  }
}

export async function applyZhubeiMessengerV13PublishAction(confirmation: string) {
  try {
    if (confirmation.trim() !== ZHUBEI_V13_CONFIRMATION) return { success: false as const, error: "確認字串不正確。" };
    const { storeId, actorUserId } = await ownerZhubeiContext();
    const result = await applyZhubeiMessengerV13Publish({ storeId, actorUserId });
    revalidatePath("/dashboard/settings/messenger-audit");
    return { success: true as const, result: result.result, version: { id: result.version.id, version: result.version.version }, preview: result.preview };
  } catch (error) {
    const code = classifyZhubeiV13PublishFailure(error);
    // The code is deliberately finite and contains no database, flow, or customer data.
    console.error("zhubei_messenger_v13_publish_apply_failed", { code });
    return { success: false as const, error: "目前無法安全發布 Messenger Flow v13。", code };
  }
}
