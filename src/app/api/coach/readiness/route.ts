import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export type ReadinessStatus = "READY" | "HIGH" | "MEDIUM" | "LOW";

interface ReadinessData {
  referralCount: number;
  bookingCount: number;
  status: ReadinessStatus;
  nextGoal: { referral: number; booking: number };
}

const GOALS = { referral: 5, booking: 3 };

function calcStatus(ref: number, booking: number): ReadinessStatus {
  if (ref >= 5 && booking >= 3) return "READY";
  if (ref >= 3) return "HIGH";
  if (ref >= 1) return "MEDIUM";
  return "LOW";
}

/**
 * GET /api/coach/readiness
 * 回傳當前顧客的教練準備度：邀請人數、被邀請者預約數、狀態、下一步目標
 */
export const GET = auth(async (req) => {
  const user = req.auth?.user;
  if (!user?.customerId || user.role !== "CUSTOMER") {
    return NextResponse.json({ error: "未登入" }, { status: 401 });
  }

  // 1. 邀請人數 = sponsorId 指向自己的 customer 數
  const referralCount = await prisma.customer.count({
    where: { sponsorId: user.customerId },
  });

  // 2. 被邀請者的預約數 = 那些 customer 的 booking 數（PENDING + CONFIRMED）
  const bookingCount = referralCount > 0
    ? await prisma.booking.count({
        where: {
          customer: { sponsorId: user.customerId },
          bookingStatus: { in: ["PENDING", "CONFIRMED"] },
        },
      })
    : 0;

  const status = calcStatus(referralCount, bookingCount);

  const data: ReadinessData = {
    referralCount,
    bookingCount,
    status,
    nextGoal: GOALS,
  };

  return NextResponse.json(data);
}) as (req: Request) => Promise<Response>;
