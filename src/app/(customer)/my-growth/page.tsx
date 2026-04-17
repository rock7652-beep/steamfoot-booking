import { getCurrentUser } from "@/lib/session";
import { getStoreContext } from "@/lib/store-context";
import { getMyReferralSummary } from "@/server/queries/my-referral-summary";
import { redirect } from "next/navigation";
import Link from "next/link";

/**
 * 我的成長 — 條件式顯示
 *
 * 觸發條件 (OR)：
 *   shareCount >= 1
 *   或 lineJoinCount >= 1
 *   或 visitedCount >= 1
 *
 * 任一「實際推薦行為」即顯示，不使用 readiness / tier。
 * 不符條件者導回首頁，避免成為「永遠看得到、永遠進不來」的死路。
 */
export default async function MyGrowthPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "CUSTOMER" || !user.customerId) redirect("/");

  const storeCtx = await getStoreContext();
  const storeId = storeCtx?.storeId ?? null;

  const summary = await getMyReferralSummary(user.customerId, {
    activeStoreId: storeId,
  });
  if (!summary.growthEligible) redirect("/book");

  // 成長進度條：以 5 位朋友來店為一個象徵性里程碑
  const visitGoal = Math.max(5, summary.visitedCount);
  const visitProgress = Math.min(100, (summary.visitedCount / visitGoal) * 100);

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <Link href="/book" className="text-earth-400 hover:text-earth-600 lg:hidden">
          &larr;
        </Link>
        <h1 className="text-xl font-bold text-earth-900">我的成長</h1>
      </div>

      <div className="space-y-6">
        {/* ═══ 主視覺：你已經開始影響身邊的人 ═══ */}
        <section className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-amber-100/40 p-6 shadow-sm">
          <p className="text-base font-semibold text-amber-900">
            你已經開始影響身邊的人
          </p>
          <p className="mt-2 text-sm leading-relaxed text-amber-800/90">
            你的分享，讓 {summary.lineJoinCount} 位朋友願意嘗試，{summary.visitedCount} 位已經實際走進店裡感受。
            這份信任，正在慢慢累積成你獨有的影響力。
          </p>
        </section>

        {/* ═══ 三項指標 ═══ */}
        <section className="grid grid-cols-3 gap-3">
          <Metric label="幫助朋友數" value={summary.lineJoinCount} unit="位" />
          <Metric label="分享次數" value={summary.shareCount} unit="次" />
          <Metric label="來店體驗數" value={summary.visitedCount} unit="位" highlight />
        </section>

        {/* ═══ 成長進度條 ═══ */}
        <section className="rounded-2xl border border-earth-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-earth-700">成長進度</p>
            <p className="text-xs text-earth-500">
              {summary.visitedCount} / {visitGoal} 位朋友到店
            </p>
          </div>
          <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-earth-100">
            <div
              className="h-full bg-gradient-to-r from-amber-400 to-amber-600 transition-all"
              style={{ width: `${visitProgress}%` }}
            />
          </div>
          <p className="mt-3 text-xs leading-relaxed text-earth-500">
            每一位實際走進店裡的朋友，都代表你的推薦真正幫到了人。持續分享，會看到更明顯的轉化。
          </p>
        </section>

        {/* ═══ 了解更多 ═══ */}
        <section className="rounded-2xl border border-earth-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-semibold text-earth-700">了解更多</p>
          <p className="mt-2 text-xs leading-relaxed text-earth-500">
            如果你對「協助朋友變健康」這件事感興趣，未來會有更多體驗與夥伴計畫的機會。
            想先進一步聊聊？歡迎直接到店或聯繫店長。
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Link
              href="/my-referrals"
              className="flex items-center justify-center rounded-xl border border-earth-200 bg-white py-2.5 text-sm font-medium text-earth-700 hover:bg-earth-50"
            >
              我的推薦
            </Link>
            <Link
              href="/my-points"
              className="flex items-center justify-center rounded-xl border border-earth-200 bg-white py-2.5 text-sm font-medium text-earth-700 hover:bg-earth-50"
            >
              積分紀錄
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}

function Metric({
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
      className={`rounded-xl border px-3 py-4 text-center ${
        highlight
          ? "border-amber-200 bg-amber-50"
          : "border-earth-200 bg-white"
      }`}
    >
      <p className="text-[11px] text-earth-500">{label}</p>
      <p
        className={`mt-1 text-2xl font-bold ${
          highlight ? "text-amber-700" : "text-earth-800"
        }`}
      >
        {value}
      </p>
      <p className="text-[11px] text-earth-400">{unit}</p>
    </div>
  );
}
