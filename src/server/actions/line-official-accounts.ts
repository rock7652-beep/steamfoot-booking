"use server";

import { prisma } from "@/lib/db";
import { AppError, handleActionError } from "@/lib/errors";
import { getLineBotInfo } from "@/lib/line";
import { getLineConfigForStore } from "@/lib/line-config";
import { requirePermission } from "@/lib/permissions";
import type { ActionResult } from "@/types";

const STORE_SLUGS = ["zhubei", "hsinchu", "taichung"] as const;
type StoreSlug = (typeof STORE_SLUGS)[number];

export type LineOfficialAccountStatus = {
  storeSlug: StoreSlug;
  storeName: string;
  status: "NORMAL" | "NEEDS_ATTENTION" | "NOT_CONFIGURED";
};

async function requireHeadquartersLineAccess() {
  const user = await requirePermission("business_hours.manage");
  if (user.role !== "OWNER" && user.role !== "ADMIN") {
    throw new AppError("FORBIDDEN", "僅限 OWNER 或 ADMIN 可以執行此檢查");
  }
}

async function collectStatuses(repair: boolean): Promise<LineOfficialAccountStatus[]> {
  const stores = await prisma.store.findMany({
    where: { slug: { in: [...STORE_SLUGS] } },
    select: { id: true, slug: true, name: true, lineDestination: true },
  });
  const bySlug = new Map(stores.map((store) => [store.slug, store]));

  return Promise.all(
    STORE_SLUGS.map(async (storeSlug) => {
      const store = bySlug.get(storeSlug);
      const config = getLineConfigForStore(storeSlug);
      const storeName = store?.name ?? ({ zhubei: "竹北", hsinchu: "新竹", taichung: "台中" }[storeSlug]);

      if (!store || !config.accessToken || !config.channelSecret || !config.expectedBasicId) {
        return { storeSlug, storeName, status: "NOT_CONFIGURED" as const };
      }

      const result = await getLineBotInfo(storeSlug);
      if (!result.ok || result.data.basicId !== config.expectedBasicId) {
        return { storeSlug, storeName, status: "NEEDS_ATTENTION" as const };
      }

      if (result.data.userId !== store.lineDestination) {
        if (!repair) {
          return { storeSlug, storeName, status: "NEEDS_ATTENTION" as const };
        }
        await prisma.store.update({
          where: { id: store.id },
          data: { lineDestination: result.data.userId },
        });
      }

      return { storeSlug, storeName, status: "NORMAL" as const };
    }),
  );
}

export async function getAllLineOfficialAccountStatuses(): Promise<LineOfficialAccountStatus[]> {
  await requireHeadquartersLineAccess();
  return collectStatuses(false);
}

export async function checkAllLineOfficialAccounts(): Promise<ActionResult<LineOfficialAccountStatus[]>> {
  try {
    await requireHeadquartersLineAccess();
    return { success: true, data: await collectStatuses(true) };
  } catch (error) {
    return handleActionError(error);
  }
}
