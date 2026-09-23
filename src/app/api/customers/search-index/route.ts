import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { checkPermission, isStaffRole } from "@/lib/permissions";
import { getActiveStoreForRead } from "@/lib/store";
import { requireSteamfootStore } from "@/lib/industry-module-server";
import { resolveStoreViewContextFromCookie, storeIdForViewContext } from "@/lib/store-view-context-server";
import { prisma } from "@/lib/db";
import { CUSTOMER_INDEX_LIMIT, normalizeCustomerSearch } from "@/lib/customer-search-index";
import { customerListFilterWhere } from "@/lib/customer-list-filters";
import { CustomerStage } from "@prisma/client";

const headers = { "Cache-Control": "private, no-store" };
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user || !isStaffRole(user.role)) return NextResponse.json({}, { status: 401, headers });
    if (!await checkPermission(user.role, user.staffId, "customer.read")) return NextResponse.json({}, { status: 403, headers });
    const view = await resolveStoreViewContextFromCookie(user);
    const storeId = storeIdForViewContext(await getActiveStoreForRead(user), view);
    // Client scope is only a consistency check, never an authorization source.
    if (!storeId || request.nextUrl.searchParams.get("storeId") !== storeId) {
      return NextResponse.json({}, { status: 409, headers });
    }
    await requireSteamfootStore(storeId);
    const q = normalizeCustomerSearch(request.nextUrl.searchParams.get("q") ?? "");
    const params = request.nextUrl.searchParams;
    const stage = params.get("stage");
    const filters = customerListFilterWhere({
      status: params.get("status"), visit: params.get("visit"),
      referral: params.get("referral"), assignedStaffId: params.get("staff"),
      stage: Object.values(CustomerStage).includes(stage as CustomerStage) ? stage as CustomerStage : undefined,
    });
    const rows = await prisma.customer.findMany({
      where: {
        storeId,
        mergedIntoCustomerId: null,
        NOT: { user: { is: { status: "SUSPENDED" } } },
        ...filters,
        ...(q ? { OR: [
          { name: { contains: q, mode: "insensitive" as const } },
          { phone: { contains: q } },
          { lineName: { contains: q, mode: "insensitive" as const } },
        ] } : {}),
      },
      select: { id: true, name: true, phone: true, lineName: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take: q ? 8 : CUSTOMER_INDEX_LIMIT + 1,
    });
    return NextResponse.json({ scope: `${user.id}:${storeId}`, rows: rows.slice(0, q ? 8 : CUSTOMER_INDEX_LIMIT), complete: q ? false : rows.length <= CUSTOMER_INDEX_LIMIT }, { headers });
  } catch {
    return NextResponse.json({ error: "暫時無法載入顧客搜尋資料" }, { status: 503, headers });
  }
}
