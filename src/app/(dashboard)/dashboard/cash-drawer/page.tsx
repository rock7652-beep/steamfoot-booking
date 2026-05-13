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

import { getCashDrawerView } from "@/server/queries/cash-drawer";
import {
  initializeCashDrawerAction,
  openCashDrawerAction,
} from "@/server/actions/cash-drawer";

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

  return (
    <FeatureGate plan={plan} feature={FEATURES.CASHBOOK}>
      <div className="max-w-3xl space-y-6">
        <FormErrorToast />

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-earth-900">現金抽屜</h1>
            <p className="mt-1 text-sm text-earth-500">
              每日開店點錢 / 閉店點錢 / 滾動結餘核對
            </p>
          </div>
          <Link
            href="/dashboard/cashbook"
            className="text-sm text-earth-500 hover:text-earth-700"
          >
            ← 現金帳
          </Link>
        </div>

        {/* State A: 未啟用 */}
        {view.state === "EMPTY" && <EmptyState canInit={canInit} todayStr={todayStr} />}

        {/* State D: 上日尚未閉店 */}
        {view.state === "WARNING_LAST_OPEN" && (
          <WarningLastOpen lastSession={view.lastSession} />
        )}

        {/* State B: 今日未開店 */}
        {view.state === "NOT_OPENED_TODAY" && (
          <NotOpenedToday
            lastSession={view.lastSession}
            canOpen={canOpen}
            todayStr={todayStr}
          />
        )}

        {/* State C: 今日已開店 */}
        {view.state === "OPENED_TODAY" && <OpenedToday session={view.session} />}
      </div>
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
// State C — 今日已開店
// ============================================================

function OpenedToday({
  session,
}: {
  session: {
    businessDate: Date;
    status: string;
    openingBookBalance: Prisma.Decimal;
    openingActualCash: Prisma.Decimal;
    openingDifference: Prisma.Decimal;
    openingNote: string | null;
    openedAt: Date;
  };
}) {
  const diff = session.openingDifference.toNumber();
  const diffLabel = diff === 0 ? "0" : diff > 0 ? `+${diff}` : `${diff}`;
  const diffClass =
    diff === 0
      ? "text-earth-600"
      : diff > 0
        ? "text-green-700"
        : "text-orange-700";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="inline-flex items-center rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700">
          ● 今日已開店
        </span>
        <span className="text-sm text-earth-500">
          {formatTWTime(session.businessDate, { dateOnly: true })}
        </span>
      </div>

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
            <dd className={`mt-1 text-lg font-medium ${diffClass}`}>
              NT$ {diffLabel}
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

      <div className="rounded-xl border border-earth-200 bg-earth-50 p-4">
        <p className="text-sm text-earth-700">下一階段功能（敬請期待）：</p>
        <ul className="mt-2 space-y-1 text-xs text-earth-500">
          <li>· 現金提領 / 補入 / 調整</li>
          <li>· 閉店點錢與差額核對</li>
        </ul>
      </div>
    </div>
  );
}
