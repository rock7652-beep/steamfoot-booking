import { getCurrentUser } from "@/lib/session";
import { getStoreContext } from "@/lib/store-context";
import { getMyReferralSummary } from "@/server/queries/my-referral-summary";
import { redirect } from "next/navigation";
import Link from "next/link";

/**
 * 我的進步 — 條件式顯示
 *
 * 觸發條件 (OR)：
 *   shareCount >= 1
 *   或 lineJoinCount >= 1
 *   或 visitedCount >= 1
 *
 * 任一「實際分享行為」即顯示。
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

  // 進度條：以 5 位朋友來店為一個象徵性里程碑
  const visitGoal = Math.max(5, summary.visitedCount);
  const visitProgress = Math.min(100, (summary.visitedCount / visitGoal) * 100);

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <Link href="/book" className="text-earth-400 hover:text-earth-600 lg:hidden">
          &larr;
        </Link>
        <h1 className="text-xl font-bold text-earth-900">我的進步</h1>
      </div>

      <div className="space-y-6">
        {/* ═══ 主視覺：你的分享正在改變朋友 ═══ */}
        <section className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-amber-100/40 p-6 shadow-sm">
          <p className="text-base font-semibold text-amber-900">
            你的分享帶來了一點改變
          </p>
          <p className="mt-2 text-sm leading-relaxed text-amber-800/90">
            你分享過的連結，讓 {summary.lineJoinCount} 位朋友願意試試看，{summary.visitedCount} 位已經走進店裡感受。
            一份輕輕的好意，慢慢在朋友身上發生。
          </p>
        </section>

        {/* ═══ 三項指標（輕成就區，不顯示業績/轉換率）═══ */}
        <section className="grid grid-cols-3 gap-3">
          <Metric label="分享次數" value={summary.shareCount} unit="次" />
          <Metric label="朋友加入" value={summary.lineJoinCount} unit="位" />
          <Metric label="朋友來店" value={summary.visitedCount} unit="位" highlight />
        </section>

        {/* ═══ 進步進度條 ═══ */}
        <section className="rounded-2xl border border-earth-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-earth-700">我的進步</p>
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
            每一位朋友到店，都是你那次分享真的發揮作用。不用急，慢慢來。
          </p>
        </section>

        {/* ═══ 了解更多 ═══ */}
        <section className="rounded-2xl border border-earth-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-semibold text-earth-700">想多聊聊</p>
          <p className="mt-2 text-xs leading-relaxed text-earth-500">
            如果你喜歡這樣幫助身邊的朋友，未來有新的分享方式，我們會讓你先知道。
            想先聊聊？歡迎直接到店。
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Link
              href="/my-referrals"
              className="flex items-center justify-center rounded-xl border border-earth-200 bg-white py-2.5 text-sm font-medium text-earth-700 hover:bg-earth-50"
            >
              我分享的朋友
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
