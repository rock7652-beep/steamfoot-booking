import { NextRequest, NextResponse } from "next/server";
import { AppError } from "@/lib/app-error";
import { consumptionCsv } from "@/lib/customer-consumption";
import { getCustomerConsumption } from "@/server/queries/customer-consumption";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const data = await getCustomerConsumption(Object.fromEntries(request.nextUrl.searchParams), true);
    const planName = data.options.find(option => option.id === data.filters.planId)?.name ?? "全部收費方式";
    const staffName = data.filters.staffId === "__unassigned__" ? "未指派" : data.staffOptions.find(option => option.id === data.filters.staffId)?.name ?? "全部店長";
    return new NextResponse(consumptionCsv(data.rows, data.filters, planName, data.metrics, staffName, data.module === "beauty"), { headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="customer-consumption-${data.filters.startDate}-${data.filters.endDate}.csv"`,
      "Cache-Control": "private, no-store",
    } });
  } catch (error) {
    if (error instanceof AppError) return new NextResponse(error.message, {
      status: error.code === "UNAUTHORIZED" ? 401 : error.code === "FORBIDDEN" ? 403 : 400,
      headers: { "Cache-Control": "private, no-store" },
    });
    console.error("[customer-consumption-export] failed", error instanceof Error ? error.name : "UnknownError");
    return new NextResponse("匯出失敗，請稍後再試", { status: 500, headers: { "Cache-Control": "private, no-store" } });
  }
}
