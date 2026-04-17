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

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <Link href="/book" className="text-earth-400 hover:text-earth-600 lg:hidden">
          &larr;
        </Link>
        <h1 className="text-xl font-bold text-earth-900">我的進步</h1>
      </div>

      <div className="space-y-6">
        {/* ═══ 開頭文案 ═══ */}
        <section className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-amber-100/40 p-6 shadow-sm">
          <p className="text-base leading-relaxed text-amber-900">
            每一次照顧自己、每一次分享，都是生活裡一點點好的改變。
          </p>
        </section>

        {/* ═══ 三項指標（排序依 spec：我分享過 → 朋友開始了解 → 朋友來店體驗）═══ */}
        <section className="grid grid-cols-3 gap-3">
          <Metric label="我分享過" value={summary.shareCount} unit="次" />
          <Metric label="朋友開始了解" value={summary.lineJoinCount} unit="位" />
          <Metric label="朋友來店體驗" value={summary.visitedCount} unit="位" highlight />
        </section>

        {/* ═══ 底部文案 ═══ */}
        <section className="rounded-2xl border border-earth-200 bg-white p-5 shadow-sm">
          <p className="text-sm leading-relaxed text-earth-600">
            不用特別做什麼，想到適合的人時，再分享就很好。
          </p>
        </section>

        {/* ═══ 導航連結 ═══ */}
        <section className="grid grid-cols-2 gap-2">
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
