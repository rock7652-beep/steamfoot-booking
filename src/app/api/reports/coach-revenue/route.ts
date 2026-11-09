import {AppError} from "@/lib/errors";
import {getStoreIndustryModule} from '@/lib/industry-module-server';
import {moduleStaffRevenueSummary} from '@/lib/module-revenue-report';
import { FEATURES } from "@/lib/feature-flags";
import { hasStoreFeature } from "@/lib/feature-gate";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/session";
import { getEffectiveActorRole } from "@/lib/hq-store-view-context";
import { checkPermission } from "@/lib/permissions";
import {getManagerReadFilter} from "@/lib/manager-visibility";
import { getStoreFilter } from "@/lib/manager-visibility";
import { resolveActiveStoreId } from "@/lib/store";
import {
  resolveStoreViewContextFromCookie,
  storeIdForViewContext,
  userForViewContext,
} from "@/lib/store-view-context-server";
import {
  getCoachRevenueSummary,
  getTransactionDetails,
  getRevenueKpi,
  type ReportFilters,
} from "@/lib/report-queries";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const allowed = await checkPermission(user.role, user.staffId, "report.read");
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const cookieStore = await cookies();
  const cookieStoreId = cookieStore.get("active-store-id")?.value ?? null;
  const activeStoreId = await resolveActiveStoreId(user, cookieStoreId);
  const storeViewContext = await resolveStoreViewContextFromCookie(user);
  const readUser = userForViewContext(user, storeViewContext);
  const reportsStoreId = storeIdForViewContext(activeStoreId, storeViewContext);
  const storeFilter = getStoreFilter(readUser, reportsStoreId);

  const sp = req.nextUrl.searchParams;
  const analysisStoreId = getEffectiveActorRole(user) === "ADMIN" && !storeViewContext?.isViewMode
    ? sp.get("storeId") ?? reportsStoreId
    : reportsStoreId;
  if ((!analysisStoreId && getEffectiveActorRole(user) !== "ADMIN") ||
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
    storeId: getEffectiveActorRole(user) === "ADMIN" ? sp.get("storeId") : reportsStoreId,
    coachId: sp.get("coachId"),
    coachRole: sp.get("coachRole"),
    planType: sp.get("planType"),
    keyword: sp.get("keyword"),
    storeFilter,
  };

  const level = sp.get("level") ?? "summary";

  try {
    const industry=analysisStoreId?await getStoreIndustryModule(analysisStoreId):null;
    if(analysisStoreId&&(industry==="beauty"||industry==="steamfoot")){
      if(industry==="beauty"){
        const scope=getManagerReadFilter(readUser.role,readUser.staffId??null,"revenueStaffId",analysisStoreId);
        if(typeof scope.revenueStaffId==="string"){
          if(filters.coachId&&filters.coachId!==scope.revenueStaffId)return new NextResponse("Forbidden",{status:403});
          filters.coachId=scope.revenueStaffId;
        }
      }
      if(industry==="beauty"&&level!=="summary"&&(!(await checkPermission(user.role,user.staffId,"transaction.read"))||!(await hasStoreFeature(analysisStoreId,FEATURES.TRANSACTION_MANAGEMENT))))return NextResponse.json({error:"Forbidden"},{status:403});
      const report=industry==='steamfoot'?await (await import('@/server/queries/steamfoot-revenue-report')).getSteamfootRevenueReport(analysisStoreId,{...filters,storeFilter:{...filters.storeFilter,storeId:analysisStoreId}},{customers:await checkPermission(user.role,user.staffId,'customer.read'),reader:readUser}):await (await import('@/server/queries/beauty-revenue-report')).getBeautyRevenueReport(analysisStoreId,filters,{customers:await checkPermission(user.role,user.staffId,"customer.read")});
      const headers={"Cache-Control":"private, no-store"};
      if(level==="summary")return NextResponse.json({summary:moduleStaffRevenueSummary(report),kpi:report.kpi},{headers});
      const page=Math.max(1,Math.floor(Number(sp.get('page'))||1)),pageSize=Math.min(1000,Math.max(1,Math.floor(Number(sp.get('pageSize'))||50)));
      const details={data:report.data.slice((page-1)*pageSize,page*pageSize),total:report.data.length,page,pageSize};
      return NextResponse.json(level==="details"?details:{summary:moduleStaffRevenueSummary(report),kpi:report.kpi,details},{headers});
    }
    if (level === "summary") {
      const [summary, kpi] = await Promise.all([
        getCoachRevenueSummary(filters),
        getRevenueKpi(filters, true),
      ]);
      return NextResponse.json({ summary, kpi });
    }

    if (level === "details") {
      const page = parseInt(sp.get("page") ?? "1", 10);
      const pageSize = parseInt(sp.get("pageSize") ?? "50", 10);
      const details = await getTransactionDetails(filters, page, pageSize);
      return NextResponse.json(details);
    }

    const [summary, kpi, details] = await Promise.all([
      getCoachRevenueSummary(filters),
      getRevenueKpi(filters, true),
      getTransactionDetails(filters, 1, 1000),
    ]);
    return NextResponse.json({ summary, kpi, details });
  } catch (e) {
    if(e instanceof AppError && ["VALIDATION","FORBIDDEN"].includes(e.code))return NextResponse.json({error:e.message},{status:e.code==="FORBIDDEN"?403:400});
    console.error("Coach revenue API error:", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
