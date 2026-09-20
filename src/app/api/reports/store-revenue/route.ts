import { AppError } from "@/lib/errors";
import { getStoreIndustryModule } from "@/lib/industry-module-server";
import { getCourseRevenueReport } from "@/server/queries/course-revenue-report";
import { FEATURES } from "@/lib/feature-flags";
import { hasStoreFeature } from "@/lib/feature-gate";
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
  const analysisStoreId = user.role === "ADMIN" && !storeViewContext?.isViewMode
    ? sp.get("storeId") ?? reportsStoreId
    : reportsStoreId;
  if ((!analysisStoreId && user.role !== "ADMIN") ||
      (analysisStoreId && !(await hasStoreFeature(analysisStoreId, FEATURES.BASIC_REPORTS)))) {
    return NextResponse.json({ error: "分析尚未開通，NT$800／月獨立加購" }, { status: 403 });
  }

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
    if (analysisStoreId && await getStoreIndustryModule(analysisStoreId) === "course") {
      const report = await getCourseRevenueReport(analysisStoreId, filters);
      const page = Math.max(1, Math.floor(Number(sp.get("page")) || 1));
      const pageSize = Math.min(1000, Math.max(1, Math.floor(Number(sp.get("pageSize")) || 50)));
      if (level === "summary") return NextResponse.json({ summary: report.summary, kpi: report.kpi });
      if (level === "payment-methods") return NextResponse.json({paymentMethods:report.paymentMethods});
      const details = {data:report.data.slice((page-1)*pageSize,page*pageSize),total:report.data.length,page,pageSize};
      if (level === "details") return NextResponse.json(details);
      return NextResponse.json({summary:report.summary,kpi:report.kpi,details});
    }
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
    if (e instanceof AppError && e.code === "VALIDATION") return NextResponse.json({ error: e.message }, { status: 400 });
    console.error("Store revenue API error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
