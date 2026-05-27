/**
 * CashDrawerWorkspace — 現金抽屜工作台共用元件
 *
 * 由 /dashboard/cashbook（主入口：現金管理一頁式工作台）與
 * /dashboard/cash-drawer（保留的獨立入口）共用。caller 負責 fetch
 * `getCashDrawerView()` + 權限檢查，本元件只負責 render。
 *
 * 重點：form submit 後的 redirect 走 `returnPath` prop，不再硬跳
 * /dashboard/cash-drawer，讓元件能嵌入任何 page 而不破壞同頁體驗。
 *
 * 資料邏輯與計算規則完全沿用 src/lib/cash-drawer / src/server/queries/cash-drawer，
 * 本元件不重算 expectedClosingCash / finalBookBalance。
 */

import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";

import { formatTWTime } from "@/lib/date-utils";
import { SubmitButton } from "@/components/submit-button";

import type { CashDrawerView, CashDrawerLiveTotals } from "@/server/queries/cash-drawer";
import type { CashDrawerEntry } from "@prisma/client";
import {
  initializeCashDrawerAction,
  openCashDrawerAction,
  closeCashDrawerAction,
} from "@/server/actions/cash-drawer";
import { EntrySection } from "./entry-section";

interface CashDrawerWorkspaceProps {
  view: CashDrawerView;
  todayStr: string;
  /** OWNER / ADMIN 才能首次啟用 */
  canInit: boolean;
  /** cashDrawer.open */
  canOpen: boolean;
  /** cashDrawer.close */
  canClose: boolean;
  /** cashDrawer.entry */
  canAddEntry: boolean;
  /** 表單成功後 redirect 回的 URL，例如
   *   "/dashboard/cashbook#cash-drawer-workspace"（從現金管理主頁）
   *   "/dashboard/cash-drawer"（從獨立頁）
   *  失敗時會自動附 ?cashDrawerError=... 給 FormErrorToast 顯示 */
  returnPath: string;
}

export function CashDrawerWorkspace({
  view,
  todayStr,
  canInit,
  canOpen,
  canClose,
  canAddEntry,
  returnPath,
}: CashDrawerWorkspaceProps) {
  return (
    <div className="space-y-4">
      {/* State A: 未啟用 — 單卡置中 */}
      {view.state === "EMPTY" && (
        <div className="mx-auto w-full max-w-2xl">
          <EmptyStateCard canInit={canInit} todayStr={todayStr} returnPath={returnPath} />
        </div>
      )}

      {/* State D: 上日尚未閉店 — 單卡置中 */}
      {view.state === "WARNING_LAST_OPEN" && (
        <div className="mx-auto w-full max-w-2xl">
          <WarningLastOpenCard lastSession={view.lastSession} />
        </div>
      )}

      {/* State B: 今日未開店 — 兩張窄卡上下堆疊置中 */}
      {view.state === "NOT_OPENED_TODAY" && (
        <div className="mx-auto w-full max-w-2xl">
          <NotOpenedTodayCard
            lastSession={view.lastSession}
            canOpen={canOpen}
            todayStr={todayStr}
            returnPath={returnPath}
          />
        </div>
      )}

      {/* State C: 今日已開店（OPEN / CLOSED）— 桌機 / iPad 橫向左 2 右 1，手機 / iPad 直向單欄 */}
      {view.state === "OPENED_TODAY" && (
        <OpenedTodayWorkspace
          session={view.session}
          liveTotals={view.liveTotals}
          entries={view.entries}
          canClose={canClose}
          canAddEntry={canAddEntry}
          returnPath={returnPath}
        />
      )}
    </div>
  );
}

// ============================================================
// State A — Empty / 未啟用
// ============================================================

function EmptyStateCard({
  canInit,
  todayStr,
  returnPath,
}: {
  canInit: boolean;
  todayStr: string;
  returnPath: string;
}) {
  async function handleInitialize(formData: FormData) {
    "use server";
    const result = await initializeCashDrawerAction({
      businessDate: todayStr,
      openingBookBalance: Number(formData.get("openingBookBalance")),
      openingActualCash: Number(formData.get("openingActualCash")),
      note: (formData.get("note") as string) || undefined,
    });
    if (!result.success) {
      redirect(
        `${returnPath}${returnPath.includes("?") ? "&" : "?"}cashDrawerError=${encodeURIComponent(result.error || "啟用失敗")}`,
      );
    }
    redirect(returnPath);
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
              className="mt-1 block min-h-[44px] w-full rounded-lg border border-earth-300 px-3 py-2 text-base tabular-nums focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400"
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
              className="mt-1 block min-h-[44px] w-full rounded-lg border border-earth-300 px-3 py-2 text-base tabular-nums focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400"
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
            className="min-h-[44px] w-full bg-primary-600 text-base text-white hover:bg-primary-700"
          />
        </form>
      )}
    </div>
  );
}

// ============================================================
// State D — Warning（上日尚未閉店）
// ============================================================

function WarningLastOpenCard({
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

function NotOpenedTodayCard({
  lastSession,
  canOpen,
  todayStr,
  returnPath,
}: {
  lastSession: { businessDate: Date; finalBookBalance: Prisma.Decimal | null };
  canOpen: boolean;
  todayStr: string;
  returnPath: string;
}) {
  async function handleOpen(formData: FormData) {
    "use server";
    const result = await openCashDrawerAction({
      businessDate: todayStr,
      openingActualCash: Number(formData.get("openingActualCash")),
      note: (formData.get("note") as string) || undefined,
    });
    if (!result.success) {
      redirect(
        `${returnPath}${returnPath.includes("?") ? "&" : "?"}cashDrawerError=${encodeURIComponent(result.error || "開店失敗")}`,
      );
    }
    redirect(returnPath);
  }

  const lastBalance = lastSession.finalBookBalance?.toString() ?? "—";

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-primary-50 p-4 text-primary-900">
        <p className="text-sm">
          上日（{formatTWTime(lastSession.businessDate, { dateOnly: true })}）閉店帳面結餘
        </p>
        <p className="mt-1 text-2xl font-bold tabular-nums">NT$ {lastBalance}</p>
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
                className="mt-1 block min-h-[44px] w-full rounded-lg border border-earth-300 px-3 py-2 text-base tabular-nums focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400"
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
              className="min-h-[44px] w-full bg-primary-600 text-base text-white hover:bg-primary-700"
            />
          </form>
        )}
      </div>
    </div>
  );
}

// ============================================================
// State C — 今日已開店 / 已閉店 工作台（OPEN / CLOSED dispatcher）
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
  // CLOSED 時才有值
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

function formatDiff(value: number): {
  label: string;
  className: string;
  /** 非 0 時的 chip 背景，用來在差額不為 0 時更明顯提醒店長 */
  chipClassName: string;
} {
  if (value === 0) {
    return { label: "0", className: "text-earth-600", chipClassName: "" };
  }
  if (value > 0) {
    return {
      label: `+${value}`,
      className: "text-green-800",
      chipClassName: "bg-green-50 ring-1 ring-green-200",
    };
  }
  return {
    label: `${value}`,
    className: "text-orange-800",
    chipClassName: "bg-orange-50 ring-1 ring-orange-200",
  };
}

function OpenedTodayWorkspace({
  session,
  liveTotals,
  entries,
  canClose,
  canAddEntry,
  returnPath,
}: {
  session: OpenedTodaySession;
  liveTotals: CashDrawerLiveTotals | null;
  entries: CashDrawerEntry[];
  canClose: boolean;
  canAddEntry: boolean;
  returnPath: string;
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

      {/* iPad portrait / 縮窄桌機 (md+, ≥768)：左 2 / 右 1 真正分區，右欄 sticky 讓
          店長滑動左側紀錄時仍能看到「系統應有現金 / 閉店點錢」操作區。
          手機 (< md)：單欄堆疊，避免擠壓。
          sticky top-16：避開頁面頂端 sticky header (h-14 = 56px) 留小間隔。 */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3 md:gap-6">
        {/* 左：開店紀錄 + 今日交易摘要 + 現金異動 */}
        <div className="space-y-4 md:col-span-2">
          <OpeningRecordCard session={session} />

          {/* 今日交易摘要 — OPEN 用 liveTotals，CLOSED 用 session snapshot */}
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

          {/* 現金異動：OPEN 可新增，CLOSED 唯讀 */}
          <EntrySection
            sessionId={session.id}
            entries={entries}
            canAddEntry={!isClosed && canAddEntry}
            returnPath={returnPath}
          />
        </div>

        {/* 右：OPEN → 系統應有現金 + 閉店點錢 form；CLOSED → 閉店結算
            md+ 用 sticky-top + self-start 讓右欄釘在視窗上方，店長滑動左側
            紀錄時關店操作永遠可見；self-start 防止 grid 預設拉滿欄高度導致
            sticky 失效。 */}
        <div className="space-y-4 md:sticky md:top-16 md:col-span-1 md:self-start">
          {!isClosed && liveTotals && (
            <ClosingPanel
              sessionId={session.id}
              liveTotals={liveTotals}
              canClose={canClose}
              returnPath={returnPath}
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
          <dd className="mt-1 text-lg font-medium tabular-nums text-earth-900">
            NT$ {session.openingBookBalance.toString()}
          </dd>
        </div>
        <div>
          <dt className="text-earth-500">實際點到</dt>
          <dd className="mt-1 text-lg font-medium tabular-nums text-earth-900">
            NT$ {session.openingActualCash.toString()}
          </dd>
        </div>
        <div>
          <dt className="text-earth-500">差額</dt>
          <dd className="mt-1">
            <span
              className={`inline-block rounded-md px-2 py-0.5 text-lg font-medium tabular-nums ${openingDiff.className} ${openingDiff.chipClassName}`}
            >
              NT$ {openingDiff.label}
            </span>
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
// 子卡：今日交易摘要（OPEN live / CLOSED snapshot 共用，金額由 caller 字串化）
// 系統應有現金 highlight 已抽到右欄獨立卡（ClosingPanel 上方）
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
          <dd className="mt-1 text-base font-medium tabular-nums text-green-700">
            + NT$ {cashIncome}
          </dd>
        </div>
        <div>
          <dt className="text-earth-500">現金退款</dt>
          <dd className="mt-1 text-base font-medium tabular-nums text-orange-700">
            − NT$ {cashExpense}
          </dd>
        </div>
        <div className="col-span-2">
          <dt className="text-earth-500">手動異動</dt>
          <dd className="mt-2 grid grid-cols-3 gap-2 text-sm">
            <div className="rounded-lg bg-earth-50 px-3 py-2">
              <div className="text-xs text-earth-500">提領</div>
              <div className="mt-0.5 font-medium tabular-nums text-earth-800">
                NT$ {cashWithdrawal}
              </div>
            </div>
            <div className="rounded-lg bg-earth-50 px-3 py-2">
              <div className="text-xs text-earth-500">補入</div>
              <div className="mt-0.5 font-medium tabular-nums text-earth-800">
                NT$ {cashDeposit}
              </div>
            </div>
            <div className="rounded-lg bg-earth-50 px-3 py-2">
              <div className="text-xs text-earth-500">調整</div>
              <div className="mt-0.5 font-medium tabular-nums text-earth-800">
                NT$ {cashAdjustment}
              </div>
            </div>
          </dd>
        </div>
      </dl>
    </div>
  );
}

// ============================================================
// 右欄：OPEN 狀態決策區（系統應有現金 highlight + 閉店點錢 form + PR-6 callout）
// ============================================================

function ClosingPanel({
  sessionId,
  liveTotals,
  canClose,
  returnPath,
}: {
  sessionId: string;
  liveTotals: CashDrawerLiveTotals;
  canClose: boolean;
  returnPath: string;
}) {
  async function handleClose(formData: FormData) {
    "use server";
    const result = await closeCashDrawerAction({
      sessionId,
      closingActualCash: Number(formData.get("closingActualCash")),
      note: (formData.get("note") as string) || undefined,
    });
    if (!result.success) {
      redirect(
        `${returnPath}${returnPath.includes("?") ? "&" : "?"}cashDrawerError=${encodeURIComponent(result.error || "閉店失敗")}`,
      );
    }
    redirect(returnPath);
  }

  return (
    <>
      {/* 系統應有現金 — 從今日交易摘要抽出獨立卡，靠近閉店表單方便對照 */}
      <div className="rounded-xl border border-primary-200 bg-primary-50 p-5 shadow-sm">
        <p className="text-xs font-medium text-primary-700">
          系統應有現金（含開店帳面）
        </p>
        <p className="mt-1 text-2xl font-bold tabular-nums text-primary-900 lg:text-3xl">
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
        <div className="mt-3 rounded-lg border border-amber-200 border-l-4 border-l-amber-500 bg-amber-50 px-4 py-3">
          <p className="text-base font-semibold text-amber-900">閉店前確認</p>
          <ul className="mt-2 space-y-1 text-sm text-amber-900">
            <li>· 若今日沒有提領、補入或調整，可直接閉店。</li>
            <li>· 若有，請先完成登錄後再閉店。</li>
            <li>· 閉店後今日紀錄將鎖定，無法再新增現金異動。</li>
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
                className="mt-1 block min-h-[44px] w-full rounded-lg border border-earth-300 px-3 py-2 text-base tabular-nums focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400"
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
              className="min-h-[44px] w-full bg-primary-600 text-base text-white hover:bg-primary-700"
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
          <dd className="mt-1 text-lg font-medium tabular-nums text-earth-900">
            NT$ {session.expectedClosingCash?.toString() ?? "—"}
          </dd>
        </div>
        <div>
          <dt className="text-earth-500">閉店實點</dt>
          <dd className="mt-1 text-lg font-medium tabular-nums text-earth-900">
            NT$ {session.closingActualCash?.toString() ?? "—"}
          </dd>
        </div>
        <div>
          <dt className="text-earth-500">差額</dt>
          <dd className="mt-1">
            <span
              className={`inline-block rounded-md px-2 py-0.5 text-lg font-medium tabular-nums ${closingDiff.className} ${closingDiff.chipClassName}`}
            >
              NT$ {closingDiff.label}
            </span>
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
        <p className="text-xs font-medium text-primary-700">
          帳面結餘（明日開店帳面起點）
        </p>
        <p className="mt-1 text-2xl font-bold tabular-nums text-primary-900">
          NT$ {session.finalBookBalance?.toString() ?? "—"}
        </p>
      </div>
    </div>
  );
}
