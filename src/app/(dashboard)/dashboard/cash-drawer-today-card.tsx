/**
 * 首頁今日現金抽屜狀態卡
 *
 * 設計目標：店長一登入第一眼回答「今天現金抽屜處理好了嗎？」
 * 卡片只做狀態摘要 + 1 顆 CTA，不放表單、不直接提交。
 * 完整管理在 /dashboard/cash-drawer。
 *
 * 4 種 state 對應 src/server/queries/cash-drawer.ts CashDrawerView。
 */

import { DashboardLink as Link } from "@/components/dashboard-link";
import type { CashDrawerView } from "@/server/queries/cash-drawer";
import { formatTWTime } from "@/lib/date-utils";

interface CashDrawerTodayCardProps {
  view: CashDrawerView;
  /** 是否可執行第一次啟用（OWNER / ADMIN） */
  canInit: boolean;
  /** 是否可開店點錢（具 cashDrawer.open 權限） */
  canOpen: boolean;
  /** View Mode is dashboard read-only: no cash-drawer navigation or operations. */
  readOnly?: boolean;
}

const CASH_DRAWER_HREF = "/dashboard/cash-drawer";

export function CashDrawerTodayCard({
  view,
  canInit,
  canOpen,
  readOnly = false,
}: CashDrawerTodayCardProps) {
  return (
    <section className="rounded-xl border border-earth-200 bg-white px-4 py-3">
      <header className="mb-2 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-earth-800">今日開店檢查</h2>
          <p className="text-[11px] text-earth-400">現金抽屜狀態 / 開店點錢</p>
        </div>
        <span className="text-[11px] text-earth-400">每日上班第一件事</span>
      </header>

      {view.state === "EMPTY" && <EmptyCard canInit={canInit} readOnly={readOnly} />}
      {view.state === "NOT_OPENED_TODAY" && (
        <NotOpenedTodayCard
          lastFinalBookBalance={view.lastSession.finalBookBalance?.toString() ?? "—"}
          canOpen={canOpen}
          readOnly={readOnly}
        />
      )}
      {view.state === "OPENED_TODAY" && view.session.status === "CLOSED" && (
        <ClosedTodayCard
          expectedClosingCash={view.session.expectedClosingCash?.toString() ?? "—"}
          closingActualCash={view.session.closingActualCash?.toString() ?? "—"}
          closingDifference={view.session.closingDifference?.toNumber() ?? 0}
          readOnly={readOnly}
        />
      )}
      {view.state === "OPENED_TODAY" && view.session.status !== "CLOSED" && (
        <OpenedTodayCard
          bookBalance={view.session.openingBookBalance.toString()}
          actualCash={view.session.openingActualCash.toString()}
          difference={view.session.openingDifference.toNumber()}
          readOnly={readOnly}
        />
      )}
      {view.state === "WARNING_LAST_OPEN" && (
        <WarningLastOpenCard
          lastBusinessDate={formatTWTime(view.lastSession.businessDate, { dateOnly: true })}
          readOnly={readOnly}
        />
      )}
    </section>
  );
}

// ============================================================
// State A — EMPTY
// ============================================================

function ReadOnlyPill() {
  return (
    <span className="shrink-0 rounded-md border border-earth-200 bg-earth-50 px-3 py-1.5 text-[11px] font-medium text-earth-400">
      查看模式
    </span>
  );
}

function EmptyCard({ canInit, readOnly }: { canInit: boolean; readOnly: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <p className="text-sm font-medium text-earth-800">
          <span className="mr-1 inline-block h-2 w-2 rounded-full bg-earth-400 align-middle" />
          尚未啟用
        </p>
        <p className="mt-0.5 text-[11px] text-earth-500">
          {canInit
            ? "點按鈕設定店內初始現金，作為日後滾動結餘的基準。"
            : "請通知 OWNER 啟用現金抽屜。"}
        </p>
      </div>
      {readOnly ? (
        <ReadOnlyPill />
      ) : (
        <Link
          href={CASH_DRAWER_HREF}
          className="shrink-0 rounded-md bg-primary-600 px-3 py-1.5 text-[11px] font-medium text-white shadow-sm hover:bg-primary-700"
        >
          {canInit ? "啟用現金抽屜" : "查看現金抽屜"}
        </Link>
      )}
    </div>
  );
}

// ============================================================
// State B — NOT_OPENED_TODAY
// ============================================================

function NotOpenedTodayCard({
  lastFinalBookBalance,
  canOpen,
  readOnly,
}: {
  lastFinalBookBalance: string;
  canOpen: boolean;
  readOnly: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <p className="text-sm font-medium text-earth-800">
          <span className="mr-1 inline-block h-2 w-2 rounded-full bg-amber-500 align-middle" />
          尚未開店
        </p>
        <p className="mt-0.5 text-[11px] text-earth-500">
          今日開店起點 NT$ {lastFinalBookBalance}（上日閉店實際點到）
        </p>
      </div>
      {readOnly ? (
        <ReadOnlyPill />
      ) : (
        <Link
          href={CASH_DRAWER_HREF}
          className="shrink-0 rounded-md bg-primary-600 px-3 py-1.5 text-[11px] font-medium text-white shadow-sm hover:bg-primary-700"
        >
          {canOpen ? "開店點錢" : "查看現金抽屜"}
        </Link>
      )}
    </div>
  );
}

// ============================================================
// State C — OPENED_TODAY
// ============================================================

function OpenedTodayCard({
  bookBalance,
  actualCash,
  difference,
  readOnly,
}: {
  bookBalance: string;
  actualCash: string;
  difference: number;
  readOnly: boolean;
}) {
  const diffLabel = difference === 0 ? "0" : difference > 0 ? `+${difference}` : `${difference}`;
  const diffClass =
    difference === 0
      ? "text-earth-600"
      : difference > 0
        ? "text-green-700"
        : "text-orange-700";

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex flex-1 flex-col gap-1">
        <p className="text-sm font-medium text-earth-800">
          <span className="mr-1 inline-block h-2 w-2 rounded-full bg-green-500 align-middle" />
          營業中
        </p>
        <div className="flex gap-4 text-[11px] text-earth-600">
          <span>
            帳面 <span className="font-medium text-earth-900">NT$ {bookBalance}</span>
          </span>
          <span>
            實點 <span className="font-medium text-earth-900">NT$ {actualCash}</span>
          </span>
          <span>
            差額 <span className={`font-medium ${diffClass}`}>NT$ {diffLabel}</span>
          </span>
        </div>
      </div>
      {readOnly ? (
        <ReadOnlyPill />
      ) : (
        <Link
          href={CASH_DRAWER_HREF}
          className="shrink-0 rounded-md border border-earth-200 bg-white px-3 py-1.5 text-[11px] font-medium text-earth-700 hover:bg-earth-50"
        >
          查看現金抽屜
        </Link>
      )}
    </div>
  );
}

// ============================================================
// State C (CLOSED) — 今日已閉店
// ============================================================

function ClosedTodayCard({
  expectedClosingCash,
  closingActualCash,
  closingDifference,
  readOnly,
}: {
  expectedClosingCash: string;
  closingActualCash: string;
  closingDifference: number;
  readOnly: boolean;
}) {
  const diffLabel =
    closingDifference === 0
      ? "0"
      : closingDifference > 0
        ? `+${closingDifference}`
        : `${closingDifference}`;
  const diffClass =
    closingDifference === 0
      ? "text-earth-600"
      : closingDifference > 0
        ? "text-green-700"
        : "text-orange-700";

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex flex-1 flex-col gap-1">
        <p className="text-sm font-medium text-earth-800">
          <span className="mr-1 inline-block h-2 w-2 rounded-full bg-earth-400 align-middle" />
          今日已結帳
        </p>
        <div className="flex gap-4 text-[11px] text-earth-600">
          <span>
            應有 <span className="font-medium text-earth-900">NT$ {expectedClosingCash}</span>
          </span>
          <span>
            實點 <span className="font-medium text-earth-900">NT$ {closingActualCash}</span>
          </span>
          <span>
            差額 <span className={`font-medium ${diffClass}`}>NT$ {diffLabel}</span>
          </span>
        </div>
      </div>
      {readOnly ? (
        <ReadOnlyPill />
      ) : (
        <Link
          href={CASH_DRAWER_HREF}
          className="shrink-0 rounded-md border border-earth-200 bg-white px-3 py-1.5 text-[11px] font-medium text-earth-700 hover:bg-earth-50"
        >
          查看現金抽屜
        </Link>
      )}
    </div>
  );
}

// ============================================================
// State D — WARNING_LAST_OPEN
// ============================================================

function WarningLastOpenCard({
  lastBusinessDate,
  readOnly,
}: {
  lastBusinessDate: string;
  readOnly: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md bg-orange-50 px-3 py-2">
      <div>
        <p className="text-sm font-medium text-orange-900">
          <span className="mr-1 inline-block h-2 w-2 rounded-full bg-orange-500 align-middle" />
          上一個營業日尚未閉店
        </p>
        <p className="mt-0.5 text-[11px] text-orange-700">
          上日：{lastBusinessDate}．請先處理前一筆紀錄
        </p>
      </div>
      {readOnly ? (
        <ReadOnlyPill />
      ) : (
        <Link
          href={CASH_DRAWER_HREF}
          className="shrink-0 rounded-md border border-orange-300 bg-white px-3 py-1.5 text-[11px] font-medium text-orange-800 hover:bg-orange-100"
        >
          查看現金抽屜
        </Link>
      )}
    </div>
  );
}
