import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { getActiveStoreForRead } from "@/lib/store";
import { resolveStoreViewContextFromCookie, storeIdForViewContext } from "@/lib/store-view-context-server";
import { hasStoreFeature } from "@/lib/feature-gate";
import { FEATURES } from "@/lib/feature-flags";
import { analysisComparisonRanges, isAnalysisDate, parseTaiwanDateToDbDate, resolveAnalysisRange } from "@/lib/date-utils";
import { isCustomerKpiSegment } from "@/server/queries/customer-kpi-segments";
import { getAnalysisPeriodCustomers } from "@/server/queries/analysis-period";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "請先登入" }, { status: 401 });
  if (!(await checkPermission(user.role, user.staffId, "report.read")) || !(await checkPermission(user.role, user.staffId, "customer.read"))) return NextResponse.json({ error: "沒有查看權限" }, { status: 403 });
  const context = await resolveStoreViewContextFromCookie(user);
  const storeId = storeIdForViewContext(await getActiveStoreForRead(user), context);
  if (!storeId || !(await hasStoreFeature(storeId, FEATURES.BASIC_REPORTS))) return NextResponse.json({ error: "請選擇已開通分析的店舖" }, { status: 403 });
  const params = Object.fromEntries(req.nextUrl.searchParams);
  if (!isAnalysisDate(params.startDate) || !isAnalysisDate(params.endDate) || params.endDate < params.startDate) return NextResponse.json({ error: "日期範圍無效" }, { status: 400 });
  const range = resolveAnalysisRange(params);
  const page = Math.max(1, Math.min(10000, Number.parseInt(params.page ?? "1") || 1));
  const pageSize = 50;
  const segment = params.segment;
  let rows: { id: string; name: string; detail: string; href: string }[];
  let total: number;
  let attendees: number | undefined;
  if (segment === "services" || segment === "trials") {
    const { current } = analysisComparisonRanges(range, range.preset);
    const where = { storeId, bookingStatus: "COMPLETED" as const, ...(segment === "trials" ? { bookingType: "FIRST_TRIAL" as const } : {}), bookingDate: { gte: parseTaiwanDateToDbDate(current.startDate), lte: parseTaiwanDateToDbDate(current.endDate) } };
    const [bookings, counts] = await Promise.all([
      prisma.booking.findMany({ where, select: { id: true, bookingDate: true, people: true, attendedPeople: true, customer: { select: { name: true } } }, orderBy: [{ bookingDate: "desc" }, { id: "asc" }], take: pageSize, skip: (page - 1) * pageSize }),
      prisma.booking.findMany({ where, select: { people: true, attendedPeople: true } }),
    ]);
    total = counts.length;
    attendees = counts.reduce((sum, b) => sum + (b.attendedPeople ?? b.people), 0);
    rows = bookings.map(b => ({ id: b.id, name: b.customer.name ?? "未命名", detail: `${b.bookingDate.toISOString().slice(0, 10)} · ${b.attendedPeople ?? b.people} 人次`, href: `/dashboard/bookings?bookingId=${b.id}` }));
  } else if (isCustomerKpiSegment(segment)) {
    const customers = await getAnalysisPeriodCustomers(storeId, range, range.preset, segment);
    total = customers.length;
    rows = customers.slice((page - 1) * pageSize, page * pageSize).map(c => ({ id: c.customerId, name: c.customerName, detail: c.assignedStaffName ?? "未指派店長", href: `/dashboard/customers/${c.customerId}` }));
  } else return NextResponse.json({ error: "無效的名單類型" }, { status: 400 });
  return NextResponse.json({ rows, total, attendees, page, pageSize }, { headers: { "Cache-Control": "private, no-store" } });
}
