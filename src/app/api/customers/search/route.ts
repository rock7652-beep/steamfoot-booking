import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/lib/auth";
import { searchCustomers } from "@/server/queries/customer";
import { resolveActiveStoreId } from "@/lib/store";
import { isStaffRole, isOwner } from "@/lib/permissions";

// GET /api/customers/search?q=林
//
// 顧客搜尋必須限縮在「目前選定分店」範圍內：
//   - OWNER / PARTNER：以 session.storeId 為準
//   - ADMIN：以 active-store-id cookie 為準；__all__ 視角下拒絕搜尋
//     （未來 SUPER_OWNER 跨店搜尋若有正式需求，再另開 API；現階段避免在
//      預約表單裡誤選到其他店的顧客。）
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    const user = session?.user;
    if (!user || !isStaffRole(user.role)) {
      return NextResponse.json({ error: "未授權" }, { status: 401 });
    }

    const cookieStore = await cookies();
    const cookieStoreId = cookieStore.get("active-store-id")?.value ?? null;
    const activeStoreId = await resolveActiveStoreId(user, cookieStoreId);

    if (isOwner(user.role) && !activeStoreId) {
      return NextResponse.json(
        { error: "請先在右上角切換到指定分店，再搜尋顧客" },
        { status: 400 },
      );
    }

    const q = request.nextUrl.searchParams.get("q") || "";
    const limit = Number(request.nextUrl.searchParams.get("limit") || "10");

    const results = await searchCustomers(q, Math.min(limit, 20), activeStoreId);

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
