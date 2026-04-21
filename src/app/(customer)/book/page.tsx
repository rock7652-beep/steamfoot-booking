import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { getStoreContext } from "@/lib/store-context";
import { getHealthCardData } from "@/server/queries/health-card";
import { getMyReferralSummary } from "@/server/queries/my-referral-summary";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ShareReferral } from "@/components/share-referral";
import { buildReferralEntryUrl } from "@/lib/share";
import { getHealthAssessmentUrl } from "@/lib/health-assessment";

/** 計算距離提醒文案 */
function getReminderText(bookingDate: Date, slotTime: string): string {
  const now = new Date();
  const [h, m] = slotTime.split(":").map(Number);
  const target = new Date(bookingDate);
  target.setHours(h, m, 0, 0);

  const diffMs = target.getTime() - now.getTime();
  if (diffMs < 0) return "";

  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays === 0 && diffHours <= 3) return `${diffHours} 小時後就到了，準備出發吧`;
  if (diffDays === 0) return `今天 ${slotTime}，記得來喔`;
  if (diffDays === 1) return `明天 ${slotTime}，記得來喔`;
  if (diffDays === 2) return `後天 ${slotTime}，別忘了`;
  if (diffDays <= 7) return `${diffDays} 天後，期待你的到來`;
  return "";
}

/**
 * 顧客首頁
 *
 * 卡片順序（v1.0 精簡版）：
 *   1. Hero（預約）
 *   2. AI 健康評估（主推）
 *   3. 今日小好康
 *   4. 回饋進度（totalPoints > 0）
 *   5. 我的進度（visitedCount >= 1 || totalPoints >= 100）
 */
export default async function CustomerHomePage() {
  const user = await getCurrentUser();
  if (!user || !user.customerId) redirect("/");

  const storeCtx = await getStoreContext();
  const storeSlug = storeCtx?.storeSlug ?? "zhubei";
  const storeId = storeCtx?.storeId ?? null;

  // ── 並行查詢 ──────────────────────────────────────
  let remaining = 0;
  let nextBooking: { bookingDate: Date; slotTime: string } | null = null;
  let makeupCount = 0;
  let healthCard: Awaited<ReturnType<typeof getHealthCardData>> | null = null;
  let referralSummary: Awaited<ReturnType<typeof getMyReferralSummary>> | null = null;

  try {
    const [wallets, upcoming, credits, hc, summary] = await Promise.all([
      prisma.customerPlanWallet.findMany({
        where: { customerId: user.customerId, status: "ACTIVE" },
        select: {
          totalSessions: true,
          bookings: {
            where: {
              bookingStatus: { in: ["COMPLETED", "NO_SHOW", "CONFIRMED", "PENDING"] },
              isMakeup: false,
            },
            select: { bookingStatus: true, people: true },
          },
        },
      }),
      prisma.booking.findFirst({
        where: {
          customerId: user.customerId,
          bookingStatus: { in: ["CONFIRMED", "PENDING"] },
          bookingDate: { gte: new Date() },
        },
        select: { bookingDate: true, slotTime: true },
        orderBy: [{ bookingDate: "asc" }, { slotTime: "asc" }],
      }),
      prisma.makeupCredit.count({
        where: {
          customerId: user.customerId,
          isUsed: false,
          OR: [{ expiredAt: null }, { expiredAt: { gte: new Date() } }],
        },
      }),
      getHealthCardData(user.customerId),
      getMyReferralSummary(user.customerId, { activeStoreId: storeId }),
    ]);
    remaining = wallets.reduce((sum, w) => {
      const used = w.bookings
        .filter((b) => b.bookingStatus === "COMPLETED" || b.bookingStatus === "NO_SHOW")
        .reduce((s, b) => s + b.people, 0);
      const preDeducted = w.bookings
        .filter((b) => b.bookingStatus === "CONFIRMED" || b.bookingStatus === "PENDING")
        .reduce((s, b) => s + b.people, 0);
      return sum + (w.totalSessions - used - preDeducted);
    }, 0);
    nextBooking = upcoming;
    makeupCount = credits;
    healthCard = hc;
    referralSummary = summary;
  } catch {
    // 資料庫查詢失敗時顯示空狀態，不讓整頁掛掉
  }

  const reminderText = nextBooking ? getReminderText(nextBooking.bookingDate, nextBooking.slotTime) : "";
  const referralUrl = buildReferralEntryUrl(storeSlug, user.customerId);
  const aiHealthUrl = getHealthAssessmentUrl(user.customerId);

  // 條件式：回饋進度（totalPoints > 0）
  const showPerkProgress = !!referralSummary && referralSummary.totalPoints > 0;
  // 條件式：我的進度（visitedCount >= 1 || totalPoints >= 100）
  const showMyGrowth =
    !!referralSummary &&
    (referralSummary.visitedCount >= 1 || referralSummary.totalPoints >= 100);

  return (
    <div className="space-y-5">
      {/* ═══ 1. Hero（預約）═══ */}
      <section className="rounded-2xl bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
        <p className="text-[24px] font-bold leading-tight text-earth-900">
          今天讓自己更舒服一點
        </p>
        <p className="mt-2 text-base leading-relaxed text-earth-700">
          你的放鬆時間，已經幫你準備好了
        </p>

        {/* 下次預約提醒（有才顯示） */}
        {nextBooking && (
          <div className="mt-4 rounded-xl bg-primary-50 px-4 py-3">
            <p className="text-base font-semibold text-primary-800">
              你的下一次預約在{" "}
              {new Date(nextBooking.bookingDate).toLocaleDateString("zh-TW", {
                month: "long",
                day: "numeric",
                weekday: "short",
              })}{" "}
              {nextBooking.slotTime}
            </p>
            {reminderText && (
              <p className="mt-1 text-sm text-primary-700">{reminderText}</p>
            )}
          </div>
        )}

        {/* 剩餘堂數 / 補課 */}
        {(remaining > 0 || makeupCount > 0) && (
          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1 text-base text-earth-800">
            {remaining > 0 && (
              <span>
                剩餘可預約 <strong className="text-primary-700">{remaining}</strong> 堂
              </span>
            )}
            {makeupCount > 0 && (
              <span>
                補課 <strong className="text-amber-700">{makeupCount}</strong> 次
              </span>
            )}
          </div>
        )}

        {/* 主按鈕：立即預約 */}
        <Link
          href="/book/new"
          className="mt-5 flex w-full min-h-[56px] items-center justify-center gap-2 rounded-2xl bg-primary-600 text-lg font-semibold text-white shadow-sm transition hover:bg-primary-700 active:scale-[0.98]"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          立即預約
        </Link>
      </section>

      {/* ═══ 2. AI 健康評估（主推）═══ */}
      <section className="rounded-2xl border-2 border-primary-200 bg-gradient-to-br from-primary-50 via-white to-primary-50/30 p-6 shadow-[0_2px_8px_rgba(0,0,0,0.08)]">
        <div className="flex items-start gap-3">
          <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-primary-600 text-white">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
            </svg>
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-xl font-bold text-earth-900">
              看看你最近的身體狀態
            </p>
            <p className="mt-1.5 text-base leading-relaxed text-earth-800">
              用 1 分鐘了解目前的身體指數
            </p>
            {healthCard?.available && typeof healthCard.score === "number" && (
              <p className="mt-2 text-base text-primary-700">
                目前分數：<span className="font-bold">{healthCard.score}</span>
              </p>
            )}
          </div>
        </div>

        <a
          href={aiHealthUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-5 flex w-full min-h-[52px] items-center justify-center gap-2 rounded-2xl bg-primary-600 text-base font-semibold text-white shadow-sm transition hover:bg-primary-700 active:scale-[0.98]"
        >
          開始健康評估
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M7.5 16.5L21 3m0 0h-5.25M21 3v5.25" />
          </svg>
        </a>
      </section>

      {/* ═══ 3. 今日小好康（去任務化，不顯示 +10/+5） ═══ */}
      <section className="rounded-2xl bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
        <p className="text-xl font-bold text-earth-900">今天有一個小好康</p>
        <p className="mt-2 text-base leading-relaxed text-earth-700">
          把這個傳給朋友，你們都有機會拿到小回饋。
        </p>

        <div className="mt-4">
          <ShareReferral
            referralUrl={referralUrl}
            variant="compact"
            storeId={storeId ?? undefined}
            referrerId={user.customerId}
            source="book-home"
          />
        </div>

        <Link
          href="/my-referrals"
          className="mt-4 flex min-h-[48px] items-center justify-between rounded-xl bg-earth-50 px-4 text-base font-medium text-earth-800 hover:bg-earth-100/60"
        >
          <span>查看我的好康</span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-earth-600">
            <path d="M9 5l7 7-7 7" />
          </svg>
        </Link>
      </section>

      {/* ═══ 4. 回饋進度（關鍵轉換，totalPoints > 0 才顯示） ═══ */}
      {showPerkProgress && referralSummary && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50/60 p-6 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
          <p className="text-base font-semibold text-amber-900">你已經累積了一些回饋</p>
          <p className="mt-2 text-5xl font-bold text-amber-800">
            {referralSummary.totalPoints}
            <span className="ml-2 text-xl font-medium text-amber-800">點</span>
          </p>
          {referralSummary.nextMilestone ? (
            <>
              <div className="mt-4 h-3 w-full overflow-hidden rounded-full bg-white">
                <div
                  className="h-full bg-amber-500 transition-all"
                  style={{
                    width: `${Math.min(
                      100,
                      ((referralSummary.nextMilestone.target - referralSummary.nextMilestone.remaining) /
                        referralSummary.nextMilestone.target) * 100,
                    )}%`,
                  }}
                />
              </div>
              <p className="mt-3 text-base text-amber-900">
                再 <span className="font-bold">{referralSummary.nextMilestone.remaining}</span> 點就可以解鎖小禮
              </p>
              <p className="mt-1 text-sm text-amber-800">
                再傳給一位朋友，就更接近了
              </p>
            </>
          ) : (
            <p className="mt-3 text-base text-amber-900">
              已累積到目前上限，持續分享還會再累積好康。
            </p>
          )}
        </section>
      )}

      {/* ═══ 5. 我的進度（條件式：visitedCount >= 1 || totalPoints >= 100） ═══ */}
      {showMyGrowth && (
        <section className="rounded-2xl bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
          <p className="text-xl font-bold text-earth-900">你最近的分享開始有成果了</p>
          <p className="mt-2 text-base leading-relaxed text-earth-700">
            已經有朋友來體驗，也慢慢累積自己的小成果。
          </p>
          <Link
            href="/my-growth"
            className="mt-5 flex w-full min-h-[48px] items-center justify-center gap-1.5 rounded-xl border border-earth-300 bg-white text-base font-semibold text-earth-800 hover:bg-earth-50"
          >
            查看我的進度
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </section>
      )}
    </div>
  );
}
