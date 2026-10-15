import type { NextRequest, NextResponse } from "next/server";
import { isHqPlatformPath } from "@/lib/hq-navigation";
import { retiredStoreResponse } from "@/lib/retired-store-response";

/** Denial-only lookup. This never selects or authorizes a store for downstream code. */
export function retiredStoreBoundary(
  req: NextRequest,
  domainStoreId?: string,
): Promise<NextResponse | null> | null {
  const path = req.nextUrl.pathname;
  const slug = path.match(/^\/s\/([^/]+)(?:\/|$)/)?.[1] ??
    (path === "/hq/login" ? req.nextUrl.searchParams.get("store") : null);
  const hq = /^\/hq\/dashboard(?:\/|$)/.test(path) && !isHqPlatformPath(path);
  const selected = hq ? req.cookies.get("active-store-id")?.value : null;
  // Custom domains scope customer pages, never HQ platform pages or API/auth.
  const domainTarget = /^\/(?:hq|api|_next)(?:\/|$)/.test(path) ? undefined : domainStoreId;
  const id = selected && selected !== "__all__" ? selected : domainTarget;
  if (!slug && !id) return null;

  return (async () => {
    const { prisma } = await import("@/lib/db");
    const store = await prisma.store.findUnique({
      where: slug ? { slug } : { id: id! },
      select: { industryModule: true },
    });
    return store?.industryModule === "SPA" ? retiredStoreResponse(hq) : null;
  })();
}
