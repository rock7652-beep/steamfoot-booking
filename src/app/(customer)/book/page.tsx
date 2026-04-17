import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { getStoreContext } from "@/lib/store-context";
import { getHealthCardData } from "@/server/queries/health-card";
import { getMyReferralSummary } from "@/server/queries/my-referral-summary";
import { redirect } from "next/navigation";
import Link from "next/link";
import { HealthAssessmentCard } from "@/components/health-assessment-card";
import { ShareReferral } from "@/components/share-referral";
import { buildReferralEntryUrl } from "@/lib/share";

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

export default async function CustomerHomePage() {
  const user = await getCurrentUser();
  if (!user || !user.customerId) redirect("/");

  const storeCtx = await getStoreContext();
  const storeSlug = storeCtx?.storeSlug ?? "zhubei";

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
      getMyReferralSummary(user.customerId),
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
  const aiHealthUrl = `https://www.healthflow-ai.com/liff?customerId=${user.customerId}`;

  return (
    <div className="space-y-5">
      {/* ═══ Hero：歡迎回來 + 主要 CTA ═══ */}
      <section className="rounded-2xl bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
        <p className="text-lg font-semibold text-earth-900">歡迎回來，{user.name}</p>

        {nextBooking ? (
          <div className="mt-3 rounded-xl bg-primary-50/70 px-4 py-3">
            <p className="text-sm font-medium text-primary-800">
              最近一次預約：
              {new Date(nextBooking.bookingDate).toLocaleDateString("zh-TW", {
                month: "long",
                day: "numeric",
                weekday: "short",
              })}{" "}
              {nextBooking.slotTime}
            </p>
            {reminderText && (
              <p className="mt-0.5 text-xs text-primary-600">{reminderText}</p>
            )}
          </div>
        ) : (
          <p className="mt-2 text-sm text-earth-400">目前沒有即將到來的預約</p>
        )}

        <div className="mt-3 flex items-center gap-4 text-sm text-earth-500">
          {remaining > 0 ? (
            <span>
              剩餘可預約 <strong className="text-primary-700">{remaining}</strong> 堂
            </span>
          ) : (
            <span>尚未購買方案</span>
          )}
          {makeupCount > 0 && (
            <span>
              補課 <strong className="text-amber-600">{makeupCount}</strong> 次
            </span>
          )}
        </div>

        {/* Hero CTA：立即預約 + 查看方案 + AI健康評估 */}
        <div className="mt-4 space-y-2">
          <Link
            href="/book/new"
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary-600 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-primary-700 active:scale-[0.98]"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            立即預約下一次
          </Link>
          <div className="grid grid-cols-2 gap-2">
            <Link
              href="/my-plans"
              className="flex items-center justify-center gap-1.5 rounded-xl border border-earth-200 bg-white py-2.5 text-sm font-medium text-earth-700 hover:bg-earth-50"
            >
              查看我的方案
            </Link>
            <a
              href={aiHealthUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-1.5 rounded-xl border border-earth-200 bg-white py-2.5 text-sm font-medium text-earth-700 hover:bg-earth-50"
            >
              AI健康評估
            </a>
          </div>
        </div>
      </section>

      {/* ═══ AI 健康分數 (有資料才顯示) ═══ */}
      {healthCard?.available && (
        <HealthAssessmentCard score={healthCard.score} customerId={user.customerId} />
      )}

      {/* ═══ 快速功能 ═══ */}
      <section>
        <p className="mb-2 px-1 text-xs font-medium text-earth-500">快速功能</p>
        <div className="grid gap-2">
          <QuickLink
            href="/book/new"
            label="新增預約"
            description="挑選日期與時段"
            icon="plus"
          />
          <QuickLink
            href="/my-bookings"
            label="我的預約"
            description="即將到來與歷史紀錄"
            icon="calendar"
          />
          <QuickLink
            href="/my-plans"
            label="我的方案"
            description="課程餘額與使用紀錄"
            icon="wallet"
          />
          <QuickLink
            href={aiHealthUrl}
            label="AI健康評估"
            description="查看您的 AI 健康分析報告"
            icon="external"
            external
          />
          <QuickLink
            href="/profile"
            label="我的資料"
            description="基本資料與修改密碼"
            icon="user"
          />
        </div>
      </section>

      {/* ═══ 推薦朋友卡（主推） ═══ */}
      <section className="rounded-2xl border border-primary-100 bg-gradient-to-br from-white to-primary-50/40 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
        <div className="mb-3 flex items-start justify-between">
          <div>
            <p className="text-base font-semibold text-earth-900">推薦朋友一起體驗</p>
            <p className="mt-0.5 text-xs text-earth-500">分享專屬連結，給朋友一次安心的選擇</p>
          </div>
          <span className="rounded-full bg-primary-600 px-2 py-0.5 text-[10px] font-semibold text-white">
            主推
          </span>
        </div>

        <ShareReferral referralUrl={referralUrl} variant="compact" />

        <Link
          href="/my-referrals"
          className="mt-3 flex items-center justify-between rounded-xl bg-white px-3 py-2 text-sm text-earth-700 hover:bg-earth-50"
        >
          <span className="flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-primary-600">
              <path d="M16 17l5-5-5-5M21 12H9" />
              <path d="M14 4H6a2 2 0 00-2 2v12a2 2 0 002 2h8" />
            </svg>
            查看我的推薦
            {referralSummary && referralSummary.shareCount > 0 && (
              <span className="rounded-full bg-primary-100 px-2 py-0.5 text-[10px] font-medium text-primary-700">
                已分享 {referralSummary.shareCount}
              </span>
            )}
          </span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-earth-300">
            <path d="M9 5l7 7-7 7" />
          </svg>
        </Link>
      </section>

      {/* ═══ 條件式成長卡 (OR：shareCount>=1 OR lineJoinCount>=1 OR visitedCount>=1) ═══ */}
      {referralSummary?.growthEligible && (
        <section className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-amber-100/40 p-5 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-100">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-amber-600">
                <path d="M12 2L4 7l8 5 8-5-8-5z" />
                <path d="M4 12l8 5 8-5M4 17l8 5 8-5" />
              </svg>
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-base font-semibold text-amber-900">你已經開始影響身邊的人</p>
              <p className="mt-0.5 text-xs text-amber-800/80">
                你帶動了 {referralSummary.lineJoinCount} 位朋友加入，{referralSummary.visitedCount} 位實際到店
              </p>
            </div>
          </div>

          <Link
            href="/my-growth"
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-amber-600 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-amber-700"
          >
            查看我的成長
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </section>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// 子元件
// ─────────────────────────────────────────────────────────

const ICON_PATHS: Record<string, string[]> = {
  plus: ["M12 4.5v15m7.5-7.5h-15"],
  calendar: [
    "M6.75 3v2.25M17.25 3v2.25",
    "M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5",
  ],
  wallet: [
    "M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 110-6h5.25A2.25 2.25 0 0121 6v6z",
    "M21 12v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18V6a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 6",
  ],
  user: [
    "M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z",
    "M4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z",
  ],
  external: [
    "M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5",
    "M7.5 16.5L21 3m0 0h-5.25M21 3v5.25",
  ],
};

function QuickLink({
  href,
  label,
  description,
  icon,
  external = false,
}: {
  href: string;
  label: string;
  description: string;
  icon: string;
  external?: boolean;
}) {
  const className =
    "flex items-center gap-3.5 rounded-xl bg-white px-4 py-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition hover:shadow-[0_1px_4px_rgba(0,0,0,0.1)]";
  const paths = ICON_PATHS[icon] ?? ICON_PATHS.user;

  const inner = (
    <>
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-50">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-primary-600">
          {paths.map((d, i) => (
            <path key={i} d={d} />
          ))}
        </svg>
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-earth-800">{label}</p>
        <p className="text-xs text-earth-400">{description}</p>
      </div>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-earth-300">
        <path d="M9 5l7 7-7 7" />
      </svg>
    </>
  );

  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
        {inner}
      </a>
    );
  }
  return (
    <Link href={href} className={className}>
      {inner}
    </Link>
  );
}
