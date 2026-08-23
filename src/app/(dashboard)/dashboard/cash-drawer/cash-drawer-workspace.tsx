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

import type { ReactNode } from "react";
import { Prisma } from "@prisma/client";

import { formatTWTime } from "@/lib/date-utils";

import type {
  CashDrawerView,
  CashDrawerLiveTotals,
  CashDrawerPaymentOverview,
} from "@/server/queries/cash-drawer";
import type { CashDrawerEntry } from "@prisma/client";
import type { ActionResult } from "@/types";
import {
  initializeCashDrawerAction,
  openCashDrawerAction,
  closeCashDrawerAction,
  reopenCashDrawerAction,
  addCashDrawerEntryAction,
} from "@/server/actions/cash-drawer";
import { createCashbookEntry } from "@/server/actions/cashbook";
import { EntrySection } from "./entry-section";
import { TodayOpenForm } from "./today-open-form";
import { WithdrawalForm, DepositForm } from "./cash-entry-forms";
import { CashDrawerActionForm } from "./cash-drawer-action-form";
import { InlineCashbookForm } from "./inline-cashbook-form";

/** ADMIN 指派登錄人用的店長清單（避免在多處重打 inline 型別）。 */
type StaffOption = { id: string; displayName: string };

/**
 * 把 form 的 createCashbookEntry 包成 useActionState 用的 (prev, formData) 簽章。
 * 提供給「記一筆收支」inline form（營業中 / 已結帳補登 共用）。
 * 業務邏輯完全在 createCashbookEntry，本層只搬 FormData → input。
 * 類型限定 INCOME / EXPENSE（提領走 WithdrawalForm / cashDrawer.entry）。
 */
async function handleAddCashbookEntry(
  _prev: ActionResult<unknown> | null,
  formData: FormData,
): Promise<ActionResult<{ entryId: string }>> {
  "use server";
  // 後端權威：本入口只准 INCOME / EXPENSE。即使有人 tamper request 送
  // WITHDRAW / ADJUSTMENT，也在進 createCashbookEntry 前擋掉並回錯（inline form 顯示），
  // 提領仍只能走 WithdrawalForm / CashDrawerEntry。
  const type = formData.get("type");
  if (type !== "INCOME" && type !== "EXPENSE") {
    return { success: false, error: "此入口僅能新增收入或支出（提領請使用提領功能）" };
  }
  return createCashbookEntry({
    entryDate: String(formData.get("entryDate") ?? ""),
    type,
    category: (formData.get("category") as string) || undefined,
    amount: Number(formData.get("amount")),
    paymentMethod: formData.get("paymentMethod") as "CASH" | "OTHER",
    staffId: (formData.get("staffId") as string) || undefined,
    note: (formData.get("note") as string) || undefined,
    confirmClosedCashbookChange: formData.get("confirmClosedCashbookChange") === "on",
  });
}

/** "2026-05-29" → "2026/05/29"（今日狀態卡標題用） */
function formatDateSlash(todayStr: string): string {
  return todayStr.replaceAll("-", "/");
}

interface CashDrawerWorkspaceProps {
  view: CashDrawerView;
  todayStr: string;
  /** OWNER / ADMIN 才能首次啟用 */
  canInit: boolean;
  /** cashDrawer.open */
  canOpen: boolean;
  /** cashDrawer.close */
  canClose: boolean;
  /** OWNER / ADMIN 才可撤銷閉店 */
  canReopen: boolean;
  /** cashDrawer.entry */
  canAddEntry: boolean;
  /** cashbook.create — 是否能新增現金帳（「記一筆收入」入口會連到 /dashboard/cashbook/new，
   *  該頁用 cashbook.create 把關；與 cashDrawer.* 是兩套權限，必須分開判斷，
   *  否則只有 cashDrawer 權限的使用者點了會被 redirect，變成點不動的主操作） */
  canCreateCashbook: boolean;
  /** 已閉店營業日（近 ~180 天），給「記一筆收支」inline form 前端防呆提示。 */
  closedDates: string[];
  /** ADMIN 才能指派登錄人（與 cashbook/new 一致）。 */
  canAssignStaff: boolean;
  /** ADMIN 指派登錄人用的店長清單。 */
  staffOptions: StaffOption[];
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
  canReopen,
  canAddEntry,
  canCreateCashbook,
  closedDates,
  canAssignStaff,
  staffOptions,
  returnPath,
}: CashDrawerWorkspaceProps) {
  return (
    <div className="space-y-3">
      {/* State A: 未啟用 — 單卡置中 */}
      {view.state === "EMPTY" && (
        <div className="mx-auto w-full max-w-2xl">
          <EmptyStateCard canInit={canInit} todayStr={todayStr} returnPath={returnPath} />
        </div>
      )}

      {/* State D: 上日尚未閉店 — 單卡置中，含補關入口 */}
      {view.state === "WARNING_LAST_OPEN" && (
        <div className="mx-auto w-full max-w-2xl">
          <WarningLastOpenCard
            lastSession={view.lastSession}
            liveTotals={view.liveTotals}
            canClose={canClose}
            returnPath={returnPath}
          />
        </div>
      )}

      {/* State B: 今日未開店 — 桌機左右並排（狀態 / 開店點錢），窄螢幕單欄堆疊 */}
      {view.state === "NOT_OPENED_TODAY" && (
        <div className="mx-auto w-full max-w-5xl">
          <NotOpenedTodayCard
            lastSession={view.lastSession}
            canOpen={canOpen}
            todayStr={todayStr}
            returnPath={returnPath}
          />
        </div>
      )}

      {/* State C: 今日已開店（OPEN / CLOSED）— 一頁式：今日狀態卡 → 日常操作區 → 明細 */}
      {view.state === "OPENED_TODAY" && (
        <OpenedTodayWorkspace
          session={view.session}
          liveTotals={view.liveTotals}
          paymentOverview={view.paymentOverview}
          entries={view.entries}
          canClose={canClose}
          canReopen={canReopen}
          canAddEntry={canAddEntry}
          canCreateCashbook={canCreateCashbook}
          closedDates={closedDates}
          canAssignStaff={canAssignStaff}
          staffOptions={staffOptions}
          returnPath={returnPath}
          todayStr={todayStr}
        />
      )}
    </div>
  );
}

// ============================================================
// 今日狀態卡（PR-G5.1a）— 一頁式最上方的狀態摘要
// 標題「今日現金管理 YYYY/MM/DD」+ 狀態徽章 +（依狀態）頭條數字
// ============================================================

const STATUS_BADGE = {
  NOT_OPENED: { label: "尚未開店", cls: "bg-amber-100 text-amber-700", dot: "bg-amber-500" },
  OPEN: { label: "營業中", cls: "bg-green-100 text-green-700", dot: "bg-green-500" },
  CLOSED: { label: "今日已結帳", cls: "bg-earth-200 text-earth-700", dot: "bg-earth-400" },
} as const;

function TodayStatusCard({
  todayStr,
  status,
  children,
}: {
  todayStr: string;
  status: keyof typeof STATUS_BADGE;
  children: ReactNode;
}) {
  const badge = STATUS_BADGE[status];
  return (
    <div className="rounded-xl border border-earth-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-earth-900">
          今日現金管理　{formatDateSlash(todayStr)}
        </h2>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${badge.cls}`}
        >
          <span className={`inline-block h-2 w-2 rounded-full ${badge.dot}`} />
          {badge.label}
        </span>
      </div>
      <div className="mt-3">{children}</div>
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
  async function handleInitialize(
    _prev: ActionResult<unknown> | null,
    formData: FormData,
  ): Promise<ActionResult<{ sessionId: string }>> {
    "use server";
    return initializeCashDrawerAction({
      businessDate: todayStr,
      openingBookBalance: Number(formData.get("openingBookBalance")),
      openingActualCash: Number(formData.get("openingActualCash")),
      note: (formData.get("note") as string) || undefined,
    });
  }

  return (
    <div className="rounded-xl border border-earth-200 bg-white p-4">
      <h2 className="text-base font-semibold text-earth-900">啟用現金抽屜</h2>
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
        <CashDrawerActionForm
          action={handleInitialize}
          returnPath={returnPath}
          submitLabel="啟用現金抽屜"
          successPendingLabel="已啟用，跳轉中…"
          submitClassName="min-h-[44px] w-full bg-primary-600 text-base text-white hover:bg-primary-700"
          className="mt-6 space-y-4"
        >
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
        </CashDrawerActionForm>
      )}
    </div>
  );
}

// ============================================================
// State D — Warning（上日尚未閉店）+ 補關入口
// ============================================================

function WarningLastOpenCard({
  lastSession,
  liveTotals,
  canClose,
  returnPath,
}: {
  lastSession: {
    id: string;
    businessDate: Date;
    openedAt: Date;
    openingBookBalance: Prisma.Decimal;
  };
  liveTotals: CashDrawerLiveTotals;
  canClose: boolean;
  returnPath: string;
}) {
  async function handleCatchUpClose(
    _prev: ActionResult<unknown> | null,
    formData: FormData,
  ): Promise<ActionResult<{ sessionId: string }>> {
    "use server";
    return closeCashDrawerAction({
      sessionId: lastSession.id,
      closingActualCash: Number(formData.get("closingActualCash")),
      note: (formData.get("note") as string) || undefined,
    });
  }

  return (
    <div className="rounded-xl border border-orange-200 bg-orange-50 p-4">
      <h2 className="text-base font-semibold text-orange-900">
        上一個營業日尚未閉店
      </h2>
      <p className="mt-2 text-sm text-orange-800">
        此 session 仍在 OPEN 狀態。請先補關上一個現金抽屜，補關後系統會以
        系統預估結餘作為下次開店帳面起點，今日才能正常開店。
      </p>

      <dl className="mt-3 grid grid-cols-2 gap-3 rounded-lg bg-white/60 p-3 text-sm">
        <div>
          <dt className="text-orange-700">營業日</dt>
          <dd className="mt-1 font-medium text-orange-900">
            {formatTWTime(lastSession.businessDate, { dateOnly: true })}
          </dd>
        </div>
        <div>
          <dt className="text-orange-700">開店時間</dt>
          <dd className="mt-1 font-medium text-orange-900">
            {formatTWTime(lastSession.openedAt)}
          </dd>
        </div>
        <div>
          <dt className="text-orange-700">開店帳面</dt>
          <dd className="mt-1 font-medium tabular-nums text-orange-900">
            NT$ {lastSession.openingBookBalance.toString()}
          </dd>
        </div>
        <div>
          <dt className="text-orange-700">系統預估結餘</dt>
          <dd className="mt-1 text-base font-semibold tabular-nums text-orange-900">
            NT$ {liveTotals.expectedClosingCash.toString()}
          </dd>
        </div>
      </dl>

      {!canClose && (
        <div className="mt-4 rounded-lg bg-white px-4 py-3 text-sm text-earth-600">
          您沒有閉店點錢的權限，請聯絡管理員處理補關。
        </div>
      )}

      {canClose && (
        <details className="mt-4 rounded-lg border border-orange-300 bg-white">
          <summary className="cursor-pointer list-none rounded-lg bg-orange-600 px-4 py-3 text-base font-semibold text-white hover:bg-orange-700">
            補關上一個現金抽屜
          </summary>
          <CashDrawerActionForm
            action={handleCatchUpClose}
            returnPath={returnPath}
            submitLabel="完成補關"
            successPendingLabel="已補關，跳轉中…"
            submitClassName="min-h-[44px] w-full bg-orange-600 text-base text-white hover:bg-orange-700"
            className="space-y-4 p-4"
          >
            <p className="text-xs text-earth-500">
              請依據上一個營業日結束時的實際現金清點金額填入，差額會由系統
              比對「系統預估結餘」自動計算。本動作不會建立任何 Transaction
              或現金日誌條目，僅閉鎖此 session 並啟用今日開店。
            </p>
            <div>
              <label className="block text-sm font-medium text-earth-700">
                實際現金（NT$）
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
              <p className="mt-1 text-xs text-earth-500">
                若與系統預估結餘（NT$ {liveTotals.expectedClosingCash.toString()}
                ）不同，下方備註必填。
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-earth-700">
                備註（若有差額必填）
              </label>
              <textarea
                name="note"
                rows={3}
                className="mt-1 block w-full rounded-lg border border-earth-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400"
                placeholder="例：5/28 公休，5/29 補關 5/27 session"
              />
            </div>
          </CashDrawerActionForm>
        </details>
      )}
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
  /**
   * 包一層 (prevState, formData) → openCashDrawerAction 的 server action 給
   * `TodayOpenForm` 的 `useActionState`。todayStr / returnPath 在 server-side
   * closure 內綁好，client 不會看到也不會改到。
   *
   * 與舊版差異：成功時**不** call `redirect()`，而是 return success result，
   * 讓 client `useActionState` 收到後自己 `window.location.assign(returnPath)`，
   * 走真正的 hard navigation（=F5 等效），繞開 Next.js same-URL redirect 在
   * action response 內 inline RSC payload 的卡死路徑（PR #227 Preview 觀察）。
   * 錯誤路徑保留既有「redirect 帶 `?cashDrawerError=` + FormErrorToast」UX。
   */
  async function handleOpenAction(
    _prev: ActionResult<unknown> | null,
    formData: FormData,
  ): Promise<ActionResult<{ sessionId: string }>> {
    "use server";
    const result = await openCashDrawerAction({
      businessDate: todayStr,
      openingActualCash: Number(formData.get("openingActualCash")),
      note: (formData.get("note") as string) || undefined,
    });
    return result;
  }

  const lastBalance = lastSession.finalBookBalance?.toString() ?? "—";

  // 桌機左右並排：左欄今日狀態（開店起點），右欄唯一操作「開店點錢」；
  // 窄螢幕單欄堆疊（狀態在上、開店點錢在下）。版面拉寬避免窄窄一條。
  return (
    <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-2">
      <TodayStatusCard todayStr={todayStr} status="NOT_OPENED">
        <p className="text-sm text-earth-500">今日開店起點</p>
        <p className="mt-1 text-2xl font-bold tabular-nums text-earth-900">
          NT$ {lastBalance}
        </p>
        <p className="mt-2 text-sm text-earth-600">
          從上次閉店（{formatTWTime(lastSession.businessDate, { dateOnly: true })}
          ）實際點到的現金開始。
        </p>
      </TodayStatusCard>

      {/* 日常操作區（尚未開店）：依傻瓜流程只放「開店點錢」主操作。
          提領 / 補入 / 記收入要等開店後才出現，避免店長搞不清楚今天抽屜起點。 */}
      <div className="rounded-xl border border-earth-200 bg-white p-4">
        <h2 className="text-base font-semibold text-earth-900">開店點錢</h2>
        <p className="mt-1 text-sm text-earth-500">
          請現場清點抽屜內現金，輸入實際金額。
        </p>
        <p className="mt-2 rounded-lg bg-earth-50 px-3 py-2 text-xs text-earth-600">
          先完成開店點錢，開店後就可以記收入、提領或補入現金。
        </p>

        {!canOpen && (
          <div className="mt-4 rounded-lg bg-earth-50 px-4 py-3 text-sm text-earth-600">
            您沒有開店點錢的權限。
          </div>
        )}

        {canOpen && (
          <TodayOpenForm
            action={handleOpenAction}
            returnPath={returnPath}
            placeholderAmount={
              lastSession.finalBookBalance?.toString() ?? undefined
            }
          />
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

/**
 * PR-3：CLOSED session 不 live 查現金帳，從凍結快照反推現金帳淨額。
 *
 * expectedClosingCash 已把 cashbook(CASH) 折進去：
 *   expected = openingActual + cashIncome − cashExpense − cashWithdrawal + cashDeposit
 *              + cashAdjustment + cashbookCashIncome − cashbookCashOut
 * 反推 net = cashbookCashIncome − cashbookCashOut
 *          = expected − openingActual − cashIncome + cashExpense + cashWithdrawal
 *            − cashDeposit − cashAdjustment
 */
function deriveClosedCashbookNet(session: OpenedTodaySession): string {
  if (session.expectedClosingCash == null) return "—";
  const net = session.expectedClosingCash
    .sub(session.openingActualCash)
    .sub(session.cashIncomeTotal)
    .add(session.cashExpenseTotal)
    .add(session.cashWithdrawalTotal)
    .sub(session.cashDepositTotal)
    .sub(session.cashAdjustmentTotal);
  return net.toString();
}

function OpenedTodayWorkspace({
  session,
  liveTotals,
  paymentOverview,
  entries,
  canClose,
  canReopen,
  canAddEntry,
  canCreateCashbook,
  closedDates,
  canAssignStaff,
  staffOptions,
  returnPath,
  todayStr,
}: {
  session: OpenedTodaySession;
  liveTotals: CashDrawerLiveTotals | null;
  paymentOverview: CashDrawerPaymentOverview;
  entries: CashDrawerEntry[];
  canClose: boolean;
  canReopen: boolean;
  canAddEntry: boolean;
  canCreateCashbook: boolean;
  closedDates: string[];
  canAssignStaff: boolean;
  staffOptions: StaffOption[];
  returnPath: string;
  todayStr: string;
}) {
  const isClosed = session.status === "CLOSED";

  // PR-G5.1a v2：桌機 / iPad 友善版面。
  //   桌機（lg+）：左 2/3 今日狀態 + 收款總覽 / 其他異動、右 1/3 日常操作（sticky），
  //               兩者在第一屏並排；開店紀錄 / 現金異動置於下方 full width。
  //   iPad / 手機（< lg）：單欄，靠 order 控制資訊優先序
  //               「今日狀態 → 日常操作 → 收款總覽 → 其他異動 → 紀錄」，
  //               讓店長一進來先看到狀態與要按的操作，而非一堆明細。
  const summaryCard = !isClosed && liveTotals ? (
    <TransactionSummaryCard
      live
      cashExpense={liveTotals.cashExpenseTotal.toString()}
      cashWithdrawal={liveTotals.cashWithdrawalTotal.toString()}
      cashDeposit={liveTotals.cashDepositTotal.toString()}
      cashAdjustment={liveTotals.cashAdjustmentTotal.toString()}
      cashbookCashOut={liveTotals.cashbookCashOut.toString()}
    />
  ) : (
    <TransactionSummaryCard
      live={false}
      cashExpense={session.cashExpenseTotal.toString()}
      cashWithdrawal={session.cashWithdrawalTotal.toString()}
      cashDeposit={session.cashDepositTotal.toString()}
      cashAdjustment={session.cashAdjustmentTotal.toString()}
      cashbookNet={deriveClosedCashbookNet(session)}
    />
  );

  return (
    <div className="w-full space-y-3">
      {/* 第一屏：今日狀態（含摘要 glance）+ 今日收款總覽 + 今日其他異動 + 日常操作。
          桌機 3 欄（左 2 欄資訊、右 1 欄操作 sticky）；窄螢幕單欄靠 order 排序。 */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {/* A. 今日狀態卡 — 第一順位 */}
        <div className="order-1 lg:col-span-2 lg:col-start-1 lg:row-start-1">
          {!isClosed && liveTotals ? (
            <OpenStatusCard session={session} liveTotals={liveTotals} todayStr={todayStr} />
          ) : (
            <ClosedStatusCard session={session} todayStr={todayStr} />
          )}
        </div>

        {/* B. 日常操作區 — 窄螢幕第二順位（緊接狀態）；桌機沉到右欄並 sticky */}
        <div className="order-2 lg:col-start-3 lg:row-span-3 lg:row-start-1 lg:self-start lg:sticky lg:top-4">
          {!isClosed && liveTotals ? (
            <DailyActionsArea
              sessionId={session.id}
              liveTotals={liveTotals}
              canClose={canClose}
              canAddEntry={canAddEntry}
              canCreateCashbook={canCreateCashbook}
              closedDates={closedDates}
              canAssignStaff={canAssignStaff}
              staffOptions={staffOptions}
              todayStr={todayStr}
              returnPath={returnPath}
            />
          ) : (
            <ClosedActionsArea
              sessionId={session.id}
              canReopen={canReopen}
              canCreateCashbook={canCreateCashbook}
              closedDates={closedDates}
              canAssignStaff={canAssignStaff}
              staffOptions={staffOptions}
              todayStr={todayStr}
              returnPath={returnPath}
            />
          )}
        </div>

        {/* C. 今日收款總覽 — 窄螢幕第三順位；桌機接在左欄狀態卡下方 */}
        <div className="order-3 lg:col-span-2 lg:col-start-1 lg:row-start-2">
          <PaymentOverviewCard overview={paymentOverview} />
        </div>

        {/* D. 今日其他異動 — 窄螢幕第四順位；桌機接在收款總覽下方 */}
        <div className="order-4 lg:col-span-2 lg:col-start-1 lg:row-start-3">
          {summaryCard}
        </div>
      </div>

      {/* 下方 full width：開店紀錄 / 閉店結算 / 現金異動紀錄（明細，第四順位） */}
      <OpeningRecordCard session={session} />
      {isClosed && <ClosedSettlementCard session={session} />}
      <EntrySection
        sessionId={session.id}
        entries={entries}
        canAddEntry={!isClosed && canAddEntry}
        returnPath={returnPath}
      />
    </div>
  );
}

// ============================================================
// 今日狀態卡內容：營業中（OPEN）— 目前抽屜應有現金 + 摘要
// ============================================================

function OpenStatusCard({
  session,
  liveTotals,
  todayStr,
}: {
  session: OpenedTodaySession;
  liveTotals: CashDrawerLiveTotals;
  todayStr: string;
}) {
  // 店長導向的「現金進 / 出」glance：把交易與現金帳的現金收付合併成單一數字。
  // 其他非收入異動仍在下方「今日其他異動」卡（含退款 / 提領 / 調整逐項）。
  const cashIn = liveTotals.cashIncomeTotal.add(liveTotals.cashbookCashIncome);
  const cashOut = liveTotals.cashExpenseTotal.add(liveTotals.cashbookCashOut);
  const openingDiff = formatDiff(session.openingDifference.toNumber());
  const hasOpeningDifference = !session.openingDifference.equals(0);
  const openingDifferenceCopy =
    session.openingDifference.gt(0)
      ? `已包含開店補入差額 +NT$${session.openingDifference.toString()}`
      : `已扣除開店短少差額 NT$ ${openingDiff.label}`;

  return (
    <TodayStatusCard todayStr={todayStr} status="OPEN">
      <p className="text-sm text-earth-500">目前抽屜應有現金</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-primary-900">
        NT$ {liveTotals.expectedClosingCash.toString()}
      </p>
      {hasOpeningDifference && (
        <p className="mt-1 text-xs font-medium text-primary-700">
          {openingDifferenceCopy}
        </p>
      )}

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-3">
        <SummaryItem label="今日現金流入" value={`+ NT$ ${cashIn.toString()}`} tone="text-green-700" />
        <SummaryItem label="今日現金支出" value={`− NT$ ${cashOut.toString()}`} tone="text-orange-700" />
        <SummaryItem
          label="今日提領"
          value={`− NT$ ${liveTotals.cashWithdrawalTotal.toString()}`}
          tone="text-orange-700"
        />
        <SummaryItem
          label="今日補入"
          value={`+ NT$ ${liveTotals.cashDepositTotal.toString()}`}
          tone="text-green-700"
        />
        <SummaryItem label="開店差額" value={`NT$ ${openingDiff.label}`} tone={openingDiff.className} />
      </dl>
    </TodayStatusCard>
  );
}

function SummaryItem({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div>
      <dt className="text-xs text-earth-500">{label}</dt>
      <dd className={`mt-0.5 font-medium tabular-nums ${tone}`}>{value}</dd>
    </div>
  );
}

function PaymentOverviewCard({ overview }: { overview: CashDrawerPaymentOverview }) {
  return (
    <div className="rounded-xl border border-earth-200 bg-white p-4">
      <h2 className="text-base font-semibold text-earth-900">今日收款總覽</h2>
      <dl className="mt-3 grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-earth-500">現金收入</dt>
          <dd className="mt-1 text-base font-medium tabular-nums text-green-700">
            NT$ {overview.paymentOverviewCashIncomeTotal.toString()}
          </dd>
        </div>
        <div>
          <dt className="text-earth-500">非現金收入</dt>
          <dd className="mt-1 text-base font-medium tabular-nums text-blue-700">
            NT$ {overview.nonCashIncomeTotal.toString()}
          </dd>
        </div>
        <div>
          <dt className="text-earth-500">今日收款合計</dt>
          <dd className="mt-1 text-base font-semibold tabular-nums text-earth-900">
            NT$ {overview.todayPaymentTotal.toString()}
          </dd>
        </div>
      </dl>
    </div>
  );
}

// ============================================================
// 今日狀態卡內容：今日已結帳（CLOSED）— 閉店實點 / 差額 / 下次開店起點
// ============================================================

function ClosedStatusCard({
  session,
  todayStr,
}: {
  session: OpenedTodaySession;
  todayStr: string;
}) {
  const closingDiff = formatDiff(session.closingDifference?.toNumber() ?? 0);

  return (
    <TodayStatusCard todayStr={todayStr} status="CLOSED">
      <p className="text-sm font-medium text-earth-700">今日已結帳</p>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
        <SummaryItem
          label="閉店實點"
          value={`NT$ ${session.closingActualCash?.toString() ?? "—"}`}
          tone="text-earth-900"
        />
        <SummaryItem label="差額" value={`NT$ ${closingDiff.label}`} tone={closingDiff.className} />
        <SummaryItem
          label="下次開店起點"
          value={`NT$ ${session.finalBookBalance?.toString() ?? "—"}`}
          tone="text-primary-900"
        />
      </dl>
      <p className="mt-3 text-sm text-earth-600">
        差額留在今天，下次開店從實際點到的現金開始。
      </p>
    </TodayStatusCard>
  );
}

// ============================================================
// 日常操作區（PR-G5.1a）— 營業中 4 顆大按鈕：記收入 / 提領 / 補入 / 閉店點錢
// 提領 / 補入 / 閉店 用 <details> 大按鈕原地展開既有表單（零 client state）。
// ============================================================

function DailyActionsArea({
  sessionId,
  liveTotals,
  canClose,
  canAddEntry,
  canCreateCashbook,
  closedDates,
  canAssignStaff,
  staffOptions,
  todayStr,
  returnPath,
}: {
  sessionId: string;
  liveTotals: CashDrawerLiveTotals;
  canClose: boolean;
  canAddEntry: boolean;
  canCreateCashbook: boolean;
  closedDates: string[];
  canAssignStaff: boolean;
  staffOptions: StaffOption[];
  todayStr: string;
  returnPath: string;
}) {
  // A-1：三個 handler 改回傳 ActionResult（不再 server redirect）。成功 / 失敗的
  // 導航與錯誤呈現都交給各表單外殼（CashDrawerActionForm，client useActionState）。
  async function handleAddWithdrawal(
    _prev: ActionResult<unknown> | null,
    formData: FormData,
  ): Promise<ActionResult<{ entryId: string }>> {
    "use server";
    return addCashDrawerEntryAction({
      sessionId,
      type: "CASH_WITHDRAWAL",
      amount: Number(formData.get("amount")),
      reason: String(formData.get("reason") ?? ""),
      note: (formData.get("note") as string) || undefined,
    });
  }

  async function handleAddDeposit(
    _prev: ActionResult<unknown> | null,
    formData: FormData,
  ): Promise<ActionResult<{ entryId: string }>> {
    "use server";
    return addCashDrawerEntryAction({
      sessionId,
      type: "CASH_DEPOSIT",
      amount: Number(formData.get("amount")),
      reason: String(formData.get("reason") ?? ""),
      note: (formData.get("note") as string) || undefined,
    });
  }

  async function handleClose(
    _prev: ActionResult<unknown> | null,
    formData: FormData,
  ): Promise<ActionResult<{ sessionId: string }>> {
    "use server";
    return closeCashDrawerAction({
      sessionId,
      closingActualCash: Number(formData.get("closingActualCash")),
      note: (formData.get("note") as string) || undefined,
    });
  }

  return (
    <div className="rounded-xl border border-earth-200 bg-white p-4">
      <h2 className="text-base font-semibold text-earth-900">日常操作</h2>
      <p className="mt-1 text-xs text-earth-500">
        記收支走現金帳；提領 / 補入只影響現金抽屜，不算營收或費用。
      </p>

      {/* iPad（sm/md）full width → 2 欄大按鈕；桌機（lg）操作沉到 1/3 右欄 → 改回單欄直列，當作操作入口清單 */}
      <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-1">
        {/* 1. 記一筆收支 — 原地展開現金帳 inline form（收入 / 支出），重用
            createCashbookEntry。受 cashbook.create 把關，與 cashDrawer.* 分開；
            類型限 INCOME / EXPENSE（提領走下方「提領」/ cashDrawer.entry）。 */}
        {canCreateCashbook ? (
          <details className="group rounded-xl border border-earth-200 bg-white">
            <summary className="flex min-h-[44px] cursor-pointer list-none flex-col justify-center rounded-xl px-3 py-2.5 select-none sm:min-h-[52px] hover:bg-primary-50 group-open:rounded-b-none">
              <span className="text-sm font-semibold text-earth-900">記一筆收支</span>
              <span className="mt-0.5 text-xs text-earth-500">商品收入、店內支出、非現金紀錄</span>
            </summary>
            <div className="border-t border-earth-200">
              <InlineCashbookForm
                action={handleAddCashbookEntry}
                returnPath={returnPath}
                today={todayStr}
                closedDates={closedDates}
                canAssignStaff={canAssignStaff}
                staffOptions={staffOptions}
              />
            </div>
          </details>
        ) : (
          <ActionDisabledCard title="記一筆收支" helper="您沒有新增現金帳的權限。" />
        )}

        {/* 2. 提領 — 原地展開 */}
        {canAddEntry ? (
          <details className="group rounded-xl border border-earth-200 bg-white sm:col-span-1">
            <summary className="flex min-h-[44px] cursor-pointer list-none flex-col justify-center rounded-xl px-3 py-2.5 select-none sm:min-h-[52px] hover:bg-orange-50 group-open:rounded-b-none">
              <span className="text-sm font-semibold text-earth-900">提領</span>
              <span className="mt-0.5 text-xs text-earth-500">現金從抽屜拿出去（不算店內支出）</span>
            </summary>
            <div className="border-t border-earth-200">
              <WithdrawalForm action={handleAddWithdrawal} returnPath={returnPath} />
            </div>
          </details>
        ) : (
          <ActionDisabledCard title="提領" helper="您沒有現金異動的權限。" />
        )}

        {/* 3. 補入現金 — 原地展開 */}
        {canAddEntry ? (
          <details className="group rounded-xl border border-earth-200 bg-white">
            <summary className="flex min-h-[44px] cursor-pointer list-none flex-col justify-center rounded-xl px-3 py-2.5 select-none sm:min-h-[52px] hover:bg-green-50 group-open:rounded-b-none">
              <span className="text-sm font-semibold text-earth-900">補入現金</span>
              <span className="mt-0.5 text-xs text-earth-500">找零金、備用金、保險箱補現金</span>
            </summary>
            <div className="border-t border-earth-200">
              <DepositForm action={handleAddDeposit} returnPath={returnPath} />
            </div>
          </details>
        ) : (
          <ActionDisabledCard title="補入現金" helper="您沒有現金異動的權限。" />
        )}

        {/* 4. 閉店點錢 — 原地展開（含閉店前確認） */}
        {canClose ? (
          <details className="group rounded-xl border border-primary-200 bg-primary-50/40">
            <summary className="flex min-h-[44px] cursor-pointer list-none flex-col justify-center rounded-xl px-3 py-2.5 select-none sm:min-h-[52px] hover:bg-primary-50 group-open:rounded-b-none">
              <span className="text-sm font-semibold text-primary-900">閉店點錢</span>
              <span className="mt-0.5 text-xs text-primary-700">
                結束今日營業，清點抽屜現金
              </span>
            </summary>
            <div className="space-y-4 border-t border-primary-200 p-4">
              <div className="rounded-lg bg-white px-3 py-2 text-sm">
                <span className="text-earth-500">目前系統應有現金　</span>
                <span className="font-semibold tabular-nums text-primary-900">
                  NT$ {liveTotals.expectedClosingCash.toString()}
                </span>
              </div>

              <dl className="grid grid-cols-2 gap-2 rounded-lg bg-white px-3 py-2 text-xs sm:grid-cols-3">
                <SummaryItem label="今日現金收入" value={`+ NT$ ${liveTotals.cashIncomeTotal.toString()}`} tone="text-green-700" />
                <SummaryItem label="今日現金退款" value={`− NT$ ${liveTotals.cashExpenseTotal.toString()}`} tone="text-orange-700" />
                <SummaryItem label="今日提領" value={`− NT$ ${liveTotals.cashWithdrawalTotal.toString()}`} tone="text-orange-700" />
                <SummaryItem label="今日補入" value={`+ NT$ ${liveTotals.cashDepositTotal.toString()}`} tone="text-green-700" />
                <SummaryItem label="現金調整" value={`NT$ ${liveTotals.cashAdjustmentTotal.toString()}`} tone="text-earth-700" />
              </dl>

              {/* 閉店前確認提醒（避免誤按閉店無法補登異動）*/}
              <div className="rounded-lg border border-amber-200 border-l-4 border-l-amber-500 bg-amber-50 px-4 py-3">
                <p className="text-base font-semibold text-amber-900">閉店前確認</p>
                <ul className="mt-2 space-y-1 text-sm text-amber-900">
                  <li>· 若今日沒有提領、補入或調整，可直接閉店。</li>
                  <li>· 若有，請先完成登錄後再閉店。</li>
                  <li>· 閉店後今日紀錄將鎖定，無法再新增現金異動。</li>
                </ul>
              </div>

              <CashDrawerActionForm
                action={handleClose}
                returnPath={returnPath}
                submitLabel="完成今日閉店點錢"
                successPendingLabel="已閉店，跳轉中…"
                submitClassName="min-h-[44px] w-full bg-primary-600 text-base text-white hover:bg-primary-700"
                className="space-y-4"
              >
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
              </CashDrawerActionForm>
            </div>
          </details>
        ) : (
          <ActionDisabledCard title="閉店點錢" helper="您沒有閉店點錢的權限。" />
        )}
      </div>

      {/* 提領 vs 支出 的語意說明（次要、可收合，避免店長混用） */}
      <details className="mt-3 rounded-lg bg-earth-50/60 px-4 py-2">
        <summary className="cursor-pointer list-none text-xs font-medium text-earth-600 select-none">
          提領和支出有什麼不同？
        </summary>
        <div className="mt-2 space-y-2 text-xs text-earth-600">
          <p>
            <span className="font-medium text-earth-800">提領：</span>
            現金從抽屜拿出去，例如交款、存銀行、老闆領走。
            <span className="text-earth-500">不算店內支出。</span>
          </p>
          <p>
            <span className="font-medium text-earth-800">支出：</span>
            店內花費，例如買耗材、生活用品。請用「記一筆收支」、類型選「支出」，
            付款方式選現金時會減少抽屜並記為支出。
          </p>
        </div>
      </details>
    </div>
  );
}

function ActionDisabledCard({ title, helper }: { title: string; helper: string }) {
  return (
    <div className="flex min-h-[44px] flex-col justify-center rounded-xl border border-dashed border-earth-200 bg-earth-50/60 px-3 py-2.5">
      <span className="text-sm font-semibold text-earth-400">{title}</span>
      <span className="mt-0.5 text-xs text-earth-400">{helper}</span>
    </div>
  );
}

// ============================================================
// 日常操作區（CLOSED）— 今日已結帳，僅保留補登入口
// ============================================================

function ClosedActionsArea({
  sessionId,
  canReopen,
  canCreateCashbook,
  closedDates,
  canAssignStaff,
  staffOptions,
  todayStr,
  returnPath,
}: {
  sessionId: string;
  canReopen: boolean;
  canCreateCashbook: boolean;
  closedDates: string[];
  canAssignStaff: boolean;
  staffOptions: StaffOption[];
  todayStr: string;
  returnPath: string;
}) {
  async function handleReopen(
    _prev: ActionResult<unknown> | null,
    formData: FormData,
  ): Promise<ActionResult<{ sessionId: string }>> {
    "use server";
    return reopenCashDrawerAction({
      sessionId,
      reason: String(formData.get("reason") ?? ""),
    });
  }

  return (
    <div className="rounded-xl border border-earth-200 bg-white p-4">
      <h2 className="text-base font-semibold text-earth-900">日常操作</h2>
      <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-1">
        <div className="flex min-h-[44px] flex-col justify-center rounded-xl border border-dashed border-earth-200 bg-earth-50/60 px-3 py-2.5">
          <span className="text-sm font-semibold text-earth-500">已完成今日結帳</span>
          <span className="mt-0.5 text-xs text-earth-400">
            今日紀錄已鎖定，提領 / 補入需明日重新開店後操作。
          </span>
        </div>
        {canReopen && (
          <details className="group rounded-xl border border-amber-200 bg-amber-50/40">
            <summary className="flex min-h-[44px] cursor-pointer list-none flex-col justify-center rounded-xl px-3 py-2.5 select-none hover:bg-amber-50 group-open:rounded-b-none">
              <span className="text-sm font-semibold text-amber-900">撤銷閉店</span>
              <span className="mt-0.5 text-xs text-amber-700">金額輸入錯誤時，恢復營業中重新結帳</span>
            </summary>
            <div className="space-y-3 border-t border-amber-200 p-3">
              <p className="text-xs text-amber-800">
                僅能在下一個營業日尚未開店前撤銷；操作原因與原閉店資料會保留。
              </p>
              <CashDrawerActionForm
                action={handleReopen}
                returnPath={returnPath}
                submitLabel="確認撤銷閉店"
                successPendingLabel="已撤銷，跳轉中…"
                submitClassName="min-h-[44px] w-full bg-amber-600 text-white hover:bg-amber-700"
                className="space-y-3"
              >
                <div>
                  <label className="block text-sm font-medium text-earth-700">撤銷原因</label>
                  <textarea
                    name="reason"
                    required
                    maxLength={200}
                    rows={2}
                    className="mt-1 block w-full rounded-lg border border-earth-300 px-3 py-2 text-sm focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-200"
                    placeholder="例如：閉店實點金額輸入錯誤"
                  />
                </div>
              </CashDrawerActionForm>
            </div>
          </details>
        )}
        {/* 補登：原地展開現金帳 inline form（與營業中共用）。今日已結帳 →
            CashbookFormFields 顯示「補紀錄」提示；選現金時要求勾選確認，
            後端 createCashbookEntry 用 confirmClosedCashbookChange 再次把關。 */}
        {canCreateCashbook ? (
          <details className="group rounded-xl border border-earth-200 bg-white">
            <summary className="flex min-h-[44px] cursor-pointer list-none flex-col justify-center rounded-xl px-3 py-2.5 select-none sm:min-h-[52px] hover:bg-primary-50 group-open:rounded-b-none">
              <span className="text-sm font-semibold text-earth-900">記一筆收支（補登）</span>
              <span className="mt-0.5 text-xs text-earth-500">
                補登只留紀錄，不會改變今天的結帳金額
              </span>
            </summary>
            <div className="border-t border-earth-200">
              <InlineCashbookForm
                action={handleAddCashbookEntry}
                returnPath={returnPath}
                today={todayStr}
                closedDates={closedDates}
                canAssignStaff={canAssignStaff}
                staffOptions={staffOptions}
              />
            </div>
          </details>
        ) : (
          <ActionDisabledCard title="記一筆收支（補登）" helper="您沒有新增現金帳的權限。" />
        )}
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
    <div className="rounded-xl border border-earth-200 bg-white p-4">
      <h2 className="text-base font-semibold text-earth-900">開店紀錄</h2>
      <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-earth-500">開店帳面（應有）</dt>
          <dd className="mt-1 text-base font-medium tabular-nums text-earth-900">
            NT$ {session.openingBookBalance.toString()}
          </dd>
        </div>
        <div>
          <dt className="text-earth-500">實際點到</dt>
          <dd className="mt-1 text-base font-medium tabular-nums text-earth-900">
            NT$ {session.openingActualCash.toString()}
          </dd>
        </div>
        <div>
          <dt className="text-earth-500">差額</dt>
          <dd className="mt-1">
            <span
              className={`inline-block rounded-md px-2 py-0.5 text-base font-medium tabular-nums ${openingDiff.className} ${openingDiff.chipClassName}`}
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
// 子卡：今日其他異動（OPEN live / CLOSED snapshot 共用，金額由 caller 字串化）
// 系統應有現金 highlight 已收進今日狀態卡 + 閉店點錢按鈕內
// ============================================================

function amountIsZero(value: string | undefined): boolean {
  return value === undefined || value === "—" || new Prisma.Decimal(value).equals(0);
}

function formatSignedAmount(value: string, direction?: "in" | "out"): string {
  const amount = new Prisma.Decimal(value);
  if (direction === "in") return `+ NT$ ${amount.abs().toString()}`;
  if (direction === "out") return `− NT$ ${amount.abs().toString()}`;
  if (amount.gt(0)) return `+ NT$ ${amount.toString()}`;
  if (amount.lt(0)) return `− NT$ ${amount.abs().toString()}`;
  return "NT$ 0";
}

function TransactionSummaryCard({
  live,
  cashExpense,
  cashWithdrawal,
  cashDeposit,
  cashAdjustment,
  cashbookCashOut,
  cashbookNet,
}: {
  live: boolean;
  cashExpense: string;
  cashWithdrawal: string;
  cashDeposit: string;
  cashAdjustment: string;
  /** OPEN：當日現金帳 CASH EXPENSE + WITHDRAW 合計（live） */
  cashbookCashOut?: string;
  /** CLOSED：從 frozen expectedClosingCash 反推的現金帳淨額（signed） */
  cashbookNet?: string;
}) {
  const items: Array<{
    label: string;
    value: string;
    tone: string;
  }> = [];

  if (!amountIsZero(cashExpense)) {
    items.push({
      label: "現金退款",
      value: formatSignedAmount(cashExpense, "out"),
      tone: "text-orange-700",
    });
  }
  if (!amountIsZero(cashWithdrawal)) {
    items.push({
      label: "提領",
      value: formatSignedAmount(cashWithdrawal, "out"),
      tone: "text-orange-700",
    });
  }
  if (!amountIsZero(cashDeposit)) {
    items.push({
      label: "補入",
      value: formatSignedAmount(cashDeposit, "in"),
      tone: "text-green-700",
    });
  }
  if (!amountIsZero(cashAdjustment)) {
    const adjustment = new Prisma.Decimal(cashAdjustment);
    items.push({
      label: "調整",
      value: formatSignedAmount(cashAdjustment),
      tone: adjustment.gte(0) ? "text-green-700" : "text-orange-700",
    });
  }
  if (live && !amountIsZero(cashbookCashOut)) {
    items.push({
      label: "現金帳支出",
      value: formatSignedAmount(cashbookCashOut ?? "0", "out"),
      tone: "text-orange-700",
    });
  }
  if (!live && !amountIsZero(cashbookNet)) {
    const net = new Prisma.Decimal(cashbookNet ?? "0");
    items.push({
      label: "現金帳淨額（現金）",
      value: formatSignedAmount(cashbookNet ?? "0"),
      tone: net.gte(0) ? "text-green-700" : "text-orange-700",
    });
  }

  return (
    <div className="rounded-xl border border-earth-200 bg-white p-4">
      <h2 className="text-base font-semibold text-earth-900">今日其他異動</h2>
      <p className="mt-1 text-xs text-earth-500">
        {live ? "系統即時計算，閉店時凍結進快照欄位" : "閉店時凍結的快照"}
      </p>
      {items.length === 0 ? (
        <p className="mt-3 rounded-lg bg-earth-50 px-3 py-2 text-sm text-earth-600">
          無異動
        </p>
      ) : (
        <dl className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          {items.map((item) => (
            <div key={item.label} className="rounded-lg bg-earth-50 px-3 py-2">
              <dt className="text-xs text-earth-500">{item.label}</dt>
              <dd className={`mt-0.5 font-medium tabular-nums ${item.tone}`}>
                {item.value}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

// ============================================================
// CLOSED 狀態結算卡（系統應有 / 閉店實點 / 差額 / 下次開店起點）— 明細用
// ============================================================

function ClosedSettlementCard({ session }: { session: OpenedTodaySession }) {
  const closingDiff = formatDiff(session.closingDifference?.toNumber() ?? 0);

  return (
    <div className="rounded-xl border border-earth-200 bg-white p-4">
      <h2 className="text-base font-semibold text-earth-900">閉店結算</h2>
      <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-earth-500">系統應有</dt>
          <dd className="mt-1 text-base font-medium tabular-nums text-earth-900">
            NT$ {session.expectedClosingCash?.toString() ?? "—"}
          </dd>
        </div>
        <div>
          <dt className="text-earth-500">閉店實點</dt>
          <dd className="mt-1 text-base font-medium tabular-nums text-earth-900">
            NT$ {session.closingActualCash?.toString() ?? "—"}
          </dd>
        </div>
        <div>
          <dt className="text-earth-500">差額</dt>
          <dd className="mt-1">
            <span
              className={`inline-block rounded-md px-2 py-0.5 text-base font-medium tabular-nums ${closingDiff.className} ${closingDiff.chipClassName}`}
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
      <div className="mt-4 rounded-lg bg-primary-50 px-4 py-2.5">
        <p className="text-xs font-medium text-primary-700">下次開店起點</p>
        <p className="mt-0.5 text-xl font-bold tabular-nums text-primary-900">
          NT$ {session.finalBookBalance?.toString() ?? "—"}
        </p>
        <p className="mt-1 text-xs text-primary-700">
          昨天差額會留在昨天，今天從實際點到的現金開始。
        </p>
      </div>
    </div>
  );
}
