import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export type CentralUserMergeSnapshot = {
  id: string;
  name: string;
  role: string;
  status: string;
  hasPassword: boolean;
  accounts: Array<{ id: string; provider: string; providerAccountId: string }>;
  identityLinks: Array<{ id: string; storeId: string; customerId: string; provider: string; providerAccountId: string }>;
  customer: { id: string; storeId: string; name: string; phone: string } | null;
};

export type CentralUserMergePlan = {
  sourceUserId: string;
  targetUserId: string;
  executable: boolean;
  blockers: string[];
  warnings: string[];
  moves: {
    accounts: number;
    identityLinks: number;
    directCustomer: number;
  };
};

export function buildCentralUserMergePlan(
  source: CentralUserMergeSnapshot,
  target: CentralUserMergeSnapshot,
): CentralUserMergePlan {
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (source.id === target.id) blockers.push("來源與主要會員不可相同");
  if (source.role !== "CUSTOMER" || target.role !== "CUSTOMER") {
    blockers.push("只能整合顧客帳號；總部與店員帳號不可合併");
  }
  if (source.status !== "ACTIVE") blockers.push("來源會員不是啟用狀態");
  if (target.status !== "ACTIVE") blockers.push("主要會員不是啟用狀態");

  const targetAccounts = new Map(target.accounts.map((account) => [account.provider, account]));
  for (const account of source.accounts) {
    const existing = targetAccounts.get(account.provider);
    if (existing && existing.providerAccountId !== account.providerAccountId) {
      blockers.push(`兩個會員各自綁定不同的 ${account.provider} 帳號`);
    }
  }

  const targetLinks = new Map(
    target.identityLinks.map((link) => [`${link.storeId}\u0000${link.provider}`, link]),
  );
  for (const link of source.identityLinks) {
    const existing = targetLinks.get(`${link.storeId}\u0000${link.provider}`);
    if (existing && (existing.customerId !== link.customerId || existing.providerAccountId !== link.providerAccountId)) {
      blockers.push(`分店 ${link.storeId} 的 ${link.provider} 會員連結指向不同顧客`);
    }
  }

  if (source.customer && target.customer) {
    blockers.push("兩個會員都直接連到顧客資料；請先完成店內重複顧客處理");
  }
  if (!target.hasPassword && source.hasPassword) {
    warnings.push("來源會員的密碼不會覆蓋主要會員；請確認主要會員仍有可用登入方式");
  }
  if (target.accounts.length === 0 && !target.hasPassword && source.accounts.length === 0) {
    blockers.push("整合後主要會員沒有可用登入方式");
  }

  return {
    sourceUserId: source.id,
    targetUserId: target.id,
    executable: blockers.length === 0,
    blockers: [...new Set(blockers)],
    warnings,
    moves: {
      accounts: source.accounts.filter((account) => !targetAccounts.has(account.provider)).length,
      identityLinks: source.identityLinks.filter(
        (link) => !targetLinks.has(`${link.storeId}\u0000${link.provider}`),
      ).length,
      directCustomer: source.customer && !target.customer ? 1 : 0,
    },
  };
}

const snapshotSelect = {
  id: true,
  name: true,
  role: true,
  status: true,
  passwordHash: true,
  accounts: { select: { id: true, provider: true, providerAccountId: true } },
  customerIdentityLinks: {
    select: { id: true, storeId: true, customerId: true, provider: true, providerAccountId: true },
  },
  customer: { select: { id: true, storeId: true, name: true, phone: true } },
} satisfies Prisma.UserSelect;

function toSnapshot(row: Prisma.UserGetPayload<{ select: typeof snapshotSelect }>): CentralUserMergeSnapshot {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    status: row.status,
    hasPassword: row.passwordHash !== null,
    accounts: row.accounts,
    identityLinks: row.customerIdentityLinks,
    customer: row.customer,
  };
}

async function loadPair(tx: Prisma.TransactionClient, sourceUserId: string, targetUserId: string) {
  const [source, target] = await Promise.all([
    tx.user.findUnique({ where: { id: sourceUserId }, select: snapshotSelect }),
    tx.user.findUnique({ where: { id: targetUserId }, select: snapshotSelect }),
  ]);
  if (!source || !target) throw new Error("找不到來源或主要中央會員");
  return { source: toSnapshot(source), target: toSnapshot(target) };
}

export async function previewCentralUserMerge(sourceUserId: string, targetUserId: string) {
  const pair = await loadPair(prisma, sourceUserId, targetUserId);
  return { ...pair, plan: buildCentralUserMergePlan(pair.source, pair.target) };
}

export async function executeCentralUserMerge(input: {
  sourceUserId: string;
  targetUserId: string;
  actorUserId: string;
}) {
  return prisma.$transaction(async (tx) => {
    const { source, target } = await loadPair(tx, input.sourceUserId, input.targetUserId);
    const plan = buildCentralUserMergePlan(source, target);
    if (!plan.executable) throw new Error(`中央會員整合已阻擋：${plan.blockers.join("；")}`);

    const targetProviders = new Set(target.accounts.map((account) => account.provider));
    const movableAccounts = source.accounts.filter((account) => !targetProviders.has(account.provider));
    const duplicateAccounts = source.accounts.filter((account) => targetProviders.has(account.provider));
    const targetLinkKeys = new Set(target.identityLinks.map((link) => `${link.storeId}\u0000${link.provider}`));
    const movableLinks = source.identityLinks.filter(
      (link) => !targetLinkKeys.has(`${link.storeId}\u0000${link.provider}`),
    );

    if (movableAccounts.length) {
      await tx.account.updateMany({ where: { id: { in: movableAccounts.map((row) => row.id) } }, data: { userId: target.id } });
    }
    if (duplicateAccounts.length) {
      await tx.account.deleteMany({ where: { id: { in: duplicateAccounts.map((row) => row.id) } } });
    }
    if (movableLinks.length) {
      await tx.customerIdentityLink.updateMany({ where: { id: { in: movableLinks.map((row) => row.id) } }, data: { userId: target.id } });
    }
    if (source.customer && !target.customer) {
      await tx.customer.update({ where: { id: source.customer.id }, data: { userId: target.id } });
    }
    await tx.centralMemberLinkReviewRequest.updateMany({ where: { userId: source.id }, data: { userId: target.id } });
    await tx.session.deleteMany({ where: { userId: source.id } });
    await tx.user.update({
      where: { id: source.id },
      data: { status: "SUSPENDED", email: null, phone: null, passwordHash: null },
    });
    await tx.auditLog.create({
      data: {
        actorUserId: input.actorUserId,
        targetType: "User",
        targetId: target.id,
        action: "MERGE_CENTRAL_USER",
        beforeJson: { sourceUserId: source.id, targetUserId: target.id },
        afterJson: { ...plan.moves, sourceStatus: "SUSPENDED" },
      },
    });
    return plan;
  });
}
