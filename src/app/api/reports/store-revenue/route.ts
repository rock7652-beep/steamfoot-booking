import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/permissions";
import { getStoreFilter } from "@/lib/manager-visibility";
import { resolveActiveStoreId } from "@/lib/store";
import {
  resolveStoreViewContextFromCookie,
  storeIdForViewContext,
  userForViewContext,
} from "@/lib/store-view-context-server";
import {
  getStoreRevenueSummary,
  getTransactionDetails,
  getRevenueKpi,
  getPaymentMethodRevenueSummary,
  type ReportFilters,
} from "@/lib/report-queries";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const allowed = await checkPermission(session.user.role, session.user.staffId, "report.read");
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const user = session.user;
  const cookieStore = await cookies();
  const cookieStoreId = cookieStore.get("active-store-id")?.value ?? null;
  const activeStoreId = await resolveActiveStoreId(user, cookieStoreId);
  const storeViewContext = await resolveStoreViewContextFromCookie(user);
  const readUser = userForViewContext(user, storeViewContext);
  const reportsStoreId = storeIdForViewContext(activeStoreId, storeViewContext);
  const storeFilter = getStoreFilter(readUser, reportsStoreId);

  const sp = req.nextUrl.searchParams;
  const startDate = sp.get("startDate");
  const endDate = sp.get("endDate");

  if (!startDate || !endDate) {
    return NextResponse.json({ error: "startDate and endDate are required" }, { status: 400 });
  }

  const filters: ReportFilters = {
    startDate,
    endDate,
    storeId: user.role === "ADMIN" ? sp.get("storeId") : reportsStoreId,
    planType: sp.get("planType"),
    paymentMethod: sp.get("paymentMethod"),
    keyword: sp.get("keyword"),
    storeFilter,
  };

  const level = sp.get("level") ?? "summary";

  try {
    if (level === "summary") {
      const [summary, kpi] = await Promise.all([
        getStoreRevenueSummary(filters),
        getRevenueKpi(filters),
      ]);
      return NextResponse.json({ summary, kpi });
    }

    if (level === "details") {
      const page = parseInt(sp.get("page") ?? "1", 10);
      const pageSize = parseInt(sp.get("pageSize") ?? "50", 10);
      const details = await getTransactionDetails(filters, page, pageSize);
      return NextResponse.json(details);
    }

    if (level === "payment-methods") {
      const paymentMethods = await getPaymentMethodRevenueSummary(filters);
      return NextResponse.json({ paymentMethods });
    }

    // all: summary + details
    const [summary, kpi, details] = await Promise.all([
      getStoreRevenueSummary(filters),
      getRevenueKpi(filters),
      getTransactionDetails(filters, 1, 1000),
    ]);
    return NextResponse.json({ summary, kpi, details });
  } catch (e) {
    console.error("Store revenue API error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
