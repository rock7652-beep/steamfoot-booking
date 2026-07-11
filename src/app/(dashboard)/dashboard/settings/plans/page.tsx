import { Fragment } from "react";
import { getCurrentUser } from "@/lib/session";
import { redirect, notFound } from "next/navigation";
import { DashboardLink as Link } from "@/components/dashboard-link";
import { PageShell, PageHeader } from "@/components/desktop";

/**
 * /dashboard/settings/plans — 成長方案中心
 *
 * 靜態方案總覽頁，讓店長一眼看懂目前方案、可升級方案與功能差異。
 *
 * 範圍限制（依需求）：
 *   - 純 UI / 文案 / 版型，不接金流、不做付款功能
 *   - 不改 schema、不做方案權限鎖定、不做 upgrade request
 *   - 目前方案 / 續約日等暫用假資料
 */

type PlanKey = "BASIC" | "PROFESSIONAL" | "SCALE";

interface PlanCard {
  key: PlanKey;
  name: string;
  positioning: string;
  /** 卡片內定位副說明（目前僅展店版使用，回答「為何比專業版貴」） */
  cardSubline?: string;
  monthly: string;
  originalPrice: string;
  priceNote: string;
  badge?: string;
  description: string;
  features: string[];
  audience: string[];
  ctaLabel: string;
  recommended?: boolean;
  isCurrent?: boolean;
}

const PLANS: PlanCard[] = [
  {
    key: "BASIC",
    name: "基本版",
    positioning: "單店基本營運",
    monthly: "NT$1,490",
    originalPrice: "原價 NT$2,100/月",
    priceNote: "限時優惠價",
    description: "適合單店先把預約、顧客、方案堂數與收款管理好。",
    features: [
      "預約管理",
      "顧客管理",
      "方案 / 堂數管理",
      "基本收款紀錄",
      "基本報表",
      "前台預約入口",
      "可選 1 個 $500 工具型模組",
    ],
    audience: ["單店", "基本營運", "先把資料集中"],
    ctaLabel: "開通基本版",
  },
  {
    key: "PROFESSIONAL",
    name: "專業版",
    positioning: "顧客經營與現場管理",
    monthly: "NT$2,490",
    originalPrice: "原價 NT$3,600/月",
    priceNote: "限時優惠價",
    badge: "推薦方案",
    recommended: true,
    isCurrent: true,
    description:
      "適合想做好顧客回訪、現場現金管理與經營判斷的店。",
    features: [
      "包含基本版全部功能",
      "顧客經營",
      "現金抽屜",
      "可選 1 個 $500 工具型模組",
      "可選 1 個 $800 經營型模組",
    ],
    audience: ["穩定營運", "想提升回訪", "需要現金管理", "需要經營判斷"],
    ctaLabel: "目前方案",
  },
  {
    key: "SCALE",
    name: "展店版",
    positioning: "多店與合作店長管理",
    cardSubline: "含總部管理 + 1 家分店",
    monthly: "NT$4,990 起",
    originalPrice: "原價 NT$7,100/月起",
    priceNote: "限時優惠價",
    description: "適合兩家店以上、多店經營與合作店長月結。",
    features: [
      "功能全含",
      "包含總部管理 + 1 家分店",
      "第二家分店起，每家 +$1,000/月分店營運費",
      "多店管理",
      "月結管理",
    ],
    audience: ["2 家店以上", "多店經營", "合作店長", "準備展店"],
    ctaLabel: "聯絡開通展店版",
  },
];

/** 功能比較表 — 只做展示，不調整 PLAN_FEATURES 或 feature gate */
const COMPARE_ROWS: {
  label: string;
  basic: string;
  professional: string;
  scale: string;
}[] = [
  { label: "預約管理", basic: "內含", professional: "內含", scale: "內含" },
  { label: "顧客管理", basic: "內含", professional: "內含", scale: "內含" },
  { label: "方案 / 堂數管理", basic: "內含", professional: "內含", scale: "內含" },
  { label: "基本收款紀錄", basic: "內含", professional: "內含", scale: "內含" },
  { label: "基本報表", basic: "內含", professional: "內含", scale: "內含" },
  { label: "前台預約入口", basic: "內含", professional: "內含", scale: "內含" },
  { label: "LINE 綁定狀態", basic: "內含", professional: "內含", scale: "內含" },
  { label: "LINE 自動提醒", basic: "$500 工具模組", professional: "$500 工具模組", scale: "內含" },
  { label: "資料匯出", basic: "$500 工具模組", professional: "$500 工具模組", scale: "內含" },
  { label: "現金抽屜", basic: "$500 工具模組", professional: "內含", scale: "內含" },
  { label: "顧客經營", basic: "$800 經營模組", professional: "內含", scale: "內含" },
  { label: "健康評估／摘要", basic: "$800 經營模組", professional: "$800 經營模組", scale: "內含" },
  { label: "經營診斷報表", basic: "$800 經營模組", professional: "$800 經營模組", scale: "內含" },
  { label: "月結管理", basic: "$800 經營模組", professional: "$800 經營模組", scale: "內含" },
  { label: "多店管理", basic: "-", professional: "-", scale: "內含" },
];

// ── 目前方案假資料 ──
const CURRENT_PLAN = {
  name: "專業版",
  positioning: "顧客經營與現場管理",
  monthly: "NT$2,490",
  store: "竹北店",
  payment: "現金 / 轉帳",
  renewAt: "2026/12/31",
};

function CheckIcon() {
  return (
    <svg
      className="h-4 w-4 text-primary-600"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2.2}
      aria-hidden
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  );
}

function DashIcon() {
  return (
    <span className="inline-block h-px w-3 rounded bg-earth-300" aria-hidden />
  );
}

function ComparisonText({ value }: { value: string }) {
  if (value === "-") {
    return (
      <div className="flex justify-center">
        <DashIcon />
      </div>
    );
  }

  if (value === "內含") {
    return (
      <div className="flex justify-center">
        <CheckIcon />
      </div>
    );
  }

  return (
    <div className="text-center text-[11px] font-medium leading-relaxed text-earth-600">
      {value}
    </div>
  );
}

export default async function PlansCenterPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/hq/login");
  }
  if (user.role !== "ADMIN" && user.role !== "OWNER" && user.role !== "PARTNER") {
    notFound();
  }

  return (
    <PageShell className="mx-auto flex max-w-[1440px] flex-col gap-4 px-5 py-4">
      <PageHeader
        title="成長方案中心"
        subtitle="依門市成長階段選擇方案，看懂目前狀態與功能差異"
        actions={
          <Link
            href="/dashboard/settings"
            className="rounded-lg border border-earth-200 px-3 py-1.5 text-xs font-medium text-earth-600 hover:bg-earth-50"
          >
            ← 返回設定
          </Link>
        }
      />

      {/* 成長路徑 */}
      <section className="rounded-xl border border-earth-200 bg-white px-5 py-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <h2 className="text-sm font-semibold text-earth-900">成長路徑</h2>
          <span className="text-[11px] text-earth-500">
            三個方案對應門市成長的三個階段，不只是價格高低
          </span>
        </div>
        <ol className="flex flex-col gap-2 sm:flex-row sm:items-stretch sm:gap-0">
          {PLANS.map((plan, i) => (
            <Fragment key={plan.key}>
              <li
                className={`flex-1 rounded-lg border px-4 py-3 text-center ${
                  plan.isCurrent
                    ? "border-primary-300 bg-primary-50"
                    : "border-earth-200 bg-earth-50/50"
                }`}
              >
                <div
                  className={`text-[15px] font-bold ${
                    plan.isCurrent ? "text-primary-700" : "text-earth-800"
                  }`}
                >
                  {plan.name}
                </div>
                <div className="mt-0.5 text-[12px] text-earth-500">
                  {plan.positioning}
                </div>
                {plan.isCurrent ? (
                  <div className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-primary-100 px-2 py-0.5 text-[10px] font-medium text-primary-700">
                    <span className="h-1 w-1 rounded-full bg-primary-500" />
                    目前所在
                  </div>
                ) : null}
              </li>
              {i < PLANS.length - 1 ? (
                <li
                  className="flex items-center justify-center text-earth-300 sm:px-2"
                  aria-hidden
                >
                  <span className="text-lg leading-none sm:hidden">↓</span>
                  <span className="hidden text-lg leading-none sm:inline">→</span>
                </li>
              ) : null}
            </Fragment>
          ))}
        </ol>
      </section>

      {/* 目前方案 */}
      <section className="rounded-xl border border-primary-200 bg-primary-50/40 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-4 px-5 py-4">
          {/* 左：身分 */}
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary-100 text-primary-700">
              <svg
                className="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.8}
                aria-hidden
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-medium text-primary-700">
                  您目前使用
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-100 px-2.5 py-0.5 text-[11px] font-medium text-primary-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary-500" />
                  使用中
                </span>
              </div>
              <div className="mt-0.5 flex items-baseline gap-2">
                <h2 className="text-2xl font-bold text-earth-900">
                  {CURRENT_PLAN.name}
                </h2>
                <span className="text-[13px] text-earth-500">
                  {CURRENT_PLAN.positioning}
                </span>
              </div>
              <p className="mt-1 text-[13px] text-earth-700">
                <span className="font-semibold text-earth-900">
                  {CURRENT_PLAN.monthly}
                </span>
                /月
                <span className="mx-1.5 text-earth-300">·</span>
                <span className="text-earth-500">
                  限時優惠價
                </span>
              </p>
            </div>
          </div>

          {/* 右：使用狀態 */}
          <dl className="grid grid-cols-2 gap-x-8 gap-y-2.5 sm:grid-cols-3">
            <div>
              <dt className="text-[11px] text-earth-500">目前門市</dt>
              <dd className="mt-0.5 text-[13px] font-medium text-earth-800">
                {CURRENT_PLAN.store}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] text-earth-500">付款方式</dt>
              <dd className="mt-0.5 text-[13px] font-medium text-earth-800">
                {CURRENT_PLAN.payment}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] text-earth-500">下次續約日</dt>
              <dd className="mt-0.5 text-[13px] font-medium text-earth-800">
                {CURRENT_PLAN.renewAt}
              </dd>
            </div>
          </dl>
        </div>
      </section>

      {/* 三個方案卡片 */}
      <div className="grid grid-cols-1 items-stretch gap-4 md:grid-cols-3">
        {PLANS.map((plan) => (
          <article
            key={plan.key}
            className={`relative flex h-full flex-col rounded-xl border bg-white p-5 ${
              plan.recommended
                ? "border-primary-400 shadow-md ring-1 ring-primary-200"
                : "border-earth-200 shadow-sm"
            }`}
          >
            {plan.badge ? (
              <span className="absolute -top-2.5 left-1/2 inline-flex -translate-x-1/2 items-center gap-1 whitespace-nowrap rounded-full bg-primary-600 px-3 py-0.5 text-[11px] font-semibold text-white shadow-sm">
                ★ {plan.badge}
              </span>
            ) : null}

            {/* 標題與定位 */}
            <header className={plan.badge ? "mt-1" : ""}>
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="text-lg font-bold text-earth-900">{plan.name}</h3>
                <span className="text-[11px] font-medium text-earth-500">
                  {plan.positioning}
                </span>
              </div>
              {plan.cardSubline ? (
                <p className="mt-1 text-[12px] font-medium text-primary-700">
                  {plan.cardSubline}
                </p>
              ) : null}

              {/* 價格 */}
              <div className="mt-3">
                <p className="text-[11px] font-medium text-earth-400 line-through">
                  {plan.originalPrice}
                </p>
                <div className="flex items-baseline gap-1">
                  <span className="text-[26px] font-bold leading-none tabular-nums text-earth-900">
                    {plan.monthly}
                  </span>
                  <span className="text-[12px] text-earth-500">/月</span>
                </div>
                <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-earth-500">
                  <span className="rounded bg-primary-50 px-1.5 py-0.5 font-medium text-primary-700">
                    {plan.priceNote}
                  </span>
                </p>
              </div>

              <p className="mt-3 min-h-[2.5rem] text-[13px] leading-relaxed text-earth-700">
                {plan.description}
              </p>
            </header>

            {/* 功能 */}
            <ul className="mt-4 space-y-2 text-[13px] text-earth-700">
              {plan.features.map((f) => (
                <li key={f} className="flex items-start gap-2">
                  <span className="mt-0.5 shrink-0">
                    <CheckIcon />
                  </span>
                  <span>{f}</span>
                </li>
              ))}
            </ul>

            {/* 底部：適合對象 + CTA（固定貼底，桌機三卡對齊） */}
            <div className="mt-auto pt-4">
              <div className="border-t border-earth-100 pt-3">
                <p className="text-[11px] font-medium text-earth-500">適合</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {plan.audience.map((a) => (
                    <span
                      key={a}
                      className="rounded-full bg-earth-100 px-2 py-0.5 text-[11px] text-earth-600"
                    >
                      {a}
                    </span>
                  ))}
                </div>
              </div>

              <div className="mt-4">
                {plan.isCurrent ? (
                  <button
                    type="button"
                    disabled
                    className="w-full cursor-default rounded-lg border border-primary-300 bg-primary-50 px-3 py-2 text-[13px] font-semibold text-primary-700"
                  >
                    {plan.ctaLabel}
                  </button>
                ) : (
                  <button
                    type="button"
                    className={`w-full rounded-lg px-3 py-2 text-[13px] font-semibold transition ${
                      plan.recommended
                        ? "bg-primary-600 text-white hover:bg-primary-700"
                        : "border border-earth-200 text-earth-700 hover:bg-earth-50"
                    }`}
                  >
                    {plan.ctaLabel}
                  </button>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>

      {/* 功能比較表（輔助資訊，視覺弱化） */}
      <section className="rounded-xl border border-earth-200 bg-earth-50/30">
        <header className="flex items-baseline gap-2 px-5 py-3">
          <h2 className="text-[13px] font-semibold text-earth-700">功能比較</h2>
          <p className="text-[11px] text-earth-400">輔助參考 · 各方案功能一覽</p>
        </header>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-[13px]">
            <thead>
              <tr className="border-y border-earth-100 text-[11px] text-earth-400">
                <th className="px-5 py-2 text-left font-medium">功能</th>
                <th className="px-3 py-2 text-center font-medium">基本版</th>
                <th className="bg-primary-50/40 px-3 py-2 text-center font-semibold text-primary-700">
                  專業版
                </th>
                <th className="px-3 py-2 text-center font-medium">展店版</th>
              </tr>
            </thead>
            <tbody>
              {COMPARE_ROWS.map((row, i) => (
                <tr
                  key={row.label}
                  className={
                    i < COMPARE_ROWS.length - 1
                      ? "border-b border-earth-100/60"
                      : ""
                  }
                >
                  <td className="px-5 py-2 text-earth-600">{row.label}</td>
                  <td className="px-3 py-2">
                    <ComparisonText value={row.basic} />
                  </td>
                  <td className="bg-primary-50/40 px-3 py-2">
                    <ComparisonText value={row.professional} />
                  </td>
                  <td className="px-3 py-2">
                    <ComparisonText value={row.scale} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <p className="px-1 text-[11px] leading-relaxed text-earth-400">
        本頁僅更新方案展示文案，未調整系統功能開關、PLAN_FEATURES 或正式站方案預設。實際開通、升級與付款請聯絡客服協助處理。
      </p>
    </PageShell>
  );
}
