"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { AppError, handleActionError } from "@/lib/errors";
import { requireAdminSession } from "@/lib/session";
import { assertValidStoreParentAssignment } from "@/lib/store-organization";
import type { ActionResult } from "@/types";

export interface StoreOrganizationRow {
  id: string;
  name: string;
  slug: string;
  parentStoreId: string | null;
  isDemo: boolean;
  operatingStatus: string;
  createdAt: Date;
}

export async function listStoreOrganizationAction(): Promise<
  ActionResult<StoreOrganizationRow[]>
> {
  await requireAdminSession();

  const stores = await prisma.store.findMany({
    select: {
      id: true,
      name: true,
      slug: true,
      parentStoreId: true,
      isDemo: true,
      operatingStatus: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  return { success: true, data: stores };
}

export async function updateStoreParentAction(input: {
  storeId: string;
  parentStoreId?: string | null;
}): Promise<ActionResult<{ storeId: string; parentStoreId: string | null }>> {
  try {
    const admin = await requireAdminSession();
    const storeId = input.storeId?.trim();
    const parentStoreId = normalizeParentStoreId(input.parentStoreId);

    if (!storeId) {
      throw new AppError("VALIDATION", "請選擇要調整的店舖");
    }

    const [store, parent] = await Promise.all([
      prisma.store.findUnique({
        where: { id: storeId },
        select: { id: true, name: true, parentStoreId: true },
      }),
      parentStoreId
        ? prisma.store.findUnique({
            where: { id: parentStoreId },
            select: { id: true, name: true },
          })
        : Promise.resolve(null),
    ]);

    if (!store) {
      throw new AppError("NOT_FOUND", "店舖不存在");
    }
    if (parentStoreId && !parent) {
      throw new AppError("NOT_FOUND", "上層店舖不存在");
    }
    if (store.parentStoreId === parentStoreId) {
      return { success: true, data: { storeId, parentStoreId } };
    }

    await assertValidStoreParentAssignment(storeId, parentStoreId);

    await prisma.$transaction(async (tx) => {
      await tx.store.update({
        where: { id: storeId },
        data: { parentStoreId },
      });

      await tx.auditLog.create({
        data: {
          actorUserId: admin.id,
          targetType: "Store",
          targetId: storeId,
          action: "UPDATE_ORGANIZATION_PARENT",
          beforeJson: {
            parentStoreId: store.parentStoreId,
          } satisfies Prisma.InputJsonValue,
          afterJson: {
            parentStoreId,
            parentStoreName: parent?.name ?? null,
          } satisfies Prisma.InputJsonValue,
        },
      });
    });

    revalidatePath("/hq/dashboard/stores");
    revalidatePath("/hq/dashboard/stores/organization");
    revalidatePath(`/hq/dashboard/stores/${storeId}`);

    return { success: true, data: { storeId, parentStoreId } };
  } catch (e) {
    return handleActionError(e);
  }
}

function normalizeParentStoreId(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed || trimmed === "__none__") return null;
  return trimmed;
}
