import { prisma } from "@/lib/db";
import { AppError } from "@/lib/errors";

const MAX_STORE_TREE_DEPTH = 20;

type SessionLike = {
  id?: string | null;
  role: string;
  storeId?: string | null;
};

export interface StoreViewContext {
  /** The staff user's own operating store. ADMIN has no own store. */
  ownStoreId: string | null;
  /** The store currently being read. PR-1 does not wire this to cookies/UI. */
  viewedStoreId: string | null;
  /** True only when a non-ADMIN staff user is reading a descendant store. */
  isViewMode: boolean;
  /** Mutations are allowed only outside descendant view mode. */
  canWrite: boolean;
}

export interface ResolveStoreViewContextOptions {
  /**
   * Future hook for view-mode cookie / route resolution.
   * Omitted in PR-1 call sites, so existing behavior remains own-store only.
   */
  viewedStoreId?: string | null;
}

/**
 * Return all descendant store ids for a store organization tree.
 *
 * Store.parentStoreId is a view-access relationship only. It must not be used
 * to derive revenue ownership, customer ownership, plan ownership, or history.
 */
export async function getDescendantStoreIds(ownStoreId: string): Promise<string[]> {
  const descendants: string[] = [];
  const visited = new Set<string>([ownStoreId]);
  let frontier = [ownStoreId];

  for (let depth = 0; depth < MAX_STORE_TREE_DEPTH && frontier.length > 0; depth += 1) {
    const children = await prisma.store.findMany({
      where: { parentStoreId: { in: frontier } },
      select: { id: true, parentStoreId: true },
    });

    const next: string[] = [];
    for (const child of children) {
      if (visited.has(child.id)) {
        throw new AppError("BUSINESS_RULE", "店舖組織不可形成循環關係");
      }
      visited.add(child.id);
      descendants.push(child.id);
      next.push(child.id);
    }
    frontier = next;
  }

  if (frontier.length > 0) {
    throw new AppError("BUSINESS_RULE", "店舖組織層級過深，請檢查是否有循環關係");
  }

  return descendants;
}

export async function canViewStore(
  ownStoreId: string,
  targetStoreId: string,
): Promise<boolean> {
  if (ownStoreId === targetStoreId) return true;
  const descendantIds = await getDescendantStoreIds(ownStoreId);
  return descendantIds.includes(targetStoreId);
}

export async function assertCanViewStore(
  user: SessionLike,
  targetStoreId: string,
): Promise<void> {
  if (user.role === "ADMIN") return;
  if (!user.storeId) {
    throw new AppError("UNAUTHORIZED", "缺少店舖資訊，請重新登入");
  }
  if (!(await canViewStore(user.storeId, targetStoreId))) {
    throw new AppError("FORBIDDEN", "無權查看此店舖");
  }
}

/**
 * Validate a proposed Store.parentStoreId change.
 *
 * PR-1 only provides the guard; it does not add UI or mutate production data.
 */
export async function assertValidStoreParentAssignment(
  storeId: string,
  parentStoreId: string | null | undefined,
): Promise<void> {
  if (!parentStoreId) return;
  if (storeId === parentStoreId) {
    throw new AppError("BUSINESS_RULE", "店舖不可將自己設為上層店舖");
  }

  const descendantIds = await getDescendantStoreIds(storeId);
  if (descendantIds.includes(parentStoreId)) {
    throw new AppError("BUSINESS_RULE", "店舖組織不可形成循環關係");
  }
}

export async function resolveStoreViewContext(
  user: SessionLike,
  options: ResolveStoreViewContextOptions = {},
): Promise<StoreViewContext> {
  if (user.role === "ADMIN") {
    return {
      ownStoreId: null,
      viewedStoreId: options.viewedStoreId ?? null,
      isViewMode: false,
      canWrite: true,
    };
  }

  if (!user.storeId) {
    throw new AppError("UNAUTHORIZED", "缺少店舖資訊，請重新登入");
  }

  const viewedStoreId = options.viewedStoreId ?? user.storeId;
  await assertCanViewStore(user, viewedStoreId);

  const isViewMode = viewedStoreId !== user.storeId;
  return {
    ownStoreId: user.storeId,
    viewedStoreId,
    isViewMode,
    canWrite: !isViewMode,
  };
}

export function assertWritableStoreViewContext(ctx: StoreViewContext): void {
  if (!ctx.canWrite) {
    throw new AppError("FORBIDDEN", "查看模式下不可執行操作");
  }
}
