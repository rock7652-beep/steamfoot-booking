"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { revalidateShopConfig } from "@/lib/revalidation";
import { requirePermission } from "@/lib/permissions";
import { requireAdminSession } from "@/lib/session";

export type RenameStoreFormState = {
  success: string | null;
  error: string | null;
};

/** Display name only: the store ID, slug, subscriptions and customer history stay attached. */
export async function renameStoreAction(
  _previousState: RenameStoreFormState,
  formData: FormData,
): Promise<RenameStoreFormState> {
  await requireAdminSession();
  await requirePermission("staff.manage");

  const storeId = formData.get("storeId");
  const rawName = formData.get("name");
  if (typeof storeId !== "string" || !storeId || typeof rawName !== "string") {
    return { success: null, error: "店舖或店名資料不正確" };
  }
  const name = rawName.trim();
  if (!name || name.length > 80 || /[\u0000-\u001f\u007f]/.test(name)) {
    return { success: null, error: "店名請輸入 1～80 個字，且不可包含控制字元" };
  }

  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: { slug: true },
  });
  if (!store) return { success: null, error: "找不到店舖" };

  try {
    await prisma.$transaction([
      prisma.store.update({ where: { id: storeId }, data: { name } }),
      prisma.shopConfig.upsert({
        where: { storeId },
        create: { storeId, shopName: name },
        update: { shopName: name },
      }),
    ]);
  } catch {
    return { success: null, error: "店名更新失敗，請稍後重試" };
  }

  revalidateShopConfig();
  revalidatePath("/hq/dashboard/stores");
  revalidatePath(`/hq/dashboard/stores/${storeId}`);
  revalidatePath(`/hq/dashboard/stores/${storeId}/features`);
  revalidatePath(`/s/${store.slug}`);
  revalidatePath(`/s/${store.slug}/book`);
  revalidatePath(`/s/${store.slug}/admin/dashboard`);
  return { success: "店名已更新", error: null };
}
