import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";

import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { getActiveStoreForRead } from "@/lib/store";
import { toLocalDateStr, formatTWTime } from "@/lib/date-utils";
import { getCurrentStorePlan } from "@/lib/store-plan";
import { FEATURES } from "@/lib/feature-flags";
import { FeatureGate } from "@/components/feature-gate";
import { FormErrorToast } from "@/components/form-error-toast";
import { SubmitButton } from "@/components/submit-button";
import { DashboardLink as Link } from "@/components/dashboard-link";
import { PageShell, PageHeader } from "@/components/desktop";

import { getCashDrawerView, type CashDrawerLiveTotals } from "@/server/queries/cash-drawer";
import type { CashDrawerEntry } from "@prisma/client";
import {
  initializeCashDrawerAction,
  openCashDrawerAction,
  closeCashDrawerAction,
} from "@/server/actions/cash-drawer";
import { EntrySection } from "./entry-section";

interface PageProps {
  searchParams: Promise<{ error?: string }>;
}

export default async function CashDrawerPage({ searchParams }: PageProps) {
  const user = await getCurrentUser();
  if (!user || !(await checkPermission(user.role, user.staffId, "cashDrawer.read"))) {
    redirect("/dashboard");
  }
  await searchParams; // 觸發 dynamic rendering，錯誤 toast 由 <FormErrorToast /> 自己讀 URL

  const storeId = await getActiveStoreForRead(user);
  if (!storeId) {
    // ADMIN 未選店時 storeId 可能為 null
    redirect("/dashboard");
  }
  const plan = await getCurrentStorePlan();
  const todayStr = toLocalDateStr();
  const [y, m, d] = todayStr.split("-").map(Number);
  const todayBusinessDate = new Date(Date.UTC(y, m - 1, d));

  const view = await getCashDrawerView(storeId, todayBusinessDate);
  const canInit = user.role === "ADMIN" || user.role === "OWNER";
  const canOpen = await checkPermission(user.role, user.staffId, "cashDrawer.open");
  const canClose = await checkPermission(user.role, user.staffId, "cashDrawer.close");
  const canAddEntry = await checkPermission(user.role, user.staffId, "cashDrawer.entry");

  return (
    <FeatureGate plan={plan} feature={FEATURES.CASHBOOK}>
      <PageShell>
        <FormErrorToast />

        <PageHeader
          title="現金抽屜"
          subtitle="每日開店點錢 / 閉店點錢 / 滾動結餘核對"
          actions={
            <Link
              href="/dashboard/cashbook"
              className="rounded-lg border border-earth-200 px-3 py-1.5 text-xs font-medium text-earth-600 hover:bg-earth-50"
            >
              ← 現金帳
            </Link>
          }
        />

        {/* State A: 未啟用 — 單卡置中，避免在 1440px 容器內被拉太寬 */}
        {view.state === "EMPTY" && (
          <div className="mx-auto w-full max-w-2xl">
            <EmptyState canInit={canInit} todayStr={todayStr} />
          </div>
        )}

        {/* State D: 上日尚未閉店 — 單卡置中 */}
        {view.state === "WARNING_LAST_OPEN" && (
          <div className="mx-auto w-full max-w-2xl">
            <WarningLastOpen lastSession={view.lastSession} />
          </div>
        )}

        {/* State B: 今日未開店 — 兩張窄卡上下堆疊置中 */}
        {view.state === "NOT_OPENED_TODAY" && (
          <div className="mx-auto w-full max-w-2xl">
            <NotOpenedToday
              lastSession={view.lastSession}
              canOpen={canOpen}
              todayStr={todayStr}
            />
          </div>
        )}

        {/* State C: 今日已開店（OPEN 顯示閉店表單，CLOSED 顯示結算 summary）
            內部 OpenedToday 元件於 lg+ 切換為左 2 / 右 1 兩欄 layout */}
        {view.state === "OPENED_TODAY" && (
          <OpenedToday
            session={view.session}
            liveTotals={view.liveTotals}
            entries={view.entries}
            canClose={canClose}
            canAddEntry={canAddEntry}
          />
        )}
      </PageShell>
    </FeatureGate>
  );
}

// ============================================================
// State A — Empty
// ============================================================

function EmptyState({ canInit, todayStr }: { canInit: boolean; todayStr: string }) {
  async function handleInitialize(formData: FormData) {
    "use server";
    const result = await initializeCashDrawerAction({
      businessDate: todayStr,
      openingBookBalance: Number(formData.get("openingBookBalance")),
      openingActualCash: Number(formData.get("openingActualCash")),
      note: (formData.get("note") as string) || undefined,
    });
    if (!result.success) {
      redirect(`/dashboard/cash-drawer?error=${encodeURIComponent(result.error || "啟用失敗")}`);
    }
    redirect("/dashboard/cash-drawer");
  }

  return (
    <div className="rounded-xl border bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-earth-900">啟用現金抽屜</h2>
      <p className="mt-2 text-sm text-earth-600">
        本店尚未啟用現金抽屜。請輸入起始現金，作為日後滾動結餘的基準。
      </p>
      <ul className="mt-3 space-y-1 text-xs text-earth-500">
        <li>· 「初始帳面金額」是您預期店內應有的現金（通常與實際點到相同）</li>
        <li>· 「實際點到金額」是現場清點的實際數字</li>
        <li>· 若兩者不同，必須填寫差額原因</li>
        <li>· 送出後系統會自動建立今日的現金抽屜紀錄</li>
      </ul>

      {!canInit && (
        <div className="mt-4 rounded-lg bg-earth-50 px-4 py-3 text-sm text-earth-600">
          僅 OWNER / ADMIN 可執行首次啟用。
        </div>
      )}

      {canInit && (
        <form action={handleInitialize} className="mt-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-earth-700">
              初始帳面金額（NT$）
            </label>
            <input
              type="number"
              name="openingBookBalance"
              required
              min={0}
              step={1}
              className="mt-1 block w-full rounded-lg border border-earth-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400"
              placeholder="例如 5000"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-earth-700">
              實際點到金額（NT$）
            </label>
            <input
              type="number"
              name="openingActualCash"
              required
              min={0}
              step={1}
              className="mt-1 block w-full rounded-lg border border-earth-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400"
              placeholder="例如 5000"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-earth-700">
              差額原因（若兩者不同必填）
            </label>
            <textarea
              name="note"
              rows={2}
              className="mt-1 block w-full rounded-lg border border-earth-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400"
              placeholder="若帳面與實際不同，請說明原因（例：含零錢盒 NT$ 50）"
            />
          </div>
          <SubmitButton
            label="啟用現金抽屜"
            className="w-full bg-primary-600 text-white hover:bg-primary-700"
          />
        </form>
      )}
    </div>
  );
}

// ============================================================
// State D — Warning (上日尚未閉店)
// ============================================================

function WarningLastOpen({
  lastSession,
}: {
  lastSession: { businessDate: Date; openedAt: Date };
}) {
  return (
    <div className="rounded-xl border border-orange-200 bg-orange-50 p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-orange-900">
        上一個營業日尚未閉店
      </h2>
      <p className="mt-2 text-sm text-orange-800">
        最近一筆 session 仍處於 OPEN 狀態，必須先完成閉店才能開新日。
      </p>
      <ul className="mt-3 space-y-1 text-sm text-orange-700">
        <li>· 上一日營業日：{formatTWTime(lastSession.businessDate, { dateOnly: true })}</li>
        <li>· 開店時間：{formatTWTime(lastSession.openedAt)}</li>
      </ul>
      <p className="mt-4 text-xs text-orange-600">
        閉店功能將在後續 PR 開放。如有疑問請聯絡管理員。
      </p>
    </div>
  );
}

// ============================================================
// State B — 今日未開店
// ============================================================

function NotOpenedToday({
  lastSession,
  canOpen,
  todayStr,
}: {
  lastSession: { businessDate: Date; finalBookBalance: Prisma.Decimal | null };
  canOpen: boolean;
  todayStr: string;
}) {
  async function handleOpen(formData: FormData) {
    "use server";
    const result = await openCashDrawerAction({
      businessDate: todayStr,
      openingActualCash: Number(formData.get("openingActualCash")),
      note: (formData.get("note") as string) || undefined,
    });
    if (!result.success) {
      redirect(`/dashboard/cash-drawer?error=${encodeURIComponent(result.error || "開店失敗")}`);
    }
    redirect("/dashboard/cash-drawer");
  }

  const lastBalance = lastSession.finalBookBalance?.toString() ?? "—";

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-primary-50 p-4 text-primary-900">
        <p className="text-sm">
          上日（{formatTWTime(lastSession.businessDate, { dateOnly: true })}）閉店帳面結餘
        </p>
        <p className="mt-1 text-2xl font-bold">NT$ {lastBalance}</p>
        <p className="mt-1 text-xs text-primary-700">
          系統會自動以此金額作為今日開店帳面
        </p>
      </div>

      <div className="rounded-xl border bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-earth-900">今日開店點錢</h2>
        <p className="mt-1 text-sm text-earth-500">
          請現場清點抽屜內現金，輸入實際金額。
        </p>

        {!canOpen && (
          <div className="mt-4 rounded-lg bg-earth-50 px-4 py-3 text-sm text-earth-600">
            您沒有開店點錢的權限。
          </div>
        )}

        {canOpen && (
          <form action={handleOpen} className="mt-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-earth-700">
                實際點到金額（NT$）
              </label>
              <input
                type="number"
                name="openingActualCash"
                required
                min={0}
                step={1}
                className="mt-1 block w-full rounded-lg border border-earth-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400"
                placeholder="例如 8100"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-earth-700">
                差額原因（若與上日帳面不同必填）
              </label>
              <textarea
                name="note"
                rows={2}
                className="mt-1 block w-full rounded-lg border border-earth-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400"
                placeholder="若實際金額與上日帳面不同，請說明原因"
              />
            </div>
            <SubmitButton
              label="完成今日開店點錢"
              className="w-full bg-primary-600 text-white hover:bg-primary-700"
            />
          </form>
        )}
      </div>
    </div>
  );
}

// ============================================================
// State C — 今日已開店（OPEN 顯示閉店表單；CLOSED 顯示結算 summary）
// ============================================================

type OpenedTodaySession = {
  id: string;
  businessDate: Date;
  status: string;
  openingBookBalance: Prisma.Decimal;
  openingActualCash: Prisma.Decimal;
  openingDifference: Prisma.Decimal;
  openingNote: string | null;
  openedAt: Date;
  // CLOSED 時才會有值
  cashIncomeTotal: Prisma.Decimal;
  cashExpenseTotal: Prisma.Decimal;
  cashWithdrawalTotal: Prisma.Decimal;
  cashDepositTotal: Prisma.Decimal;
  cashAdjustmentTotal: Prisma.Decimal;
  expectedClosingCash: Prisma.Decimal | null;
  closingActualCash: Prisma.Decimal | null;
  closingDifference: Prisma.Decimal | null;
  closingNote: string | null;
  closedAt: Date | null;
  finalBookBalance: Prisma.Decimal | null;
};

function formatDiff(value: number): { label: string; className: string } {
  if (value === 0) return { label: "0", className: "text-earth-600" };
  if (value > 0) return { label: `+${value}`, className: "text-green-700" };
  return { label: `${value}`, className: "text-orange-700" };
}

function OpenedToday({
  session,
  liveTotals,
  entries,
  canClose,
  canAddEntry,
}: {
  session: OpenedTodaySession;
  liveTotals: CashDrawerLiveTotals | null;
  entries: CashDrawerEntry[];
  canClose: boolean;
  canAddEntry: boolean;
}) {
  const isClosed = session.status === "CLOSED";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span
          className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${
            isClosed ? "bg-earth-200 text-earth-700" : "bg-green-100 text-green-700"
          }`}
        >
          ● {isClosed ? "今日已閉店" : "今日已開店"}
        </span>
        <span className="text-sm text-earth-500">
          {formatTWTime(session.businessDate, { dateOnly: true })}
        </span>
      </div>

      {/* 桌機 / iPad 橫向 (lg+)：左 2 / 右 1 兩欄；手機 / iPad 直向 (< lg)：單欄堆疊 */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* 左：開店紀錄 + 今日交易摘要 + 現金異動 */}
        <div className="space-y-4 lg:col-span-2">
          <OpeningRecordCard session={session} />

          {/* 今日交易摘要 — OPEN 用 liveTotals、CLOSED 用 session snapshot */}
          {!isClosed && liveTotals && (
            <TransactionSummaryCard
              live
              cashIncome={liveTotals.cashIncomeTotal.toString()}
              cashExpense={liveTotals.cashExpenseTotal.toString()}
              cashWithdrawal={liveTotals.cashWithdrawalTotal.toString()}
              cashDeposit={liveTotals.cashDepositTotal.toString()}
              cashAdjustment={liveTotals.cashAdjustmentTotal.toString()}
            />
          )}
          {isClosed && (
            <TransactionSummaryCard
              live={false}
              cashIncome={session.cashIncomeTotal.toString()}
              cashExpense={session.cashExpenseTotal.toString()}
              cashWithdrawal={session.cashWithdrawalTotal.toString()}
              cashDeposit={session.cashDepositTotal.toString()}
              cashAdjustment={session.cashAdjustmentTotal.toString()}
            />
          )}

          {/* 現金異動：OPEN 可新增 / CLOSED 唯讀 */}
          <EntrySection
            sessionId={session.id}
            entries={entries}
            canAddEntry={!isClosed && canAddEntry}
          />
        </div>

        {/* 右：OPEN → 系統應有現金 + 閉店點錢 form；CLOSED → 閉店結算 */}
        <div className="space-y-4 lg:col-span-1">
          {!isClosed && liveTotals && (
            <ClosingPanel
              sessionId={session.id}
              liveTotals={liveTotals}
              canClose={canClose}
            />
          )}
          {isClosed && <ClosedSettlementCard session={session} />}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// 子卡：開店紀錄（OPEN / CLOSED 共用）
// ============================================================

function OpeningRecordCard({ session }: { session: OpenedTodaySession }) {
  const openingDiff = formatDiff(session.openingDifference.toNumber());
  return (
    <div className="rounded-xl border bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-earth-900">開店紀錄</h2>
      <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
        <div>
          <dt className="text-earth-500">開店帳面（應有）</dt>
          <dd className="mt-1 text-lg font-medium text-earth-900">
            NT$ {session.openingBookBalance.toString()}
          </dd>
        </div>
        <div>
          <dt className="text-earth-500">實際點到</dt>
          <dd className="mt-1 text-lg font-medium text-earth-900">
            NT$ {session.openingActualCash.toString()}
          </dd>
        </div>
        <div>
          <dt className="text-earth-500">差額</dt>
          <dd className={`mt-1 text-lg font-medium ${openingDiff.className}`}>
            NT$ {openingDiff.label}
          </dd>
        </div>
        <div>
          <dt className="text-earth-500">開店時間</dt>
          <dd className="mt-1 text-sm text-earth-900">
            {formatTWTime(session.openedAt)}
          </dd>
        </div>
        {session.openingNote && (
          <div className="col-span-2">
            <dt className="text-earth-500">開店備註</dt>
            <dd className="mt-1 whitespace-pre-wrap text-sm text-earth-900">
              {session.openingNote}
            </dd>
          </div>
        )}
      </dl>
    </div>
  );
}

// ============================================================
// 子卡：今日交易摘要（OPEN 用 live、CLOSED 用 snapshot）
// 系統應有現金 highlight 已抽到右欄獨立卡，本卡只保留收入 / 退款 / 異動 dl
// ============================================================

function TransactionSummaryCard({
  live,
  cashIncome,
  cashExpense,
  cashWithdrawal,
  cashDeposit,
  cashAdjustment,
}: {
  live: boolean;
  cashIncome: string;
  cashExpense: string;
  cashWithdrawal: string;
  cashDeposit: string;
  cashAdjustment: string;
}) {
  return (
    <div className="rounded-xl border bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-earth-900">今日交易摘要</h2>
      <p className="mt-1 text-xs text-earth-500">
        {live ? "系統即時計算，閉店時凍結進快照欄位" : "閉店時凍結的快照"}
      </p>
      <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
        <div>
          <dt className="text-earth-500">現金收入</dt>
          <dd className="mt-1 text-base font-medium text-green-700">
            + NT$ {cashIncome}
          </dd>
        </div>
        <div>
          <dt className="text-earth-500">現金退款</dt>
          <dd className="mt-1 text-base font-medium text-orange-700">
            − NT$ {cashExpense}
          </dd>
        </div>
        <div className="col-span-2">
          <dt className="text-earth-500">手動異動</dt>
          <dd className="mt-1 text-sm text-earth-700">
            提領 NT$ {cashWithdrawal}．補入 NT$ {cashDeposit}．調整 NT$ {cashAdjustment}
          </dd>
        </div>
      </dl>
    </div>
  );
}

// ============================================================
// 右欄：OPEN 狀態決策區（系統應有現金 highlight + 閉店點錢表單 + PR-6 callout）
// ============================================================

function ClosingPanel({
  sessionId,
  liveTotals,
  canClose,
}: {
  sessionId: string;
  liveTotals: CashDrawerLiveTotals;
  canClose: boolean;
}) {
  async function handleClose(formData: FormData) {
    "use server";
    const result = await closeCashDrawerAction({
      sessionId,
      closingActualCash: Number(formData.get("closingActualCash")),
      note: (formData.get("note") as string) || undefined,
    });
    if (!result.success) {
      redirect(`/dashboard/cash-drawer?error=${encodeURIComponent(result.error || "閉店失敗")}`);
    }
    redirect("/dashboard/cash-drawer");
  }

  return (
    <>
      {/* 系統應有現金 — 從今日交易摘要抽出獨立卡，靠近閉店表單方便對照 */}
      <div className="rounded-xl border border-primary-200 bg-primary-50 p-5 shadow-sm">
        <p className="text-xs text-primary-700">系統應有現金（含開店帳面）</p>
        <p className="mt-1 text-2xl font-bold text-primary-900">
          NT$ {liveTotals.expectedClosingCash.toString()}
        </p>
      </div>

      {/* 閉店點錢 */}
      <div className="rounded-xl border bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-earth-900">閉店點錢</h2>
        <p className="mt-1 text-sm text-earth-500">
          請現場清點抽屜內現金，輸入實際金額。閉店後 session 將鎖定。
        </p>

        {/* PR-6：閉店前確認提醒（避免誤按閉店無法補登異動）*/}
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-sm font-medium text-amber-900">閉店前確認</p>
          <ul className="mt-1 space-y-0.5 text-xs text-amber-800">
            <li>若今日沒有提領、補入或調整，可直接閉店。</li>
            <li>若有，請先完成登錄後再閉店。</li>
            <li>閉店後今日紀錄將鎖定，無法再新增現金異動。</li>
          </ul>
        </div>

        {!canClose && (
          <div className="mt-4 rounded-lg bg-earth-50 px-4 py-3 text-sm text-earth-600">
            您沒有閉店點錢的權限。
          </div>
        )}

        {canClose && (
          <form action={handleClose} className="mt-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-earth-700">
                實際點到金額（NT$）
              </label>
              <input
                type="number"
                name="closingActualCash"
                required
                min={0}
                step={1}
                className="mt-1 block w-full rounded-lg border border-earth-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400"
                placeholder={`例如 ${liveTotals.expectedClosingCash.toString()}`}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-earth-700">
                差額原因（若與系統應有不同必填）
              </label>
              <textarea
                name="note"
                rows={2}
                className="mt-1 block w-full rounded-lg border border-earth-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400"
                placeholder="若實際金額與系統應有金額不同，請說明原因"
              />
            </div>
            <SubmitButton
              label="完成今日閉店點錢"
              className="w-full bg-primary-600 text-white hover:bg-primary-700"
            />
          </form>
        )}
      </div>
    </>
  );
}

// ============================================================
// 右欄：CLOSED 狀態結算卡（系統應有 / 閉店實點 / 差額 / 帳面結餘）
// ============================================================

function ClosedSettlementCard({ session }: { session: OpenedTodaySession }) {
  const closingDiff = formatDiff(session.closingDifference?.toNumber() ?? 0);

  return (
    <div className="rounded-xl border bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-earth-900">閉店結算</h2>
      <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
        <div>
          <dt className="text-earth-500">系統應有</dt>
          <dd className="mt-1 text-lg font-medium text-earth-900">
            NT$ {session.expectedClosingCash?.toString() ?? "—"}
          </dd>
        </div>
        <div>
          <dt className="text-earth-500">閉店實點</dt>
          <dd className="mt-1 text-lg font-medium text-earth-900">
            NT$ {session.closingActualCash?.toString() ?? "—"}
          </dd>
        </div>
        <div>
          <dt className="text-earth-500">差額</dt>
          <dd className={`mt-1 text-lg font-medium ${closingDiff.className}`}>
            NT$ {closingDiff.label}
          </dd>
        </div>
        <div>
          <dt className="text-earth-500">閉店時間</dt>
          <dd className="mt-1 text-sm text-earth-900">
            {session.closedAt ? formatTWTime(session.closedAt) : "—"}
          </dd>
        </div>
        {session.closingNote && (
          <div className="col-span-2">
            <dt className="text-earth-500">閉店備註</dt>
            <dd className="mt-1 whitespace-pre-wrap text-sm text-earth-900">
              {session.closingNote}
            </dd>
          </div>
        )}
      </dl>
      <div className="mt-6 rounded-lg bg-primary-50 px-4 py-3">
        <p className="text-xs text-primary-700">帳面結餘（明日開店帳面起點）</p>
        <p className="mt-1 text-2xl font-bold text-primary-900">
          NT$ {session.finalBookBalance?.toString() ?? "—"}
        </p>
      </div>
    </div>
  );
}
