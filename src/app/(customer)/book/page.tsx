import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { getStoreContext } from "@/lib/store-context";
import { getHealthCardData } from "@/server/queries/health-card";
import { getMyReferralSummary } from "@/server/queries/my-referral-summary";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ShareContactActions } from "./share-contact-actions";
import { buildReferralEntryUrl } from "@/lib/share";
import { getHealthAssessmentUrl } from "@/lib/health-assessment";
import { totalAvailableToBook } from "@/lib/wallet-availability";
import { toLocalDateStr } from "@/lib/date-utils";

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
 * 顧客首頁 v2 — 提高第一屏資訊密度
 *
 * 第一屏（mobile）目標：Hero 預約 + 健康評估 + 分享連結都看得到。
 * 不縮整體字體，只縮 padding / gap / 次要文字行高。
 *
 * 卡片順序：
 *   1. Hero（預約 — 主 CTA）
 *   2. 健康評估 + 分享好友（合併卡，divider 分段）
 *   3. 回饋進度（totalPoints > 0 才顯示，第二屏）
 *   4. 我的進度（visitedCount >= 1 || totalPoints >= 100 才顯示，第二屏）
 */
export default async function CustomerHomePage() {
  const user = await getCurrentUser();
  if (!user || !user.customerId) redirect("/");

  const storeCtx = await getStoreContext();
  const storeSlug = storeCtx?.storeSlug ?? "zhubei";
  const storeId = storeCtx?.storeId ?? null;
  const prefix = `/s/${storeSlug}`;

  // ── 並行查詢 ──────────────────────────────────────
  let remaining = 0;
  let nextBooking: { bookingDate: Date; slotTime: string } | null = null;
  let makeupCount = 0;
  let makeupEarliest: Date | null = null;
  let healthCard: Awaited<ReturnType<typeof getHealthCardData>> | null = null;
  let referralSummary: Awaited<ReturnType<typeof getMyReferralSummary>> | null = null;

  try {
    const [wallets, upcoming, credits, hc, summary] = await Promise.all([
      prisma.customerPlanWallet.findMany({
        where: { customerId: user.customerId, status: "ACTIVE" },
        select: {
          remainingSessions: true,
          bookings: {
            where: {
              bookingStatus: { in: ["PENDING", "CONFIRMED"] },
              isMakeup: false,
            },
            select: { bookingStatus: true, isMakeup: true },
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
      prisma.makeupCredit.findMany({
        where: {
          customerId: user.customerId,
          // 多店隔離：與 createBooking 自選券一致 storeId-scoped
          ...(storeId ? { storeId } : {}),
          isUsed: false,
          OR: [{ expiredAt: null }, { expiredAt: { gte: new Date() } }],
        },
        select: { expiredAt: true },
        // 最早到期優先（nulls last）→ credits[0] 即最早到期
        orderBy: [{ expiredAt: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
      }),
      getHealthCardData(user.customerId),
      getMyReferralSummary(user.customerId, { activeStoreId: storeId }),
    ]);
    remaining = totalAvailableToBook(wallets);
    nextBooking = upcoming;
    makeupCount = credits.length;
    makeupEarliest = credits[0]?.expiredAt ?? null;
    healthCard = hc;
    referralSummary = summary;
  } catch {
    // 資料庫查詢失敗時顯示空狀態，不讓整頁掛掉
  }

  const reminderText = nextBooking ? getReminderText(nextBooking.bookingDate, nextBooking.slotTime) : "";
  const referralUrl = buildReferralEntryUrl(storeSlug, user.customerId);
  const aiHealthUrl = getHealthAssessmentUrl(user.customerId);

  const showPerkProgress = !!referralSummary && referralSummary.totalPoints > 0;
  const showMyGrowth =
    !!referralSummary &&
    (referralSummary.visitedCount >= 1 || referralSummary.totalPoints >= 100);

  return (
    <div className="space-y-2.5">
      {/* ═══ 1. Hero（預約 — 主 CTA）═══ */}
      <section className="rounded-[20px] bg-white p-3.5 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
        <p className="text-[22px] font-bold leading-snug text-earth-900">
          今天讓自己舒服一點
        </p>
        <p className="mt-1.5 text-[15px] leading-relaxed text-earth-700">
          放鬆時間，已經幫你準備好了
        </p>

        {nextBooking && (
          <div className="mt-3 rounded-xl bg-primary-50 px-3 py-2">
            <p className="text-[15px] font-semibold text-primary-800">
              你的下一次預約在{" "}
              {new Date(nextBooking.bookingDate).toLocaleDateString("zh-TW", {
                month: "long",
                day: "numeric",
                weekday: "short",
              })}{" "}
              {nextBooking.slotTime}
            </p>
            {reminderText && (
              <p className="mt-0.5 text-[13px] text-primary-700">{reminderText}</p>
            )}
          </div>
        )}

        {(remaining > 0 || makeupCount > 0) && (
          <div className="mt-3 flex items-end gap-6">
            {remaining > 0 && (
              <div>
                <p className="text-[13px] font-medium text-earth-600">剩餘可預約</p>
                <p className="mt-0.5 leading-none">
                  <span className="text-[34px] font-bold text-primary-700">{remaining}</span>
                  <span className="ml-1 text-[16px] font-semibold text-primary-700">堂</span>
                </p>
              </div>
            )}
            {makeupCount > 0 && (
              <div>
                <p className="text-[13px] font-medium text-earth-600">補課</p>
                <p className="mt-0.5 leading-none">
                  <span className="text-[26px] font-bold text-amber-700">{makeupCount}</span>
                  <span className="ml-1 text-[15px] font-semibold text-amber-700">次</span>
                </p>
                {makeupEarliest && (
                  <p className="mt-0.5 text-[11px] text-amber-700">
                    最早到期 {toLocalDateStr(makeupEarliest).split("-").join("/")}
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        <Link
          href={`${prefix}/book/new`}
          className="mt-3.5 flex h-12 w-full items-center justify-center gap-1.5 rounded-2xl bg-primary-600 text-[17px] font-semibold text-white shadow-sm transition hover:bg-primary-700 active:scale-[0.98]"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          立即預約
        </Link>
      </section>

      {/* ═══ 2. 健康評估 + 分享好友（合併）═══ */}
      <section className="rounded-[20px] bg-white p-3.5 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
        {/* 上半段：健康評估 */}
        <div>
          <p className="text-[17px] font-bold text-earth-900">看看你最近的身體狀態</p>
          <p className="mt-1 text-[14px] leading-relaxed text-earth-700">
            用 1 分鐘了解目前的身體指數
          </p>
          {/* PR-H2c：移除 self-computed score 顯示。原本這段對舊 shape 有 type 不匹配
              (healthCard.score 是 object 不是 number)，實際上 prod 從沒 render 過。
              改成「最近量測：YYYY/MM/DD」更直接，且不會與 HealthFlow 原站分數衝突。*/}
          {healthCard?.available && (
            <p className="mt-1 text-[14px] text-primary-700">
              最近量測：
              <span className="font-bold">
                {healthCard.summary.latest?.measuredAt ?? "—"}
              </span>
            </p>
          )}
          <a
            href={aiHealthUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 flex h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-primary-200 bg-primary-50 text-[15px] font-semibold text-primary-700 hover:bg-primary-100"
          >
            開始健康評估
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M7.5 16.5L21 3m0 0h-5.25M21 3v5.25" />
            </svg>
          </a>
        </div>

        {/* divider */}
        <div className="my-3 border-t border-earth-100" />

        {/* 下半段：分享好友 */}
        <div>
          <p className="text-[17px] font-bold text-earth-900">今天有一個小好康</p>
          <p className="mt-1 text-[14px] leading-relaxed text-earth-700">
            分享給朋友，你們都有機會拿到小回饋
          </p>
          <div className="mt-3">
            <ShareContactActions
              referralUrl={referralUrl}
              storeId={storeId ?? undefined}
              referrerId={user.customerId}
            />
          </div>
        </div>
      </section>

      {/* ═══ 3. 回饋進度（第二屏，totalPoints > 0 才顯示） ═══ */}
      {showPerkProgress && referralSummary && (
        <section className="rounded-[20px] border border-amber-200 bg-amber-50/60 p-3.5 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-[15px] font-semibold text-amber-900">已累積回饋</p>
            <p className="text-[28px] font-bold leading-none text-amber-800">
              {referralSummary.totalPoints}
              <span className="ml-1 text-[15px] font-medium">點</span>
            </p>
          </div>
          {referralSummary.nextMilestone ? (
            <>
              <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white">
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
              <p className="mt-2 text-[14px] text-amber-900">
                再 <span className="font-bold">{referralSummary.nextMilestone.remaining}</span> 點就可以解鎖小禮
              </p>
            </>
          ) : (
            <p className="mt-2 text-[14px] text-amber-900">
              已累積到目前上限，持續分享還會再累積。
            </p>
          )}
        </section>
      )}

      {/* ═══ 4. 我的進度（第二屏，條件式） ═══ */}
      {showMyGrowth && (
        <section className="rounded-[20px] bg-white p-3.5 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
          <p className="text-[15px] font-semibold text-earth-900">你最近的分享開始有成果了</p>
          <p className="mt-1 text-[13px] leading-relaxed text-earth-700">
            已經有朋友來體驗，也慢慢累積自己的小成果。
          </p>
          <Link
            href={`${prefix}/my-growth`}
            className="mt-3 flex h-11 w-full items-center justify-center gap-1 rounded-xl border border-earth-300 bg-white text-[15px] font-semibold text-earth-800 hover:bg-earth-50"
          >
            查看我的進度
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </section>
      )}
    </div>
  );
}
