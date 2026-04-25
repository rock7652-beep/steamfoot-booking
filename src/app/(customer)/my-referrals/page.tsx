import { getCurrentUser } from "@/lib/session";
import { getStoreContext } from "@/lib/store-context";
import {
  getMyReferralSummary,
  type MyReferralSummary,
} from "@/server/queries/my-referral-summary";
import Link from "next/link";
import { ShareReferral } from "@/components/share-referral";
import { buildReferralEntryUrl } from "@/lib/share";

/**
 * 我的好康 — 把既有 referral / points / growth 資料用更輕鬆的語言整合呈現。
 * 不新增任務系統、不改 schema。
 *
 * Hardening:
 *   - 不做 role 檢查（由 (customer)/layout.tsx 處理）
 *   - 不對沒有 customerId 的情況 redirect("/") — 顯示穩定的 empty state
 *   - DB 查詢失敗時 fallback 空 summary，避免整頁 500
 */
const EMPTY_SUMMARY: MyReferralSummary = {
  visitedCount: 0,
  lineJoinCount: 0,
  shareCount: 0,
  convertedCount: 0,
  totalPoints: 0,
  nextMilestone: { label: "下一個回饋", target: 100, remaining: 100 },
  growthEligible: false,
};

export default async function MyPerksPage() {
  const user = await getCurrentUser();

  const storeCtx = await getStoreContext();
  const storeSlug = storeCtx?.storeSlug ?? "zhubei";
  const storeId = storeCtx?.storeId ?? null;
  const prefix = `/s/${storeSlug}`;

  // 若取不到 customerId（stale session 等邊界情況）— 顯示靜態 empty state，不 redirect
  const customerId = user?.customerId ?? null;
  const referralUrl = customerId ? buildReferralEntryUrl(storeSlug, customerId) : "#";

  let summary: MyReferralSummary = EMPTY_SUMMARY;
  if (customerId) {
    try {
      summary = await getMyReferralSummary(customerId, { activeStoreId: storeId });
    } catch (err) {
      console.error("[my-referrals] getMyReferralSummary failed", err);
      // 保留 EMPTY_SUMMARY，頁面繼續渲染
    }
  }

  const milestone = summary.nextMilestone;
  const progress = milestone
    ? Math.min(100, ((milestone.target - milestone.remaining) / milestone.target) * 100)
    : 100;

  return (
    <div>
      {/* ═══ Header ═══ */}
      <div className="mb-6 flex items-center gap-3">
        <Link href={`${prefix}/book`} className="flex min-h-[44px] min-w-[44px] items-center justify-center text-earth-700 hover:text-earth-900 lg:hidden">
          &larr;
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-earth-900">我的好康</h1>
          <p className="mt-1 text-sm text-earth-700">
            這裡會慢慢累積你的小回饋
          </p>
        </div>
      </div>

      <div className="space-y-5">
        {/* ═══ 區塊 1：今天幫朋友放鬆一下（利他 + 無壓力 + 點數誘因 + 分享 CTA） ═══ */}
        <section className="rounded-2xl border border-primary-100 bg-gradient-to-br from-white to-primary-50/40 p-6 shadow-sm">
          {/* 利他文案 */}
          <p className="text-xl font-bold text-earth-900">
            今天幫朋友放鬆一下
          </p>
          <p className="mt-2 text-base leading-relaxed text-earth-800">
            把你的專屬體驗連結分享給朋友，他來體驗，你拿回饋。
          </p>
          {/* 無壓力提示 */}
          <p className="mt-2 text-sm leading-relaxed text-earth-700">
            不用推銷，對方有興趣再自己了解就好。
          </p>

          {/* 分享 CTA */}
          <div className="mt-5">
            <ShareReferral
              referralUrl={referralUrl}
              variant="compact"
              storeId={storeId ?? undefined}
              referrerId={customerId ?? undefined}
              source="my-perks"
            />
          </div>

          {/* 點數誘因提示（動態：依 milestone.remaining） */}
          {milestone && milestone.remaining > 0 && (
            <div className="mt-4 flex items-start gap-2 rounded-xl bg-amber-50 px-4 py-3">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 flex-shrink-0 text-amber-700">
                <path d="M20 12V22H4V12" />
                <path d="M2 7h20v5H2z" />
                <path d="M12 22V7" />
                <path d="M12 7H7.5a2.5 2.5 0 010-5C11 2 12 7 12 7z" />
                <path d="M12 7h4.5a2.5 2.5 0 000-5C13 2 12 7 12 7z" />
              </svg>
              <p className="text-base leading-relaxed text-amber-900">
                再 <span className="font-bold">{milestone.remaining}</span> 點就能解鎖小禮！
              </p>
            </div>
          )}
        </section>

        {/* ═══ 區塊 2：點數進度（大數字 + 進度條 + 差距提示） ═══ */}
        <section className="rounded-2xl border border-amber-200 bg-amber-50/60 p-6 shadow-sm">
          <p className="text-base font-semibold text-amber-900">我的點數</p>
          <p className="mt-2 text-5xl font-bold text-amber-800">
            {summary.totalPoints}
            <span className="ml-2 text-xl font-medium text-amber-800">點</span>
          </p>
          {milestone ? (
            <>
              <div className="mt-4 h-3 w-full overflow-hidden rounded-full bg-white">
                <div
                  className="h-full bg-amber-500 transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
              {/* 進度資訊（中性，不重複上方分享卡的誘因句） */}
              <p className="mt-3 text-sm text-amber-900">
                目前 {summary.totalPoints} 點 · 下一階 {milestone.target} 點（小禮）
              </p>
            </>
          ) : (
            <p className="mt-3 text-sm text-amber-900">已累積到目前上限，持續分享還會再累積好康。</p>
          )}

          {/* 回饋階段提示（對應既有 POINT_VALUES：100 → 200 點） */}
          <div className="mt-5 grid grid-cols-3 gap-2 text-center">
            <RewardTier target={50} current={summary.totalPoints} label="小禮" />
            <RewardTier target={100} current={summary.totalPoints} label="升級禮" />
            <RewardTier target={200} current={summary.totalPoints} label="VIP 好康" />
          </div>
        </section>

        {/* ═══ 區塊 3：數據區（已分享 / 朋友加入 / 來體驗） ═══ */}
        <section className="rounded-2xl border border-earth-200 bg-white p-6 shadow-sm">
          <p className="text-lg font-bold text-earth-900">我的分享</p>
          <div className="mt-4 grid grid-cols-3 gap-3">
            <StatCell label="已分享" value={summary.shareCount} unit="次" />
            <StatCell label="朋友加入" value={summary.lineJoinCount} unit="位" />
            <StatCell label="來體驗" value={summary.visitedCount} unit="位" highlight />
          </div>
          <p className="mt-4 text-sm leading-relaxed text-earth-700">
            每一次分享都是一次善意，不用有壓力。
          </p>
        </section>

        {/* ═══ 區塊 4：點數紀錄入口 ═══ */}
        <Link
          href={`${prefix}/my-points`}
          className="flex min-h-[64px] items-center justify-between rounded-xl bg-white px-5 py-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition hover:shadow-[0_1px_4px_rgba(0,0,0,0.1)]"
        >
          <div>
            <p className="text-base font-semibold text-earth-900">查看我的點數紀錄</p>
            <p className="mt-1 text-sm text-earth-700">所有點數來源與歷史明細</p>
          </div>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-earth-600">
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
      className={`rounded-lg px-2 py-3 ${
        unlocked
          ? "bg-amber-100 text-amber-900"
          : "bg-white/70 text-amber-800"
      }`}
    >
      <p className="text-base font-bold">{target} 點</p>
      <p className="mt-1 text-sm font-medium">{label}</p>
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
      className={`rounded-xl px-3 py-4 text-center ${
        highlight ? "bg-primary-50" : "bg-earth-50"
      }`}
    >
      <p className="text-sm font-medium text-earth-700">{label}</p>
      <p
        className={`mt-1 text-3xl font-bold ${
          highlight ? "text-primary-700" : "text-earth-900"
        }`}
      >
        {value}
      </p>
      <p className="mt-1 text-sm text-earth-700">{unit}</p>
    </div>
  );
}
