import { prisma } from "@/lib/db";

/**
 * Identity repair on login — single-direction, store-scoped, multi-match safe.
 *
 * Why this exists:
 *   resolveCustomerForUser miss is the root of "/my-bookings 跳首頁" / "顧客資料找不到"
 *   class of bugs. Instead of patching the resolver to guess harder, we fix the
 *   binding at login time so resolver path A (sessionCustomerId direct lookup)
 *   stays warm.
 *
 * What it does:
 *   On login success, look up Customer in the same store by any of the identity
 *   markers we have (phone / lineUserId / googleId / email). If exactly one
 *   candidate is found and its userId is null, bind it to the logging-in user.
 *
 * What it deliberately DOES NOT do:
 *   - Cross-store merge
 *   - Auto-merge two Customer rows
 *   - Override an existing Customer.userId (no hijacking)
 *   - Bind anything when 2+ candidates match (dirty data — leave for manual review)
 *   - Throw / propagate errors (login flow must never fail because of repair)
 *
 * Schema note: User.customerId is a Prisma relation accessor, NOT a column.
 *   Customer.userId is the only foreign key in this 1:1 relation, so this is
 *   the only direction we need (and can) repair.
 */

export type RepairAction =
  | "bound" // Customer.userId was null → set to opts.userId
  | "synced" // Already correctly bound, no-op
  | "skip-no-input" // No identity markers provided
  | "skip-no-match" // No Customer in same store matches any marker
  | "skip-multi" // 2+ candidates — refuse to guess
  | "skip-conflict" // Single candidate already bound to a different user
  | "skip-error"; // Lookup / update threw — swallowed

export interface RepairOpts {
  userId: string;
  storeId: string;
  phone?: string | null;
  lineUserId?: string | null;
  googleId?: string | null;
  email?: string | null;
}

export interface RepairResult {
  customerId: string | null;
  action: RepairAction;
}

export async function repairCustomerIdentityOnLogin(
  opts: RepairOpts,
): Promise<RepairResult> {
  const orFilters: Array<Record<string, string>> = [];
  if (opts.phone) orFilters.push({ phone: opts.phone });
  if (opts.lineUserId) orFilters.push({ lineUserId: opts.lineUserId });
  if (opts.googleId) orFilters.push({ googleId: opts.googleId });
  if (opts.email) orFilters.push({ email: opts.email });

  if (orFilters.length === 0) {
    return { customerId: null, action: "skip-no-input" };
  }

  const logCtx = {
    userId: opts.userId,
    storeId: opts.storeId,
    hasPhone: !!opts.phone,
    hasLineUserId: !!opts.lineUserId,
    hasGoogleId: !!opts.googleId,
    hasEmail: !!opts.email,
  };

  try {
    // take: 2 to detect multi-match without scanning more than necessary.
    // orderBy: bound (non-null userId) first, then newer first — so the candidate
    //   we *would* prefer (cleanest) shows up at index 0 in logs even when we skip.
    const candidates = await prisma.customer.findMany({
      where: { storeId: opts.storeId, OR: orFilters },
      select: { id: true, userId: true },
      orderBy: [
        { userId: { sort: "desc", nulls: "last" } },
        { createdAt: "desc" },
      ],
      take: 2,
    });

    if (candidates.length === 0) {
      console.info("[identity-repair] skip-no-match", logCtx);
      return { customerId: null, action: "skip-no-match" };
    }

    if (candidates.length > 1) {
      console.warn("[identity-repair] skip-multi (dirty data — manual review)", {
        ...logCtx,
        candidateIds: candidates.map((c) => c.id),
      });
      return { customerId: null, action: "skip-multi" };
    }

    const customer = candidates[0];

    if (customer.userId === opts.userId) {
      console.info("[identity-repair] synced (already bound)", {
        ...logCtx,
        customerId: customer.id,
      });
      return { customerId: customer.id, action: "synced" };
    }

    if (customer.userId !== null) {
      console.warn("[identity-repair] skip-conflict (bound to different user)", {
        ...logCtx,
        customerId: customer.id,
        existingUserId: customer.userId,
      });
      return { customerId: null, action: "skip-conflict" };
    }

    await prisma.customer.update({
      where: { id: customer.id },
      data: { userId: opts.userId },
    });
    console.info("[identity-repair] bound", {
      ...logCtx,
      customerId: customer.id,
    });
    return { customerId: customer.id, action: "bound" };
  } catch (err) {
    console.error("[identity-repair] skip-error", { ...logCtx, err });
    return { customerId: null, action: "skip-error" };
  }
}
