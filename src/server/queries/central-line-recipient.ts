import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { requireSession } from "@/lib/session";
import {
  resolveCentralLineRecipient,
  type CentralLineRecipientStatus,
} from "@/server/services/central-line-recipient";

export const CENTRAL_LINE_STATUS_LABEL: Record<CentralLineRecipientStatus, string> = {
  READY: "已對齊中央 LINE",
  NO_CENTRAL_USER: "尚未連結中央會員",
  CENTRAL_USER_CONFLICT: "中央會員指向衝突",
  CENTRAL_USER_INACTIVE: "中央會員已停用或不存在",
  NO_CENTRAL_LINE: "尚未綁定蒸管家 LINE Login",
  CENTRAL_LINE_CONFLICT: "中央 LINE Account 衝突",
  IDENTITY_LINK_CONFLICT: "跨店 LINE 身份衝突",
  LEGACY_LINE_CONFLICT: "舊分店 LINE 綁定不一致",
};

export interface CentralLineRecipientAudit {
  total: number;
  ready: number;
  blocked: number;
  statusCounts: Record<CentralLineRecipientStatus, number>;
  rows: Array<{
    customerId: string;
    customerName: string;
    storeName: string;
    status: CentralLineRecipientStatus;
    maskedRecipient: string | null;
  }>;
}

export async function getCentralLineRecipientAudit(): Promise<CentralLineRecipientAudit> {
  const user = await requireSession();
  if (user.role !== "ADMIN") {
    throw new AppError("FORBIDDEN", "此盤點僅限總部管理員使用");
  }
  const customers = await prisma.customer.findMany({
    where: { mergedIntoCustomerId: null },
    orderBy: [{ store: { name: "asc" } }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      userId: true,
      lineUserId: true,
      store: { select: { name: true } },
      user: {
        select: {
          id: true,
          status: true,
          accounts: { select: { provider: true, providerAccountId: true } },
        },
      },
      identityLinks: {
        select: {
          userId: true,
          provider: true,
          providerAccountId: true,
          lineUserId: true,
          user: {
            select: {
              id: true,
              status: true,
              accounts: { select: { provider: true, providerAccountId: true } },
            },
          },
        },
      },
    },
  });

  const statuses = Object.keys(CENTRAL_LINE_STATUS_LABEL) as CentralLineRecipientStatus[];
  const statusCounts = Object.fromEntries(statuses.map((status) => [status, 0])) as Record<CentralLineRecipientStatus, number>;
  const rows = customers.map((customer) => {
    const users = new Map<string, NonNullable<typeof customer.user>>();
    if (customer.user) users.set(customer.user.id, customer.user);
    for (const link of customer.identityLinks) users.set(link.user.id, link.user);
    const resolution = resolveCentralLineRecipient({
      customerId: customer.id,
      directUserId: customer.userId,
      legacyLineUserId: customer.lineUserId,
      identityLinks: customer.identityLinks.map((link) => ({
        userId: link.userId,
        provider: link.provider,
        providerAccountId: link.providerAccountId,
        lineUserId: link.lineUserId,
      })),
      users: [...users.values()],
    });
    statusCounts[resolution.status] += 1;
    return {
      customerId: customer.id,
      customerName: customer.name,
      storeName: customer.store.name,
      status: resolution.status,
      maskedRecipient: resolution.maskedRecipient,
    };
  });

  return {
    total: rows.length,
    ready: statusCounts.READY,
    blocked: rows.length - statusCounts.READY,
    statusCounts,
    rows: rows.filter((row) => row.status !== "READY").slice(0, 200),
  };
}
