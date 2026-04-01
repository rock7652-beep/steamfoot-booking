import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { listAvailableSlots } from "@/server/queries/booking";
import { BookingForm } from "./booking-form";
import { redirect } from "next/navigation";

// 未來 14 天的日期列表
function getNext14Days(): { date: string; label: string; day: string }[] {
  const result = [];
  const dayNames = ["日", "一", "二", "三", "四", "五", "六"];
  const today = new Date();
  for (let i = 0; i < 14; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const dateStr = d.toISOString().slice(0, 10);
    const monthDay = `${d.getMonth() + 1}/${d.getDate()}`;
    const day = dayNames[d.getDay()];
    result.push({ date: dateStr, label: monthDay, day });
  }
  return result;
}

interface PageProps {
  searchParams: Promise<{ date?: string }>;
}

export default async function BookPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const user = await getCurrentUser();
  if (!user || !user.customerId) redirect("/login");

  // 取顧客資料（含有效 wallets）
  const customer = await prisma.customer.findUnique({
    where: { id: user.customerId },
    include: {
      planWallets: {
        where: { status: "ACTIVE" },
        include: { plan: { select: { name: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!customer) redirect("/login");

  const hasValidWallet =
    customer.selfBookingEnabled &&
    customer.planWallets.some((w) => w.remainingSessions > 0);

  const days = getNext14Days();
  const today = days[0].date;
  const selectedDate = params.date ?? today;

  // 確認 selectedDate 在有效範圍內
  const validDate = days.find((d) => d.date === selectedDate)
    ? selectedDate
    : today;

  // 取當天可用時段
  const dayAvail = hasValidWallet ? await listAvailableSlots(validDate) : null;

  // 計算未來有效預約數（用於顯示剩餘配額）
  const futureBookingCount = hasValidWallet
    ? await prisma.booking.count({
        where: {
          customerId: user.customerId,
          bookingStatus: { in: ["PENDING", "CONFIRMED"] },
          bookingDate: {
            gte: new Date(new Date().setHours(0, 0, 0, 0)),
          },
        },
      })
    : 0;

  const totalRemaining = customer.planWallets.reduce(
    (s, w) => s + w.remainingSessions,
    0
  );
  const remainingQuota = Math.max(0, totalRemaining - futureBookingCount);

  return (
    <div>
      <h1 className="mb-6 text-xl font-bold text-gray-900">線上預約</h1>

      {/* 未購課 / 無資格 */}
      {!hasValidWallet && (
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm">
          <div className="mb-3 text-4xl">🌿</div>
          <h2 className="mb-2 text-base font-semibold text-gray-800">
            尚未開放自助預約
          </h2>
          <p className="text-sm text-gray-500">
            請聯繫您的直屬店長，協助為您安排預約或購買課程方案。
          </p>
          {customer.selfBookingEnabled && (
            <p className="mt-2 text-xs text-yellow-600">
              ⚠ 目前無有效課程堂數，請先購買課程方案。
            </p>
          )}
        </div>
      )}

      {/* 可預約 */}
      {hasValidWallet && (
        <>
          {/* 剩餘配額提示 */}
          <div className="mb-4 rounded-lg bg-indigo-50 px-4 py-3 text-sm">
            <span className="text-indigo-700">
              剩餘可預約：
              <strong className="text-lg"> {remainingQuota} </strong>
              堂
            </span>
            <span className="ml-3 text-xs text-indigo-400">
              （已有 {futureBookingCount} 筆未完成預約，課程剩餘 {totalRemaining} 堂）
            </span>
          </div>

          {remainingQuota <= 0 ? (
            <div className="rounded-xl border bg-yellow-50 p-4 text-sm text-yellow-700">
              目前預約數已達課程剩餘堂數上限，請完成已預約的課程後再繼續預約。
            </div>
          ) : (
            <>
              {/* 日期選擇 */}
              <div className="mb-4">
                <p className="mb-2 text-xs text-gray-500">選擇日期</p>
                <div className="flex gap-1.5 overflow-x-auto pb-1">
                  {days.map((d) => (
                    <a
                      key={d.date}
                      href={`?date=${d.date}`}
                      className={`flex min-w-[52px] flex-col items-center rounded-xl border px-2 py-2 text-center text-xs transition-colors ${
                        d.date === validDate
                          ? "border-indigo-500 bg-indigo-600 text-white"
                          : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                      }`}
                    >
                      <span className="font-medium">{d.label}</span>
                      <span className={d.date === validDate ? "text-indigo-200" : "text-gray-400"}>
                        （{d.day}）
                      </span>
                    </a>
                  ))}
                </div>
              </div>

              {/* 時段選擇 + 預約表單 */}
              {dayAvail && (
                <BookingForm
                  customerId={user.customerId}
                  selectedDate={validDate}
                  slots={dayAvail.slots}
                  activeWallets={customer.planWallets.map((w) => ({
                    id: w.id,
                    planName: w.plan.name,
                    remainingSessions: w.remainingSessions,
                  }))}
                />
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
