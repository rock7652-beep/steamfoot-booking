import { NextRequest, NextResponse } from "next/server";
import { AppError } from "@/lib/errors";
import { FEATURES } from "@/lib/feature-flags";
import { requireStoreFeature } from "@/lib/feature-gate";
import { requirePermission } from "@/lib/permissions";
import { getActiveStoreForRead } from "@/lib/store";
import {
  resolveStoreViewContextFromCookie,
  storeIdForViewContext,
} from "@/lib/store-view-context-server";
import {
  buildStoreSettlementCsv,
  getStoreSettlementForStoreByMonth,
} from "@/server/services/store-settlements";

function isValidMonth(value: string | null): value is string {
  return Boolean(value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value));
}

function responseForAppError(error: AppError): NextResponse {
  const status =
    error.code === "UNAUTHORIZED"
      ? 401
      : error.code === "FORBIDDEN"
      ? 403
      : error.code === "NOT_FOUND"
      ? 404
      : 400;
  return new NextResponse(error.message, { status });
}

export async function GET(req: NextRequest) {
  try {
    const user = await requirePermission("report.read");
    const month = req.nextUrl.searchParams.get("month");
    if (!isValidMonth(month)) {
      return new NextResponse("月份格式不正確", { status: 400 });
    }

    const activeStoreId = await getActiveStoreForRead(user);
    const viewContext = await resolveStoreViewContextFromCookie(user);
    const storeId = storeIdForViewContext(activeStoreId, viewContext);
    if (!storeId) {
      return new NextResponse("請先切換到指定分店，再匯出月結紀錄", {
        status: 400,
      });
    }

    await requireStoreFeature(storeId, FEATURES.SERVICE_FEE_CALCULATOR);

    const settlement = await getStoreSettlementForStoreByMonth(storeId, month);
    if (!settlement) {
      return new NextResponse("此月份尚未儲存月結單，請先儲存本月試算", {
        status: 404,
      });
    }

    const csv = buildStoreSettlementCsv(settlement);
    const filename = `store-settlement-${settlement.storeName}-${month}.csv`;
    const encodedFilename = encodeURIComponent(filename);

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodedFilename}`,
      },
    });
  } catch (error) {
    if (error instanceof AppError) {
      return responseForAppError(error);
    }
    console.error("[store-settlements/export] failed", error);
    return new NextResponse("Internal server error", { status: 500 });
  }
}
