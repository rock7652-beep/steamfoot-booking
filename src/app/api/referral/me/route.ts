import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * GET /api/referral/me
 * 回傳當前顧客的邀請連結與邀請人數
 */
export const GET = auth(async (req) => {
  const user = req.auth?.user;
  if (!user?.customerId || user.role !== "CUSTOMER") {
    return NextResponse.json({ error: "未登入" }, { status: 401 });
  }

  const storeSlug = user.storeSlug ?? "zhubei";
  const count = await prisma.customer.count({
    where: { sponsorId: user.customerId },
  });

  return NextResponse.json({
    referralUrl: `/s/${storeSlug}?ref=${user.customerId}`,
    count,
  });
}) as (req: Request) => Promise<Response>;
