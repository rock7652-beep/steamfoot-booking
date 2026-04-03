import { NextRequest, NextResponse } from "next/server";
import { searchCustomers } from "@/server/queries/customer";

// GET /api/customers/search?q=林
export async function GET(request: NextRequest) {
  try {
    const q = request.nextUrl.searchParams.get("q") || "";
    const limit = Number(request.nextUrl.searchParams.get("limit") || "10");

    const results = await searchCustomers(q, Math.min(limit, 20));

    // 格式化回傳（含剩餘堂數計算）
    const formatted = results.map((c) => ({
      id: c.id,
      name: c.name,
      phone: c.phone,
      email: c.email,
      stage: c.customerStage,
      staffName: c.assignedStaff?.displayName ?? null,
      staffColor: c.assignedStaff?.colorCode ?? null,
      remainingSessions: c.planWallets.reduce(
        (sum, w) => sum + w.remainingSessions,
        0
      ),
    }));

    return NextResponse.json(formatted);
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "搜尋失敗";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
