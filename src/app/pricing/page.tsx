import Link from "next/link";
import {
  PRICING_PLAN_INFO,
  PLAN_LIMITS,
} from "@/lib/feature-flags";
import type { PricingPlan } from "@prisma/client";

export const metadata = {
  title: "方案價格 — 蒸足預約管理系統",
  description:
    "限時優惠價方案，從單店基本營運、顧客經營到總部多店管理，選擇最適合你的方案。",
};

// ============================================================
// Data
// ============================================================

const PLAN_PRICE: Record<PricingPlan, string> = {
  EXPERIENCE: "免費",
  BASIC: "NT$ 1,490/月",
  GROWTH: "NT$ 2,490/月",
  ALLIANCE: "NT$ 4,990/月起",
};

const PLAN_ORIGINAL_PRICE: Partial<Record<PricingPlan, string>> = {
  BASIC: "原價 NT$ 2,100/月",
  GROWTH: "原價 NT$ 3,600/月",
  ALLIANCE: "原價 NT$ 7,100/月起",
};

const PLAN_CTA_LABEL: Record<PricingPlan, string> = {
  EXPERIENCE: "免費體驗",
  BASIC: "選擇基礎版",
  GROWTH: "選擇專業版",
  ALLIANCE: "聯繫我們",
};

// Comparison table rows
const COMPARISON_ROWS: {
  label: string;
  basic: string;
  pro: string;
  alliance: string;
}[] = [
  { label: "預約管理", basic: "內含", pro: "內含", alliance: "內含" },
  { label: "顧客管理", basic: "內含", pro: "內含", alliance: "內含" },
  { label: "方案 / 堂數管理", basic: "內含", pro: "內含", alliance: "內含" },
  { label: "基本收款紀錄", basic: "內含", pro: "內含", alliance: "內含" },
  { label: "基本報表", basic: "內含", pro: "內含", alliance: "內含" },
  { label: "前台預約入口", basic: "內含", pro: "內含", alliance: "內含" },
  { label: "LINE 綁定狀態", basic: "內含", pro: "內含", alliance: "內含" },
  { label: "AI 健康評估入口", basic: "內含", pro: "內含", alliance: "內含" },
  { label: "LINE 自動提醒", basic: "$500 工具模組", pro: "$500 工具模組", alliance: "內含" },
  { label: "資料匯出", basic: "$500 工具模組", pro: "$500 工具模組", alliance: "內含" },
  { label: "現金抽屜", basic: "$500 工具模組", pro: "內含", alliance: "內含" },
  { label: "顧客經營", basic: "$800 經營模組", pro: "內含", alliance: "內含" },
  { label: "AI 健康摘要", basic: "$800 經營模組", pro: "$800 經營模組", alliance: "內含" },
  { label: "經營診斷報表", basic: "$800 經營模組", pro: "$800 經營模組", alliance: "內含" },
  { label: "月結管理", basic: "$800 經營模組", pro: "$800 經營模組", alliance: "內含" },
  { label: "多店管理", basic: "-", pro: "-", alliance: "內含" },
  { label: "總部視角", basic: "-", pro: "-", alliance: "內含" },
  { label: "店舖功能開關", basic: "-", pro: "-", alliance: "內含" },
  { label: "合作店長結算管理", basic: "-", pro: "-", alliance: "內含" },
];

// ============================================================
// Page
// ============================================================

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-earth-50 via-white to-earth-50">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-earth-100 bg-white/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="text-lg font-bold text-earth-900">
            蒸足
          </Link>
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="rounded-lg border border-earth-200 px-4 py-2 text-sm font-medium text-earth-700 hover:bg-earth-50"
            >
              登入
            </Link>
            <Link
              href="/register"
              className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
            >
              免費體驗
            </Link>
          </div>
        </div>
      </header>

      <main>
        {/* ── Hero ── */}
        <section className="mx-auto max-w-4xl px-6 pb-16 pt-20 text-center">
          <h1 className="text-3xl font-extrabold tracking-tight text-earth-900 sm:text-5xl">
            蒸足系統方案｜限時優惠價
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-earth-600">
            從單店基本營運、顧客經營到總部多店管理，依門市階段選擇適合方案。
          </p>
          <div className="mx-auto mt-4 flex max-w-md flex-col gap-2 text-left sm:items-center sm:text-center">
            <HeroPoint text="基本預約、顧客、方案堂數與收款管理" />
            <HeroPoint text="顧客回訪、現金管理與經營診斷" />
            <HeroPoint text="總部視角、多店管理與合作店長月結" />
          </div>
          <div className="mt-10 flex flex-wrap justify-center gap-3">
            <Link
              href="/register"
              className="rounded-xl bg-primary-600 px-7 py-3 text-sm font-semibold text-white shadow-md shadow-primary-200 transition hover:bg-primary-700"
            >
              免費體驗
            </Link>
            <a
              href="#plans"
              className="rounded-xl border-2 border-earth-200 px-7 py-3 text-sm font-semibold text-earth-700 transition hover:bg-earth-50"
            >
              查看方案
            </a>
            <a
              href="https://lin.ee/placeholder"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-xl bg-[#06C755] px-7 py-3 text-sm font-semibold text-white shadow-md shadow-green-200 transition hover:brightness-110"
            >
              加 LINE 諮詢
            </a>
          </div>
        </section>

        {/* ── 痛點區 ── */}
        <section className="bg-earth-900 px-6 py-20 text-center text-white">
          <h2 className="text-2xl font-bold sm:text-3xl">
            你是否遇過這些問題？
          </h2>
          <div className="mx-auto mt-10 grid max-w-3xl gap-4 sm:grid-cols-2">
            <PainCard text="預約、堂數、收款分散在 LINE、紙本與 Excel" />
            <PainCard text="不知道誰很久沒來、誰快到期、誰該回訪" />
            <PainCard text="每日現金與交班核對靠人工，容易漏帳" />
            <PainCard text="展店後總部看不到分店營運狀態" />
          </div>
          <p className="mx-auto mt-10 max-w-lg text-base text-earth-300">
            不是只幫你記預約，而是讓店長真的看懂顧客與營收。
          </p>
        </section>

        {/* ── 解法區 ── */}
        <section className="mx-auto max-w-5xl px-6 py-20">
          <h2 className="text-center text-2xl font-bold text-earth-900 sm:text-3xl">
            蒸足系統幫你做到
          </h2>
          <div className="mt-12 grid gap-8 sm:grid-cols-3">
            <SolutionCard
              number="1"
              title="穩定單店營運"
              description="預約、顧客、堂數、收款與基本報表集中管理"
              color="primary"
            />
            <SolutionCard
              number="2"
              title="做好顧客經營"
              description="追蹤久未到店、方案快到期與回訪機會"
              color="amber"
            />
            <SolutionCard
              number="3"
              title="支援多店展店"
              description="總部視角、分店資料與合作店長月結一次到位"
              color="indigo"
            />
          </div>
        </section>

        {/* ── 方案區 ── */}
        <section id="plans" className="scroll-mt-20 bg-earth-50 px-6 py-20">
          <h2 className="text-center text-2xl font-bold text-earth-900 sm:text-3xl">
            選擇你的方案
          </h2>
          <p className="mt-3 text-center text-sm text-earth-500">
            目前為限時優惠價，未來優惠期結束後將依正式原價調整。
          </p>

          <div className="mx-auto mt-12 grid max-w-5xl gap-6 lg:grid-cols-3">
            {/* BASIC */}
            <PlanCard
              plan="BASIC"
              tagline="單店基本營運"
              audience="適合單店先把預約、顧客、方案堂數與收款管理好"
              features={[
                "原價 NT$ 2,100/月",
                "限時優惠價 NT$ 1,490/月",
                "預約管理",
                "顧客管理",
                "方案 / 堂數管理",
                "基本收款紀錄與基本報表",
                "可選 1 個 $500 工具型模組",
              ]}
              locked={[
                "顧客經營",
                "AI 健康摘要",
                "經營診斷報表",
                "月結管理",
              ]}
              accent="primary"
              highlighted={false}
            />

            {/* PRO */}
            <PlanCard
              plan="GROWTH"
              tagline="顧客經營與現場管理"
              audience="適合想做好回訪、續購、現金抽屜與經營判斷的店"
              features={[
                "原價 NT$ 3,600/月",
                "限時優惠價 NT$ 2,490/月",
                "基礎版全部功能",
                "顧客經營",
                "現金抽屜",
                "可選 1 個 $500 工具型模組",
                "可選 1 個 $800 經營型模組",
              ]}
              unlockTitle="適合加強"
              unlocks={[
                "回訪與續購",
                "交班與現金核對",
                "營收與顧客診斷",
              ]}
              accent="amber"
              highlighted
            />

            {/* ALLIANCE */}
            <PlanCard
              plan="ALLIANCE"
              tagline="總部、多店、合作店長模式"
              audience="適合總部管理、展店與合作店長結算"
              features={[
                "原價 NT$ 7,100/月起",
                "限時優惠價 NT$ 4,990/月起",
                "功能全含",
                "總部管理 + 1 家分店",
                "第二家分店起，每家 +$1,000/月分店營運費",
                "多店管理、總部視角、店舖功能開關",
              ]}
              unlockTitle="包含能力"
              unlocks={[
                "分店資料同步",
                "合作店長月結",
                "總部營運管理",
              ]}
              accent="indigo"
              highlighted={false}
            />
          </div>
        </section>

        {/* ── 升級轉換區 ── */}
        <section className="mx-auto max-w-4xl px-6 py-20">
          <h2 className="text-center text-2xl font-bold text-earth-900 sm:text-3xl">
            每個方案，對應不同經營階段
          </h2>
          <div className="mt-12 space-y-6">
            <UpgradeScenario
              lockLabel="基礎版"
              feature="顧客經營"
              pain="你已經能管理預約與顧客，但還需要知道誰很久沒來、誰快到期、誰需要回訪。"
              solution="升級專業版，開始用顧客經營和現金抽屜管理現場。"
              cta="查看專業版"
              color="amber"
            />
            <UpgradeScenario
              lockLabel="專業版"
              feature="多店管理"
              pain="你已經做好單店經營，但展店後需要總部視角、分店資料同步與權限管理。"
              solution="升級展店版，讓總部能管理多店與合作店長月結。"
              cta="查看展店版"
              color="indigo"
            />
            <UpgradeScenario
              lockLabel="展店版"
              feature="分店營運費"
              pain="展店版已包含總部管理 + 1 家分店，第二家分店起才按店收取營運費。"
              solution="每增加 1 家分店，收取 $1,000/月分店營運費，包含資料、權限、前台入口與維護支援。"
              cta="了解展店版"
              color="indigo"
            />
          </div>
        </section>

        {/* ── 功能對照表 ── */}
        <section className="bg-earth-50 px-6 py-20">
          <h2 className="text-center text-2xl font-bold text-earth-900">
            功能對照表
          </h2>
          <div className="mx-auto mt-10 max-w-5xl overflow-hidden rounded-2xl border border-earth-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b border-earth-100 bg-earth-50">
                    <th className="px-6 py-3 text-left font-medium text-earth-600">
                      功能
                    </th>
	                    <th className="px-4 py-3 text-center font-medium text-primary-700">
	                      基礎版
	                    </th>
	                    <th className="px-4 py-3 text-center font-medium text-amber-700">
	                      專業版
	                    </th>
	                    <th className="px-4 py-3 text-center font-medium text-indigo-700">
	                      展店版
	                    </th>
                  </tr>
                </thead>
                <tbody>
                  {COMPARISON_ROWS.map((row) => (
                    <tr
                      key={row.label}
                      className="border-b border-earth-50 last:border-0"
                    >
                      <td className="px-6 py-3 font-medium text-earth-700">
                        {row.label}
                      </td>
                      <ComparisonCell value={row.basic} />
                      <ComparisonCell value={row.pro} />
                      <ComparisonCell value={row.alliance} />
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* ── 用量上限 ── */}
        <section className="mx-auto max-w-4xl px-6 py-16">
          <h3 className="text-center text-lg font-bold text-earth-900">
            用量上限
          </h3>
          <div className="mx-auto mt-6 max-w-2xl overflow-hidden rounded-xl border border-earth-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-earth-100 bg-earth-50">
                  <th className="px-6 py-2.5 text-left font-medium text-earth-600">項目</th>
                  <th className="px-4 py-2.5 text-center font-medium text-earth-600">體驗版</th>
                  <th className="px-4 py-2.5 text-center font-medium text-primary-700">BASIC</th>
                  <th className="px-4 py-2.5 text-center font-medium text-amber-700">PRO</th>
                  <th className="px-4 py-2.5 text-center font-medium text-indigo-700">ALLIANCE</th>
                </tr>
              </thead>
              <tbody>
                {(
                  [
                    { label: "員工數", field: "maxStaff" },
                    { label: "顧客數", field: "maxCustomers" },
                    { label: "月預約數", field: "maxMonthlyBookings" },
                    { label: "分店數", field: "maxStores" },
                  ] as const
                ).map((row) => (
                  <tr key={row.field} className="border-b border-earth-50 last:border-0">
                    <td className="px-6 py-2.5 text-earth-700">{row.label}</td>
                    {(["EXPERIENCE", "BASIC", "GROWTH", "ALLIANCE"] as PricingPlan[]).map(
                      (plan) => {
                        const v = PLAN_LIMITS[plan][row.field];
                        return (
                          <td
                            key={plan}
                            className="px-4 py-2.5 text-center font-medium text-earth-800"
                          >
                            {v === null ? "無限制" : v.toLocaleString()}
                          </td>
                        );
                      }
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* ── 最後 CTA ── */}
        <section className="bg-earth-900 px-6 py-20 text-center text-white">
          <h2 className="text-2xl font-bold sm:text-3xl">
            你不是缺客人
          </h2>
          <p className="mx-auto mt-3 max-w-md text-base text-earth-300">
            你是缺一套「會幫你長出店長的系統」
          </p>
          <div className="mt-10 flex flex-wrap justify-center gap-3">
            <Link
              href="/register"
              className="rounded-xl bg-primary-500 px-7 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-primary-600"
            >
              免費體驗
            </Link>
            <Link
              href="/register"
              className="rounded-xl bg-amber-500 px-7 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-amber-600"
            >
              升級我的方案
            </Link>
            <a
              href="https://lin.ee/placeholder"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-xl bg-[#06C755] px-7 py-3 text-sm font-semibold text-white shadow-md transition hover:brightness-110"
            >
              加 LINE 諮詢
            </a>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-earth-100 bg-white px-6 py-8 text-center text-xs text-earth-400">
        &copy; {new Date().getFullYear()} 蒸足預約管理系統
      </footer>
    </div>
  );
}

// ============================================================
// Sub-components
// ============================================================

function HeroPoint({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2 text-base font-medium text-earth-700 sm:justify-center">
      <svg
        className="h-5 w-5 shrink-0 text-primary-500"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9 12.75L11.25 15 15 9.75"
        />
      </svg>
      {text}
    </div>
  );
}

function PainCard({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-earth-700 bg-earth-800/50 px-5 py-4 text-left text-sm text-earth-200">
      <span className="mr-2 text-red-400">&#10005;</span>
      {text}
    </div>
  );
}

function SolutionCard({
  number,
  title,
  description,
  color,
}: {
  number: string;
  title: string;
  description: string;
  color: "primary" | "amber" | "indigo";
}) {
  const ring = {
    primary: "bg-primary-100 text-primary-700",
    amber: "bg-amber-100 text-amber-700",
    indigo: "bg-indigo-100 text-indigo-700",
  }[color];

  return (
    <div className="rounded-2xl border border-earth-200 bg-white p-6 text-center shadow-sm">
      <div
        className={`mx-auto flex h-10 w-10 items-center justify-center rounded-full text-lg font-bold ${ring}`}
      >
        {number}
      </div>
      <h3 className="mt-4 text-base font-bold text-earth-900">{title}</h3>
      <p className="mt-2 text-sm text-earth-500">{description}</p>
    </div>
  );
}

function PlanCard({
  plan,
  tagline,
  audience,
  features,
  locked,
  unlockTitle,
  unlocks,
  accent,
  highlighted,
}: {
  plan: PricingPlan;
  tagline: string;
  audience: string;
  features: string[];
  locked?: string[];
  unlockTitle?: string;
  unlocks?: string[];
  accent: "primary" | "amber" | "indigo";
  highlighted: boolean;
}) {
  const info = PRICING_PLAN_INFO[plan];
  const price = PLAN_PRICE[plan];
  const originalPrice = PLAN_ORIGINAL_PRICE[plan];
  const ctaLabel = PLAN_CTA_LABEL[plan];

  const borderClass = highlighted
    ? "border-2 border-amber-400 shadow-lg shadow-amber-100"
    : "border border-earth-200";

  const btnClass = {
    primary: "bg-primary-600 hover:bg-primary-700",
    amber: "bg-amber-500 hover:bg-amber-600",
    indigo: "bg-indigo-600 hover:bg-indigo-700",
  }[accent];

  return (
    <div className={`relative flex flex-col rounded-2xl bg-white p-7 ${borderClass}`}>
      {highlighted && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-amber-500 px-4 py-0.5 text-[11px] font-bold text-white">
          推薦
        </span>
      )}

      <div
        className={`inline-flex self-start rounded-lg px-2.5 py-1 text-xs font-semibold ${info.bgColor} ${info.color}`}
      >
        {info.shortLabel}
      </div>

      <div className="mt-4">
        {originalPrice ? (
          <p className="text-xs font-medium text-earth-400 line-through">
            {originalPrice}
          </p>
        ) : null}
        <div className="mt-1 text-2xl font-bold text-earth-900">{price}</div>
        {plan !== "EXPERIENCE" ? (
          <p className="mt-1 text-xs font-semibold text-primary-700">
            限時優惠價
          </p>
        ) : null}
      </div>

      <p className="mt-2 text-sm text-earth-500">{audience}</p>

      {/* Features */}
      <ul className="mt-6 flex-1 space-y-2">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-sm text-earth-700">
            <svg
              className="mt-0.5 h-4 w-4 shrink-0 text-green-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            {f}
          </li>
        ))}
      </ul>

      {/* Locked features */}
      {locked && locked.length > 0 && (
        <ul className="mt-3 space-y-1.5 border-t border-earth-100 pt-3">
          {locked.map((f) => (
            <li key={f} className="flex items-center gap-2 text-sm text-earth-400">
              <svg
                className="h-3.5 w-3.5 shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
                />
              </svg>
              {f}
            </li>
          ))}
        </ul>
      )}

      {/* Unlock ability */}
      {unlockTitle && unlocks && (
        <div className="mt-4 rounded-lg bg-earth-50 px-4 py-3">
          <p className="text-xs font-semibold text-earth-500">{unlockTitle}</p>
          <ul className="mt-1.5 space-y-1">
            {unlocks.map((u) => (
              <li key={u} className="text-sm text-earth-700">
                &rarr; {u}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Tagline */}
      <p className="mt-4 text-center text-sm font-semibold text-earth-600">
        {tagline}
      </p>

      {/* CTA */}
      <button
        className={`mt-5 w-full rounded-xl py-3 text-sm font-semibold text-white transition ${btnClass}`}
      >
        {ctaLabel}
      </button>
    </div>
  );
}

function UpgradeScenario({
  lockLabel,
  feature,
  pain,
  solution,
  cta,
  color,
}: {
  lockLabel: string;
  feature: string;
  pain: string;
  solution: string;
  cta: string;
  color: "amber" | "indigo";
}) {
  const borderColor = color === "amber" ? "border-amber-200" : "border-indigo-200";
  const bgColor = color === "amber" ? "bg-amber-50" : "bg-indigo-50";
  const badgeColor =
    color === "amber"
      ? "bg-amber-100 text-amber-700"
      : "bg-indigo-100 text-indigo-700";
  const btnColor =
    color === "amber"
      ? "bg-amber-500 hover:bg-amber-600"
      : "bg-indigo-600 hover:bg-indigo-700";

  return (
    <div className={`rounded-2xl border ${borderColor} ${bgColor} p-6`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-md bg-earth-200 px-2 py-0.5 text-[11px] font-medium text-earth-600">
          {lockLabel}
        </span>
        <span className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${badgeColor}`}>
          {feature}
        </span>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-earth-700">{pain}</p>
      <p className="mt-2 text-sm font-semibold text-earth-900">{solution}</p>
      <Link
        href="#plans"
        className={`mt-4 inline-flex rounded-lg px-5 py-2 text-sm font-medium text-white transition ${btnColor}`}
      >
        {cta}
      </Link>
    </div>
  );
}

function ComparisonCell({ value }: { value: string }) {
  if (value === "-") {
    return (
      <td className="px-4 py-3 text-center">
        <span className="text-earth-300">-</span>
      </td>
    );
  }

  if (value === "check") {
    return (
      <td className="px-4 py-3 text-center">
        <svg
          className="mx-auto h-5 w-5 text-green-500"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </td>
    );
  }
  if (value === "partial") {
    return (
      <td className="px-4 py-3 text-center">
        <span className="text-amber-500" title="部分功能">
          &#9888;
        </span>
      </td>
    );
  }

  if (value === "lock") {
    return (
      <td className="px-4 py-3 text-center">
        <svg
          className="mx-auto h-4 w-4 text-earth-300"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
          />
        </svg>
      </td>
    );
  }

  return (
    <td className="px-4 py-3 text-center">
      <span className="text-xs font-medium leading-relaxed text-earth-700">
        {value}
      </span>
    </td>
  );
}
