import { getCurrentUser } from "@/lib/session";
import { getStoreContext } from "@/lib/store-context";
import { getMyReferralSummary } from "@/server/queries/my-referral-summary";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ShareReferral } from "@/components/share-referral";
import { buildReferralEntryUrl } from "@/lib/share";

export default async function MyReferralsPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "CUSTOMER" || !user.customerId) redirect("/");

  const storeCtx = await getStoreContext();
  const storeSlug = storeCtx?.storeSlug ?? "zhubei";
  const storeId = storeCtx?.storeId ?? null;
  const referralUrl = buildReferralEntryUrl(storeSlug, user.customerId);

  const summary = await getMyReferralSummary(user.customerId, {
    activeStoreId: storeId,
  });

  // 進度條：朝下一個里程碑推進
  const milestone = summary.nextMilestone;
  const progress = milestone
    ? Math.min(100, ((milestone.target - milestone.remaining) / milestone.target) * 100)
    : 100;

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <Link href="/book" className="text-earth-400 hover:text-earth-600 lg:hidden">
          &larr;
        </Link>
        <h1 className="text-xl font-bold text-earth-900">我分享的朋友</h1>
      </div>

      <div className="space-y-6">
        {/* ═══ 輕成就區：只顯示行為數，不顯示轉換率/業績 ═══ */}
        <section className="rounded-2xl border border-earth-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-semibold text-earth-700">朋友因你做了這些事</p>
          <div className="mt-3 grid grid-cols-3 gap-3">
            <StatCell label="朋友來店" value={summary.visitedCount} unit="位" highlight />
            <StatCell label="朋友加入" value={summary.lineJoinCount} unit="位" />
            <StatCell label="我分享過" value={summary.shareCount} unit="次" />
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-earth-400">
            每一次分享都是一次善意，不用有壓力。
          </p>
        </section>

        {/* ═══ 下一個回饋 ═══ */}
        {milestone && (
          <section className="rounded-2xl border border-amber-200 bg-amber-50/60 p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-amber-900">{milestone.label}</p>
              <p className="text-xs text-amber-700">
                還差 <span className="font-bold">{milestone.remaining}</span> 點
              </p>
            </div>
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white">
              <div
                className="h-full bg-amber-500 transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="mt-2 text-[11px] text-amber-700/80">
              目前 {summary.totalPoints} 點 · 目標 {milestone.target} 點
            </p>
          </section>
        )}

        {/* ═══ 分享卡 ═══ */}
        <section className="rounded-2xl border border-earth-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-semibold text-earth-700">分享給朋友</p>
          <p className="mt-1 text-xs text-earth-500">
            一鍵 LINE 分享，或複製連結貼給想到的朋友。
          </p>
          <div className="mt-3">
            <ShareReferral
              referralUrl={referralUrl}
              variant="full"
              referralCount={summary.lineJoinCount}
              storeId={storeId ?? undefined}
              referrerId={user.customerId}
              source="my-referrals"
            />
          </div>
        </section>

        {/* ═══ 完整積分紀錄入口 ═══ */}
        <Link
          href="/my-points"
          className="flex items-center justify-between rounded-xl bg-white px-4 py-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition hover:shadow-[0_1px_4px_rgba(0,0,0,0.1)]"
        >
          <div>
            <p className="text-sm font-medium text-earth-800">查看完整積分紀錄</p>
            <p className="text-xs text-earth-400">所有點數來源與歷史明細</p>
          </div>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-earth-300">
            <path d="M9 5l7 7-7 7" />
          </svg>
        </Link>
      </div>
    </div>
  );
}

function StatCell({
  label,
  value,
  unit,
  highlight = false,
}: {
  label: string;
  value: number;
  unit: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-xl px-3 py-3 text-center ${
        highlight ? "bg-primary-50" : "bg-earth-50"
      }`}
    >
      <p className="text-[11px] text-earth-500">{label}</p>
      <p
        className={`mt-1 text-2xl font-bold ${
          highlight ? "text-primary-700" : "text-earth-800"
        }`}
      >
        {value}
      </p>
      <p className="text-[11px] text-earth-400">{unit}</p>
    </div>
  );
}
