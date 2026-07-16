export type StoreOperatingStatus = "TRIAL" | "ACTIVE" | "PAUSED" | "INACTIVE";

/** Store states that participate in normal staff access and background operations. */
export const ACCESSIBLE_STORE_OPERATING_STATUSES: StoreOperatingStatus[] = [
  "ACTIVE",
  "TRIAL",
];

export const STORE_OPERATING_STATUS_LABELS: Record<StoreOperatingStatus, string> = {
  TRIAL: "試營運",
  ACTIVE: "營運中",
  PAUSED: "暫停營業",
  INACTIVE: "已停用",
};

export const STORE_PAUSED_MESSAGE = "店舖目前暫停營業，請聯繫店家或稍後再試。";
export const STORE_INACTIVE_MESSAGE = "店舖目前已停用，請聯繫總部或店家確認後續服務。";
export const STORE_NOT_BOOKABLE_MESSAGE = "店舖目前未開放新預約，請聯繫店家或稍後再試。";

export function isStoreBookableStatus(status: StoreOperatingStatus): boolean {
  return status === "TRIAL" || status === "ACTIVE";
}

export function isStoreCustomerPortalBlocked(status: StoreOperatingStatus): boolean {
  return status === "INACTIVE";
}

export function getStoreUnavailableMessage(status: StoreOperatingStatus): string {
  if (status === "PAUSED") return STORE_PAUSED_MESSAGE;
  if (status === "INACTIVE") return STORE_INACTIVE_MESSAGE;
  return STORE_NOT_BOOKABLE_MESSAGE;
}

export async function getStoreOperatingStatus(storeId: string): Promise<StoreOperatingStatus> {
  const { prisma } = await import("@/lib/db");
  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: { operatingStatus: true },
  });
  return (store?.operatingStatus ?? "ACTIVE") as StoreOperatingStatus;
}

export async function isStoreBookable(storeId: string): Promise<boolean> {
  return isStoreBookableStatus(await getStoreOperatingStatus(storeId));
}
