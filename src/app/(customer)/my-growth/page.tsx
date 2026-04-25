import { getCurrentUser } from "@/lib/session";
import { getStoreContext } from "@/lib/store-context";
import { getMyReferralSummary } from "@/server/queries/my-referral-summary";
import { redirect } from "next/navigation";
import Link from "next/link";

/**
 * 我的進度 — 條件式顯示
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
  const prefix = `/s/${storeCtx?.storeSlug ?? "zhubei"}`;

  const summary = await getMyReferralSummary(user.customerId, {
    activeStoreId: storeId,
  });
  if (!summary.growthEligible) redirect(`${prefix}/book`);

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <Link href={`${prefix}/book`} className="flex min-h-[44px] min-w-[44px] items-center justify-center text-earth-700 hover:text-earth-900 lg:hidden">
          &larr;
        </Link>
        <h1 className="text-2xl font-bold text-earth-900">我的進度</h1>
      </div>

      <div className="space-y-6">
        {/* ═══ 開頭文案（輕語氣，不用經營/培育） ═══ */}
        <section className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-amber-100/40 p-6 shadow-sm">
          <p className="text-lg leading-relaxed font-semibold text-amber-900">
            你最近的變化，其實比你想像的多。
          </p>
          <p className="mt-2 text-base text-amber-900">
            每一次照顧自己、每一次分享，都是一點點好的改變。
          </p>
        </section>

        {/* ═══ 三項指標（前台中性語言：已分享 / 朋友加入 / 來體驗） ═══ */}
        <section className="grid grid-cols-3 gap-3">
          <Metric label="已分享" value={summary.shareCount} unit="次" />
          <Metric label="朋友加入" value={summary.lineJoinCount} unit="位" />
          <Metric label="來體驗" value={summary.visitedCount} unit="位" highlight />
        </section>

        {/* ═══ 累積點數（既有資料，不新增） ═══ */}
        <section className="rounded-2xl border border-earth-200 bg-white p-6 shadow-sm">
          <p className="text-base font-medium text-earth-700">累積點數</p>
          <p className="mt-1 text-4xl font-bold text-primary-700">
            {summary.totalPoints}
            <span className="ml-2 text-lg font-medium text-earth-800">點</span>
          </p>
          <p className="mt-3 text-base leading-relaxed text-earth-800">
            你已經開始影響身邊的人了，再多一點點，你會看到更不一樣的結果。
          </p>
        </section>

        {/* ═══ 導航連結（用更輕的語言） ═══ */}
        <section className="grid grid-cols-2 gap-3">
          <Link
            href={`${prefix}/my-referrals`}
            className="flex min-h-[52px] items-center justify-center rounded-xl border border-earth-300 bg-white text-base font-semibold text-earth-800 hover:bg-earth-50"
          >
            我的好康
          </Link>
          <Link
            href={`${prefix}/my-points`}
            className="flex min-h-[52px] items-center justify-center rounded-xl border border-earth-300 bg-white text-base font-semibold text-earth-800 hover:bg-earth-50"
          >
            點數紀錄
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
      <p className="text-sm font-medium text-earth-700">{label}</p>
      <p
        className={`mt-1 text-3xl font-bold ${
          highlight ? "text-amber-700" : "text-earth-900"
        }`}
      >
        {value}
      </p>
      <p className="mt-1 text-sm text-earth-700">{unit}</p>
    </div>
  );
}
