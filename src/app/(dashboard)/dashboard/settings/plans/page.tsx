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
  yearly: string;
  yearlyNote: string;
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
    name: "基礎版",
    positioning: "管理一家店",
    monthly: "NT$1,980",
    yearly: "NT$19,800",
    yearlyNote: "現省 NT$3,960",
    description: "適合剛開始營運，先把預約、顧客、收款管理好。",
    features: [
      "預約管理",
      "顧客管理",
      "會員方案",
      "收款紀錄",
      "今日待處理",
      "基礎營收統計",
    ],
    audience: ["單店", "剛開店", "1–3 位人員"],
    ctaLabel: "開通基礎版",
  },
  {
    key: "PROFESSIONAL",
    name: "專業版",
    positioning: "經營顧客",
    monthly: "NT$3,980",
    yearly: "NT$39,800",
    yearlyNote: "現省 NT$7,960",
    badge: "推薦方案",
    recommended: true,
    isCurrent: true,
    description:
      "幫店長找出快流失、快到期、快沒堂數的顧客，提升回流與續約。",
    features: [
      "包含基礎版全部功能",
      "顧客經營系統",
      "久未到店追蹤",
      "體驗未轉換追蹤",
      "快到期提醒",
      "快沒堂數提醒",
      "補課管理",
      "開店結店",
      "零用金管理",
      "日帳管理",
    ],
    audience: ["穩定營運", "有會員制度", "想提升回流率", "想提升續約率"],
    ctaLabel: "目前方案",
  },
  {
    key: "SCALE",
    name: "展店版",
    positioning: "複製成功門市",
    cardSubline: "適合第二家店以上",
    monthly: "NT$9,800",
    yearly: "NT$98,000",
    yearlyNote: "現省 NT$19,600",
    description: "管理分店、店長績效與未來組織成長。",
    features: [
      "包含專業版全部功能",
      "多店管理",
      "總部儀表板",
      "分店營收比較",
      "店長績效分析",
      "新店模板複製",
      "分店權限管理",
      "組織管理基礎",
    ],
    audience: ["2 家店以上", "合夥經營", "準備展店", "未來要發展組織"],
    ctaLabel: "聯絡開通展店版",
  },
];

/** 功能比較表 — true 表示該方案具備此功能 */
const COMPARE_ROWS: {
  label: string;
  basic: boolean;
  professional: boolean;
  scale: boolean;
}[] = [
  { label: "預約 / 顧客 / 收款", basic: true, professional: true, scale: true },
  { label: "今日待處理", basic: true, professional: true, scale: true },
  { label: "顧客經營", basic: false, professional: true, scale: true },
  { label: "補課 / 日帳 / 零用金", basic: false, professional: true, scale: true },
  { label: "多店管理", basic: false, professional: false, scale: true },
  { label: "總部儀表板", basic: false, professional: false, scale: true },
  { label: "店長績效", basic: false, professional: false, scale: true },
  { label: "新店模板複製", basic: false, professional: false, scale: true },
  { label: "組織管理", basic: false, professional: false, scale: true },
];

// ── 目前方案假資料 ──
const CURRENT_PLAN = {
  name: "專業版",
  positioning: "經營顧客",
  monthly: "NT$3,980",
  yearly: "NT$39,800",
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
                  年繳 {CURRENT_PLAN.yearly}
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
                <div className="flex items-baseline gap-1">
                  <span className="text-[26px] font-bold leading-none tabular-nums text-earth-900">
                    {plan.monthly}
                  </span>
                  <span className="text-[12px] text-earth-500">/月</span>
                </div>
                <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-earth-500">
                  <span>年繳 {plan.yearly}/年</span>
                  <span className="rounded bg-primary-50 px-1.5 py-0.5 font-medium text-primary-700">
                    {plan.yearlyNote}
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
          <table className="w-full min-w-[480px] text-[13px]">
            <thead>
              <tr className="border-y border-earth-100 text-[11px] text-earth-400">
                <th className="px-5 py-2 text-left font-medium">功能</th>
                <th className="px-3 py-2 text-center font-medium">基礎版</th>
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
                    <div className="flex justify-center">
                      {row.basic ? <CheckIcon /> : <DashIcon />}
                    </div>
                  </td>
                  <td className="bg-primary-50/40 px-3 py-2">
                    <div className="flex justify-center">
                      {row.professional ? <CheckIcon /> : <DashIcon />}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex justify-center">
                      {row.scale ? <CheckIcon /> : <DashIcon />}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <p className="px-1 text-[11px] leading-relaxed text-earth-400">
        方案價格與續約日為示意資料。實際開通、升級與付款請聯絡客服協助處理。
      </p>
    </PageShell>
  );
}
