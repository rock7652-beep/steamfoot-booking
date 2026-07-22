import type { Account } from "next-auth";
import { prisma } from "@/lib/db";
import type { LinkableOAuthProvider } from "@/lib/account-link-handshake";

export type LinkOAuthAccountResult =
  | { status: "linked" | "already_linked" }
  | { status: "rejected"; reason: "target_unavailable" | "owned_by_other_user" };

export async function linkVerifiedOAuthAccount(input: {
  targetUserId: string;
  provider: LinkableOAuthProvider;
  account: Account;
  replace?: boolean;
}): Promise<LinkOAuthAccountResult> {
  return prisma.$transaction(async (tx) => {
    const target = await tx.user.findUnique({
      where: { id: input.targetUserId },
      select: { role: true, status: true },
    });
    if (!target || target.role !== "CUSTOMER" || target.status !== "ACTIVE") {
      return { status: "rejected", reason: "target_unavailable" } as const;
    }

    const existing = await tx.account.findUnique({
      where: {
        provider_providerAccountId: {
          provider: input.provider,
          providerAccountId: input.account.providerAccountId,
        },
      },
      select: { userId: true },
    });
    if (existing?.userId === input.targetUserId) {
      return { status: "already_linked" } as const;
    }
    if (existing) {
      return { status: "rejected", reason: "owned_by_other_user" } as const;
    }

    if (input.replace) {
      await tx.account.deleteMany({
        where: { userId: input.targetUserId, provider: input.provider },
      });
    }
    await tx.account.create({
      data: {
        userId: input.targetUserId,
        type: input.account.type,
        provider: input.provider,
        providerAccountId: input.account.providerAccountId,
        access_token: input.account.access_token,
        refresh_token: input.account.refresh_token,
        expires_at: input.account.expires_at,
        token_type: input.account.token_type,
        scope: input.account.scope,
        id_token: input.account.id_token,
        session_state:
          typeof input.account.session_state === "string"
            ? input.account.session_state
            : undefined,
      },
    });
    await tx.auditLog.create({
      data: {
        actorUserId: input.targetUserId,
        targetType: "User",
        targetId: input.targetUserId,
        action: `LOGIN_METHOD_${input.provider.toUpperCase()}_${input.replace ? "REPLACED" : "LINKED"}`,
      },
    });
    return { status: "linked" } as const;
  });
}
