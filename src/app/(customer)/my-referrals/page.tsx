import { getCurrentUser } from "@/lib/session";
import { getStoreContext } from "@/lib/store-context";
import { getMyReferralSummary } from "@/server/queries/my-referral-summary";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ShareReferral } from "@/components/share-referral";
import { buildReferralEntryUrl } from "@/lib/share";

/**
 * 我的好康 — 把既有 referral / points / growth 資料用更輕鬆的語言整合呈現。
 * 不新增任務系統、不改 schema。
 */
export default async function MyPerksPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "CUSTOMER" || !user.customerId) redirect("/");

  const storeCtx = await getStoreContext();
  const storeSlug = storeCtx?.storeSlug ?? "zhubei";
  const storeId = storeCtx?.storeId ?? null;
  const referralUrl = buildReferralEntryUrl(storeSlug, user.customerId);

  const summary = await getMyReferralSummary(user.customerId, {
    activeStoreId: storeId,
  });

  const milestone = summary.nextMilestone;
  const progress = milestone
    ? Math.min(100, ((milestone.target - milestone.remaining) / milestone.target) * 100)
    : 100;

  return (
    <div>
      {/* ═══ Header ═══ */}
      <div className="mb-6 flex items-center gap-3">
        <Link href="/book" className="text-earth-400 hover:text-earth-600 lg:hidden">
          &larr;
        </Link>
        <div>
          <h1 className="text-xl font-bold text-earth-900">我的好康</h1>
          <p className="mt-0.5 text-xs text-earth-500">
            這裡會慢慢累積你的小回饋
          </p>
        </div>
      </div>

      <div className="space-y-5">
        {/* ═══ 區塊 1：今日小好康（行動列表，對應既有 referral 事件點數） ═══ */}
        <section className="rounded-2xl border border-primary-100 bg-gradient-to-br from-white to-primary-50/40 p-5 shadow-sm">
          <p className="text-sm font-semibold text-earth-800">今天的小好康</p>
          <p className="mt-2 text-sm leading-relaxed text-earth-600">
            把這個傳給朋友，你們都有機會拿到小回饋。
          </p>
        </section>

        {/* ═══ 區塊 2：點數進度（大數字 + 進度條 + 差距提示） ═══ */}
        <section className="rounded-2xl border border-amber-200 bg-amber-50/60 p-5 shadow-sm">
          <p className="text-sm font-semibold text-amber-900">我的點數</p>
          <p className="mt-2 text-4xl font-bold text-amber-800">
            {summary.totalPoints}
            <span className="ml-1 text-lg font-medium text-amber-700/70">點</span>
          </p>
          {milestone ? (
            <>
              <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white">
                <div
                  className="h-full bg-amber-500 transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-amber-700/90">
                再 <span className="font-bold">{milestone.remaining}</span> 點就可以解鎖小禮
              </p>
              <p className="mt-0.5 text-[11px] text-amber-700/70">
                目前 {summary.totalPoints} 點 · 下一階 {milestone.target} 點
              </p>
            </>
          ) : (
            <p className="mt-2 text-xs text-amber-700/90">已累積到目前上限，持續分享還會再累積好康。</p>
          )}

          {/* 回饋階段提示（對應既有 POINT_VALUES：100 → 200 點） */}
          <div className="mt-4 grid grid-cols-3 gap-2 text-center text-[11px]">
            <RewardTier target={50} current={summary.totalPoints} label="小禮" />
            <RewardTier target={100} current={summary.totalPoints} label="升級禮" />
            <RewardTier target={200} current={summary.totalPoints} label="VIP 好康" />
          </div>
        </section>

        {/* ═══ 區塊 3：分享成果（輕語言；不提轉介紹 / 成交 / 漏斗） ═══ */}
        <section className="rounded-2xl border border-earth-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-semibold text-earth-700">我的分享</p>
          <div className="mt-3 grid grid-cols-3 gap-3">
            <StatCell label="已分享" value={summary.shareCount} unit="次" />
            <StatCell label="朋友加入" value={summary.lineJoinCount} unit="位" />
            <StatCell label="來體驗" value={summary.visitedCount} unit="位" highlight />
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-earth-400">
            每一次分享都是一次善意，不用有壓力。
          </p>
        </section>

        {/* ═══ 區塊 4：行動區（LINE / 複製連結） ═══ */}
        <section className="rounded-2xl border border-earth-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-semibold text-earth-700">
            有朋友最近也想放鬆一下嗎？
          </p>
          <p className="mt-1 text-xs text-earth-500">
            可以把這個傳給他，對方有興趣再自己了解就好。
          </p>
          <div className="mt-3">
            <ShareReferral
              referralUrl={referralUrl}
              variant="full"
              referralCount={summary.lineJoinCount}
              storeId={storeId ?? undefined}
              referrerId={user.customerId}
              source="my-perks"
            />
          </div>
        </section>

        {/* ═══ 區塊 5：點數紀錄入口 ═══ */}
        <Link
          href="/my-points"
          className="flex items-center justify-between rounded-xl bg-white px-4 py-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition hover:shadow-[0_1px_4px_rgba(0,0,0,0.1)]"
        >
          <div>
            <p className="text-sm font-medium text-earth-800">查看我的點數紀錄</p>
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

function RewardTier({ target, current, label }: { target: number; current: number; label: string }) {
  const unlocked = current >= target;
  return (
    <div
      className={`rounded-lg px-2 py-2 ${
        unlocked
          ? "bg-amber-100 text-amber-800"
          : "bg-white/70 text-amber-700/70"
      }`}
    >
      <p className="font-semibold">{target} 點</p>
      <p className="mt-0.5 text-[10px]">{label}</p>
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
