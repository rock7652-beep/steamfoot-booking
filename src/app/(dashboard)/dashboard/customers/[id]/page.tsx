import { getCustomerDetailForUser } from "@/server/queries/customer";
import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { getCachedPlans, getCachedStaffOptions } from "@/lib/query-cache";
import { getActiveStoreForRead } from "@/lib/store";
import {
  resolveStoreViewContextFromCookie,
  storeIdForViewContext,
  userForViewContext,
} from "@/lib/store-view-context-server";
import { ServerTiming, withTiming } from "@/lib/perf";
import { prisma } from "@/lib/db";
import { enumerateBookableDates } from "@/lib/bookable-window";
import { resolveBookableUntilDate } from "@/lib/shop-config";
import { notFound, redirect } from "next/navigation";
import { DashboardLink as Link } from "@/components/dashboard-link";
import {
  PageShell,
  PageHeader,
  EmptyRow,
  SideCard,
} from "@/components/desktop";
import { AssignPlanForm } from "./assign-plan-form";
import { TransferCustomerForm } from "./transfer-customer-form";
import { CreateBookingForm } from "./create-booking-form";
import { AdjustWalletForm } from "./adjust-wallet-form";
import { ExtendWalletExpiryForm } from "./extend-wallet-expiry-form";
import { BackfillUsedSessionsForm } from "./backfill-used-sessions-form";
import { MigratePaperPlanDialog } from "./migrate-paper-plan-dialog";
import { VoidSessionButton } from "./void-session-button";
import {
  WalletSessionDetail,
  type SessionRow,
} from "@/components/wallet-session-detail";
import { CustomerStageForm } from "./customer-stage-form";
import {
  STATUS_LABEL,
  WALLET_STATUS_LABEL,
} from "@/lib/booking-constants";
import { getMyReferralSummary } from "@/server/queries/my-referral-summary";
import { formatTWTime, toLocalDateStr } from "@/lib/date-utils";
import { CUSTOMER_FOLLOW_UP_RESULT_LABEL } from "@/lib/customer-follow-up";
import { TALENT_STAGE_LABELS } from "@/types/talent";
import type { CustomerStage, TalentStage } from "@prisma/client";
import { deriveCustomerSource, type CustomerSourceSnapshot } from "@/lib/customer-source";
import { sortWalletsByFEFO } from "@/lib/wallet-sort";
import {
  totalAvailableToBook,
  walletAvailableToBook,
  walletPendingCount,
} from "@/lib/wallet-availability";
import {
  getLineNotificationStatus,
  lineNotificationLabel,
} from "@/lib/line-notification-status";

import { CustomerBasicInfo } from "./_components/customer-basic-info";
import { IdentityDiagnosticPanel } from "./_components/identity-diagnostic-panel";
import { HealthStatusBody } from "./_components/health-status-card";
import { LineBindingSection } from "./line-binding-section";
import { getLineConfigForStore } from "@/lib/line-config";
import { RecentRecordsTabs } from "./recent-records-tabs";

const TX_TYPE_LABEL: Record<string, string> = {
  TRIAL_PURCHASE: "體驗購買",
  SINGLE_PURCHASE: "單次消費",
  PACKAGE_PURCHASE: "課程購買",
  SESSION_DEDUCTION: "堂數扣抵",
  SUPPLEMENT: "補差額",
  REFUND: "退款",
  ADJUSTMENT: "手動調整",
  MANUAL_USED_BACKFILL: "補登已使用",
  PAPER_MIGRATION: "紙本轉入", // 非今日新收款；不入營收 / 現金帳 / 教練業績
};

const CUSTOMER_STAGE_LABEL: Record<CustomerStage, string> = {
  LEAD: "名單",
  TRIAL: "體驗",
  ACTIVE: "已購課",
  INACTIVE: "已停用",
};

const CUSTOMER_STAGE_COLOR: Record<CustomerStage, string> = {
  LEAD: "bg-earth-100 text-earth-700",
  TRIAL: "bg-blue-50 text-blue-700",
  ACTIVE: "bg-primary-100 text-primary-700",
  INACTIVE: "bg-yellow-50 text-yellow-700",
};

const TALENT_STAGE_COLOR: Record<TalentStage, string> = {
  CUSTOMER: "bg-earth-100 text-earth-700",
  REGULAR: "bg-earth-200 text-earth-700",
  POTENTIAL_PARTNER: "bg-blue-50 text-blue-700",
  PARTNER: "bg-blue-100 text-blue-800",
  FUTURE_OWNER: "bg-amber-100 text-amber-700",
  OWNER: "bg-green-100 text-green-700",
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function CustomerDetailPage({ params }: PageProps) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user || !(await checkPermission(user.role, user.staffId, "customer.read"))) {
    redirect("/dashboard");
  }

  const activeStoreId = await getActiveStoreForRead(user);
  const storeViewContext = await resolveStoreViewContextFromCookie(user);
  const isViewMode = storeViewContext?.isViewMode ?? false;
  const customerStoreId = storeIdForViewContext(activeStoreId, storeViewContext);
  const customerUser = userForViewContext(user, storeViewContext);

  const logCtx = {
    page: "customer-detail" as const,
    customerId: id,
    activeStoreId: customerStoreId,
    sessionRole: user.role,
    sessionStoreId: user.storeId ?? null,
  };

  const timer = new ServerTiming(`/dashboard/customers/${id}`);

  let customer: Awaited<ReturnType<typeof getCustomerDetailForUser>>;
  try {
    customer = await withTiming("getCustomerDetail", timer, () =>
      getCustomerDetailForUser(customerUser, id, customerStoreId),
    );
  } catch (e) {
    console.error("[customer-detail] base query failed", {
      ...logCtx,
      step: "base",
      error: e instanceof Error ? e.message : String(e),
    });
    notFound();
  }

  if (customerStoreId && customer.storeId !== customerStoreId) {
    console.warn("[customer-detail] cross-store access blocked", {
      ...logCtx,
      step: "store-guard",
      customerStoreId: customer.storeId,
    });
    notFound();
  }

  const effectiveStoreId = customer.storeId;

  const [plans, staffOptions, canDiscount, canAdjustWallet, perksSummary, shopConfig] = await Promise.all([
    withTiming("getCachedPlans", timer, () => getCachedPlans(effectiveStoreId)).catch((e) => {
      console.error("[customer-detail] plans query failed", {
        ...logCtx,
        step: "plans",
        error: e instanceof Error ? e.message : String(e),
      });
      return [] as Awaited<ReturnType<typeof getCachedPlans>>;
    }),
    withTiming("getCachedStaffOptions", timer, () => getCachedStaffOptions(effectiveStoreId)).catch((e) => {
      console.error("[customer-detail] staffOptions query failed", {
        ...logCtx,
        step: "staffOptions",
        error: e instanceof Error ? e.message : String(e),
      });
      return [] as Awaited<ReturnType<typeof getCachedStaffOptions>>;
    }),
    checkPermission(user.role, user.staffId, "transaction.discount").catch(() => false),
    // wallet.adjust 權限：用來 gate「調整堂數」/「補登已使用堂數」UI 的顯示。
    // OWNER 預設有此權限；ADMIN 也有；過去 UI 寫死 userRole === "ADMIN"
    // 把店長擋掉是 bug。server action 端仍以 requirePermission("wallet.adjust") 把關。
    checkPermission(user.role, user.staffId, "wallet.adjust").catch(() => false),
    user.role !== "CUSTOMER"
      ? withTiming("getMyReferralSummary", timer, () =>
          getMyReferralSummary(id, { activeStoreId: effectiveStoreId }),
        ).catch(() => null)
      : Promise.resolve(null),
    prisma.shopConfig.findUnique({
      where: { storeId: effectiveStoreId },
      select: { bookableUntilDate: true },
    }),
  ]);

  timer.finish();

  // ── 身分證據快照（用於 deriveCustomerSource）──
  // 不從 getCustomerDetail 直接撈（避免 leak passwordHash 給其他 consumer），
  // 在頁面層做一次小查詢，取「是否有 passwordHash」+ 「Account 的 provider 列表」
  const identitySnapshot = await buildIdentitySnapshot(customer);
  const derivedSource = deriveCustomerSource(identitySnapshot);

  const canEdit = user.role !== "CUSTOMER" && !isViewMode;
  const canRunLineRebindDryRun = Boolean(getLineConfigForStore(effectiveStoreId).expectedBasicId);
  const [canManageLineRebind, activeLineRebindRequest] = await Promise.all([
    checkPermission(user.role, user.staffId, "customer.identity.rebind").catch(() => false),
    prisma.lineRebindRequest.findFirst({
      where: {
        customerId: id,
        storeId: effectiveStoreId,
        status: { in: ["PENDING_CAPTURE", "CANDIDATE_CAPTURED"] },
      },
      select: {
        id: true,
        status: true,
        capturedAt: true,
        expiresAt: true,
        candidate: { select: { userIdHash: true } },
      },
    }),
  ]);
  const todayStr = toLocalDateStr();
  const bookingDays = enumerateBookableDates(
    todayStr,
    resolveBookableUntilDate(shopConfig?.bookableUntilDate),
  );

  const staffList =
    user.role === "ADMIN"
      ? staffOptions.map((s) => ({ id: s.id, displayName: s.displayName }))
      : [];

  const wallets = customer.planWallets ?? [];
  // FEFO 排序：與 server 自動選擇規則一致（最早到期優先）
  const activeWallets = sortWalletsByFEFO(wallets.filter((w) => w.status === "ACTIVE"));
  const inactiveWallets = wallets.filter((w) => w.status !== "ACTIVE");
  const totalRemaining = activeWallets.reduce((s, w) => s + w.remainingSessions, 0);
  const totalPendingSessions = activeWallets.reduce(
    (sum, w) => sum + walletPendingCount(w),
    0,
  );
  const totalAvailableSessions = totalAvailableToBook(activeWallets);

  const bookings = customer.bookings ?? [];
  const upcomingBookings = bookings.filter(
    (b) => b.bookingStatus === "PENDING" || b.bookingStatus === "CONFIRMED",
  );
  const historyBookings = bookings.filter(
    (b) => b.bookingStatus !== "PENDING" && b.bookingStatus !== "CONFIRMED",
  );
  const recentHistory = historyBookings.slice(0, 5);
  const transactions = customer.transactions ?? [];
  const recentTransactions = transactions.slice(0, 5);

  const referralCount = customer._count?.sponsoredCustomers ?? 0;
  const totalVisits = customer._count?.bookings ?? 0;
  const totalPoints = customer.totalPoints ?? 0;

  const customerStageLabel = CUSTOMER_STAGE_LABEL[customer.customerStage];
  const customerStageColor = CUSTOMER_STAGE_COLOR[customer.customerStage];
  const talentStageLabel = TALENT_STAGE_LABELS[customer.talentStage];
  const talentStageColor = TALENT_STAGE_COLOR[customer.talentStage];
  const lineNotificationStatus = getLineNotificationStatus({
    lineLinkStatus: customer.lineLinkStatus,
    lineUserId: customer.lineUserId,
  });
  const lineNotificationTone =
    lineNotificationStatus === "enabled"
      ? "bg-green-50 text-green-700"
      : lineNotificationStatus === "disabled"
        ? "bg-earth-100 text-earth-600"
        : lineNotificationStatus === "needs_review"
          ? "bg-amber-50 text-amber-700"
          : "bg-red-50 text-red-700";

  const headerActionBase =
    "rounded-md border border-earth-200 bg-white px-3 py-1.5 text-xs font-medium text-earth-700 hover:bg-earth-50";
  const disabledActionBase =
    "rounded-md border border-earth-200 bg-earth-50 px-3 py-1.5 text-xs font-medium text-earth-400";

  const quickActionBase =
    "flex items-center justify-between rounded-md border border-earth-200 px-3 py-1.5 text-xs font-medium text-earth-700 hover:bg-earth-50";

  return (
    <PageShell>
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-[11px] text-earth-500">
        <Link href="/dashboard/customers" className="hover:text-earth-700">
          顧客管理
        </Link>
        <span className="text-earth-300">/</span>
        <span className="text-earth-700">顧客詳情</span>
      </div>

      <PageHeader
        title={customer.name}
        subtitle={[
          customer.phone,
          customer.lineName ? `LINE ${customer.lineName}` : null,
        ]
          .filter(Boolean)
          .join(" · ")}
        actions={
          <>
            <Link href="/dashboard/customers" className={headerActionBase}>
              ← 顧客列表
            </Link>
            {isViewMode ? (
              <span className={disabledActionBase}>查看模式</span>
            ) : (
              <Link
                href={`/dashboard/bookings?customerId=${id}`}
                className={headerActionBase}
              >
                查看預約
              </Link>
            )}
            {canEdit && (
              <Link
                href={`/dashboard/customers/${id}/edit`}
                className={headerActionBase}
              >
                編輯資料
              </Link>
            )}
            {isViewMode ? null : (
              <Link
                href="#booking"
                className="rounded-md bg-primary-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-700"
              >
                + 新增預約
              </Link>
            )}
          </>
        }
      />

      {isViewMode ? (
        <div className="rounded-lg border border-primary-100 bg-primary-50 px-4 py-3 text-sm text-primary-800">
          查看模式提供完整閱讀能力，所有顧客操作請由該店自行完成。
        </div>
      ) : null}

      {/* Header chips — quick state at a glance */}
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 border-b border-earth-200 pb-1.5">
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${customerStageColor}`}
        >
          {customerStageLabel}
        </span>
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${lineNotificationTone}`}
        >
          系統通知：{lineNotificationLabel(lineNotificationStatus)}
        </span>
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${talentStageColor}`}
        >
          {talentStageLabel}
        </span>
        <span className="ml-2 text-earth-200">｜</span>
        <span className="inline-flex items-center gap-1 text-[12px] text-earth-700">
          <span className="text-[11px] text-earth-500">可再預約</span>
          <span
            className={`text-[14px] font-bold tabular-nums ${
              totalAvailableSessions > 0 ? "text-primary-700" : "text-earth-500"
            }`}
          >
            {totalAvailableSessions}
          </span>
          <span className="text-[11px] text-earth-500">堂</span>
        </span>
        {totalPendingSessions > 0 && (
          <>
            <span className="text-earth-200">｜</span>
            <span className="inline-flex items-center gap-1 text-[11px] text-earth-600">
              方案剩餘 {totalRemaining} 堂（待到店 {totalPendingSessions} 堂）
            </span>
          </>
        )}
        <span className="text-earth-200">｜</span>
        <span className="inline-flex items-center gap-1 text-[12px] text-earth-700">
          <span className="text-[11px] text-earth-500">點數</span>
          <span className="text-[14px] font-bold tabular-nums text-amber-700">
            {totalPoints}
          </span>
        </span>
        <span className="text-earth-200">｜</span>
        <span className="inline-flex items-center gap-1 text-[12px] text-earth-700">
          <span className="text-[11px] text-earth-500">累積來店</span>
          <span className="text-[14px] font-bold tabular-nums text-earth-800">
            {totalVisits}
          </span>
          <span className="text-[11px] text-earth-500">次</span>
        </span>
      </div>

      {/* Main grid — 左 ~65% 操作 / 右 ~35% 資訊（xl 以上才分欄，手機單欄） */}
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-12">
        {/* ========== Left ~65% — primary operations ========== */}
        <div className="space-y-3 xl:col-span-8">
          {/* 1. Plans + Create booking — 合併 compact 卡 */}
          <section
            id="plan"
            className="scroll-mt-16 space-y-3 rounded-xl border border-earth-200 bg-white px-4 py-3"
          >
            {/* Plans header + assign actions */}
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-earth-800">課程方案</h2>
                <p className="text-[11px] text-earth-400">
                  目前有效方案、剩餘堂數、到期日
                </p>
              </div>
              {canEdit && (
                <div className="flex items-center gap-2">
                  {/* PR-C：紙本舊客轉入線上（OWNER / ADMIN only） */}
                  {canAdjustWallet &&
                    (user.role === "OWNER" || user.role === "ADMIN") && (
                      <MigratePaperPlanDialog
                        customerId={id}
                        plans={plans.map((p) => ({
                          id: p.id,
                          name: p.name,
                          category: p.category,
                          price: Number(p.price),
                          sessionCount: p.sessionCount,
                        }))}
                      />
                    )}
                  <AssignPlanForm
                    customerId={id}
                    canDiscount={canDiscount}
                    plans={plans.map((p) => ({
                      id: p.id,
                      name: p.name,
                      category: p.category,
                      price: Number(p.price),
                      sessionCount: p.sessionCount,
                      validityDays: p.validityDays,
                    }))}
                  />
                </div>
              )}
            </div>

            {wallets.length === 0 ? (
              <div className="flex items-center justify-between rounded-lg border border-earth-100 bg-earth-50/40 px-4 py-3 text-xs text-earth-500">
                <span>尚未指派方案</span>
                <span className="text-[11px] text-earth-400">
                  {isViewMode
                    ? "查看模式下不可替下層店指派方案"
                    : "使用右上方「+ 指派方案」開始"}
                </span>
              </div>
            ) : (
              <div className="space-y-2">
                {activeWallets.map((w) => (
                  <WalletItem
                    key={w.id}
                    w={w}
                    userRole={user.role}
                    canAdjustWallet={canAdjustWallet && !isViewMode}
                    readOnly={isViewMode}
                  />
                ))}
                {inactiveWallets.length > 0 && (
                  <details className="group">
                    <summary className="cursor-pointer text-[11px] font-medium text-earth-500 hover:text-earth-700">
                      <span className="group-open:hidden">
                        歷史方案 ({inactiveWallets.length}) ▾
                      </span>
                      <span className="hidden group-open:inline">收合 ▴</span>
                    </summary>
                    <div className="mt-2 space-y-2 opacity-70">
                      {inactiveWallets.map((w) => (
                        <WalletItem
                          key={w.id}
                          w={w}
                          userRole={user.role}
                          canAdjustWallet={canAdjustWallet && !isViewMode}
                          readOnly={isViewMode}
                        />
                      ))}
                    </div>
                  </details>
                )}
              </div>
            )}

            {/* Create booking — 同卡內以分隔線區隔 */}
            <div id="booking" className="scroll-mt-16 border-t border-earth-100 pt-3">
              <h2 className="mb-2 text-sm font-semibold text-earth-800">建立預約</h2>
              {isViewMode ? (
                <div className="rounded-lg border border-earth-100 bg-earth-50 px-4 py-3 text-xs text-earth-500">
                  查看模式下不可替下層店建立預約。
                </div>
              ) : activeWallets.length === 0 ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
                  <p className="text-xs font-medium text-amber-800">
                    需先指派方案，才能建立課程堂數預約
                  </p>
                  <p className="mt-1 text-[11px] text-amber-700">
                    完成指派後可在此建立 PACKAGE 堂數預約。體驗或單次預約請至「預約管理」頁面建立。
                  </p>
                  <Link
                    href="#plan"
                    className="mt-3 inline-flex items-center rounded-md bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700"
                  >
                    前往指派方案 →
                  </Link>
                </div>
              ) : (
                <CreateBookingForm
                  customerId={id}
                  days={bookingDays}
                  activeWallets={activeWallets.map((w) => ({
                    id: w.id,
                    planName: w.plan.name,
                    remainingSessions: walletAvailableToBook(w),
                    expiryDate: w.expiryDate?.toISOString().slice(0, 10) ?? null,
                  }))}
                />
              )}

              {/* Upcoming bookings — kept compact below create form */}
              {upcomingBookings.length > 0 && (
                <div className="mt-3 border-t border-earth-100 pt-3">
                  <p className="mb-1.5 text-[11px] font-medium text-earth-500">
                    未來預約 ({upcomingBookings.length})
                  </p>
                  <div className="space-y-1">
                    {upcomingBookings.map((b) => (
                      <div
                        key={b.id}
                        className="flex items-center justify-between rounded-md bg-blue-50/60 px-3 py-1.5 text-xs"
                      >
                        <span className="tabular-nums text-earth-800">
                          {formatTWTime(b.bookingDate, { dateOnly: true })} · {b.slotTime}
                        </span>
                        <span className="text-[11px] text-blue-700">
                          {STATUS_LABEL[b.bookingStatus] ?? b.bookingStatus}
                        </span>
                        {isViewMode ? (
                          <span className="text-[11px] text-earth-400">查看模式</span>
                        ) : (
                          <Link
                            href={`/dashboard/bookings/${b.id}`}
                            className="text-primary-700 hover:underline"
                          >
                            操作 →
                          </Link>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* 2. Recent records — 預約 / 消費 tab 整併 */}
          <RecentRecordsTabs
            tabs={[
              {
                key: "bookings",
                label: "預約紀錄",
                count: historyBookings.length,
                href: isViewMode ? undefined : `/dashboard/bookings?customerId=${id}`,
                content:
                  recentHistory.length === 0 ? (
                    <EmptyRow title="尚無預約紀錄" dense />
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead className="bg-earth-50 text-[11px] font-medium text-earth-500">
                          <tr>
                            <th className="px-3 py-2">日期</th>
                            <th className="px-3 py-2">時段</th>
                            <th className="px-3 py-2">類型</th>
                            <th className="px-3 py-2">狀態</th>
                            <th className="w-12 px-3 py-2 text-right">詳情</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-earth-100">
                          {recentHistory.map((b) => (
                            <tr key={b.id} className="h-11 hover:bg-primary-50/40">
                              <td className="px-3 text-sm tabular-nums text-earth-800">
                                {formatTWTime(b.bookingDate, { dateOnly: true })}
                              </td>
                              <td className="px-3 text-[13px] text-earth-600">
                                {b.slotTime}
                              </td>
                              <td className="px-3 text-[13px] text-earth-600">
                                {b.bookingType}
                              </td>
                              <td className="px-3">
                                <span
                                  className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${
                                    b.bookingStatus === "COMPLETED"
                                      ? "bg-green-50 text-green-700"
                                      : b.bookingStatus === "CANCELLED"
                                        ? "bg-earth-100 text-earth-500"
                                        : "bg-earth-100 text-earth-600"
                                  }`}
                                >
                                  {STATUS_LABEL[b.bookingStatus] ?? b.bookingStatus}
                                </span>
                              </td>
                              <td className="px-3 text-right">
                                {isViewMode ? (
                                  <span className="text-[11px] text-earth-300">—</span>
                                ) : (
                                  <Link
                                    href={`/dashboard/bookings/${b.id}`}
                                    className="text-[11px] text-primary-600 hover:text-primary-700"
                                  >
                                    →
                                  </Link>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ),
              },
              {
                key: "transactions",
                label: "消費紀錄",
                count: transactions.length,
                href: isViewMode ? undefined : `/dashboard/transactions?customerId=${id}`,
                content:
                  recentTransactions.length === 0 ? (
                    <EmptyRow title="尚無消費紀錄" dense />
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead className="bg-earth-50 text-[11px] font-medium text-earth-500">
                          <tr>
                            <th className="px-3 py-2">日期</th>
                            <th className="px-3 py-2">類型</th>
                            <th className="px-3 py-2 text-right">金額</th>
                            <th className="px-3 py-2">付款方式</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-earth-100">
                          {recentTransactions.map((t) => {
                            const hasDiscount =
                              t.originalAmount && t.discountType && t.discountType !== "none";
                            return (
                              <tr key={t.id} className="h-11">
                                <td className="px-3 text-[13px] tabular-nums text-earth-600">
                                  {formatTWTime(t.createdAt, { dateOnly: true })}
                                </td>
                                <td className="px-3 text-sm text-earth-800">
                                  {TX_TYPE_LABEL[t.transactionType] ?? t.transactionType}
                                </td>
                                <td
                                  className={`px-3 text-right text-sm font-medium tabular-nums ${
                                    Number(t.amount) < 0 ? "text-red-600" : "text-earth-900"
                                  }`}
                                >
                                  {hasDiscount ? (
                                    <div className="leading-tight">
                                      <span className="text-[11px] text-earth-400 line-through">
                                        NT$ {Number(t.originalAmount).toLocaleString()}
                                      </span>
                                      <br />
                                      <span>NT$ {Number(t.amount).toLocaleString()}</span>
                                      {t.discountReason && (
                                        <span className="ml-1 text-[10px] text-amber-600">
                                          ({t.discountReason})
                                        </span>
                                      )}
                                    </div>
                                  ) : (
                                    <>NT$ {Number(t.amount).toLocaleString()}</>
                                  )}
                                </td>
                                <td className="px-3 text-[13px] text-earth-500">
                                  {t.paymentMethod}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ),
              },
            ]}
          />
        </div>

        {/* ========== Right ~35% — info & quick actions ========== */}
        <aside className="space-y-3 xl:col-span-4">
          {/* 顧客狀態總覽 — 狀態 badges + LINE 綁定 + AI 健康 合併單卡 */}
          <SideCard title="顧客狀態總覽" subtitle="系統狀態 / LINE 綁定 / AI 健康">
            {/* Status badges */}
            <div className="flex flex-wrap gap-1.5">
              <span
                className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${customerStageColor}`}
              >
                {customerStageLabel}
              </span>
              {customer.lineLinkStatus === "LINKED" ? (
                <span className="rounded bg-green-50 px-1.5 py-0.5 text-[11px] font-medium text-green-700">
                  LINE 聯絡資料已綁定
                </span>
              ) : (
                <span className="rounded bg-earth-100 px-1.5 py-0.5 text-[11px] font-medium text-earth-500">
                  LINE 聯絡資料未綁定
                </span>
              )}
              <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${lineNotificationTone}`}>
                系統通知：{lineNotificationLabel(lineNotificationStatus)}
              </span>
              {customer.user ? (
                <span className="rounded bg-primary-50 px-1.5 py-0.5 text-[11px] font-medium text-primary-700">
                  帳號已啟用
                </span>
              ) : (
                <span className="rounded bg-orange-50 px-1.5 py-0.5 text-[11px] font-medium text-orange-700">
                  帳號未開通
                </span>
              )}
              {customer.selfBookingEnabled && (
                <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[11px] font-medium text-blue-700">
                  自助預約
                </span>
              )}
              <span
                className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${talentStageColor}`}
              >
                {talentStageLabel}
              </span>
            </div>

            {/* LINE 綁定操作（產生綁定碼 / 解除綁定）*/}
            {canEdit && (
              <div className="mt-3 border-t border-earth-100 pt-3">
                <p className="mb-2 text-[11px] font-semibold text-earth-600">
                  LINE 綁定操作
                </p>
                <LineBindingSection
                  customerId={id}
                  lineLinkStatus={customer.lineLinkStatus}
                  lineUserId={customer.lineUserId ?? null}
                  lineLinkedAt={customer.lineLinkedAt?.toISOString() ?? null}
                  lineBindingCode={customer.lineBindingCode ?? null}
                  lineBindingCodeCreatedAt={
                    customer.lineBindingCodeCreatedAt?.toISOString() ?? null
                  }
                  canManageLineRebind={canManageLineRebind && !isViewMode}
                  canRunLineRebindDryRun={canRunLineRebindDryRun}
                  activeLineRebindRequest={activeLineRebindRequest ? {
                    id: activeLineRebindRequest.id,
                    status: activeLineRebindRequest.status,
                    capturedAt: activeLineRebindRequest.capturedAt?.toISOString() ?? null,
                    expiresAt: activeLineRebindRequest.expiresAt.toISOString(),
                    userIdHashPrefix: activeLineRebindRequest.candidate?.userIdHash.slice(0, 8) ?? null,
                  } : null}
                />
              </div>
            )}

            {/* HealthFlow 連結狀態（DB-only；零 API call；方案 A）*/}
            <div className="mt-3 border-t border-earth-100 pt-3">
              <p className="mb-2 text-[11px] font-semibold text-earth-600">
                AI 健康評估
              </p>
              <HealthStatusBody
                customerId={id}
                healthProfileId={customer.healthProfileId ?? null}
                healthLinkStatus={customer.healthLinkStatus}
                healthSyncedAt={customer.healthSyncedAt ?? null}
              />
            </div>
          </SideCard>

          {/* Basic info — 緊湊兩欄 */}
          <CustomerBasicInfo
            name={customer.name}
            phone={customer.phone}
            email={customer.email}
            gender={customer.gender}
            birthday={customer.birthday}
            height={customer.height}
            lineName={customer.lineName}
            lineLinkStatus={customer.lineLinkStatus}
            derivedSource={derivedSource}
            createdAt={customer.createdAt}
            assignedStaff={customer.assignedStaff}
            notes={customer.notes}
          />

          <SideCard title="追蹤紀錄" subtitle="最近聯絡狀態">
            {customer.followUps.length === 0 ? (
              <p className="text-xs text-earth-500">尚無追蹤紀錄</p>
            ) : (
              <div className="space-y-2">
                {customer.followUps.map((followUp) => (
                  <div
                    key={followUp.id}
                    className="rounded-md border border-earth-100 bg-earth-50/40 px-3 py-2"
                  >
                    <p className="text-xs font-medium text-earth-800">
                      {CUSTOMER_FOLLOW_UP_RESULT_LABEL[followUp.result]}
                    </p>
                    <p className="mt-0.5 text-[11px] text-earth-500">
                      {followUp.createdBy.name} ·{" "}
                      {formatTWTime(followUp.createdAt, { style: "short" })}
                    </p>
                    {followUp.note ? (
                      <p className="mt-1.5 whitespace-pre-wrap text-xs leading-relaxed text-earth-700">
                        {followUp.note}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </SideCard>

          {/* 身分診斷（協助店長判斷真實註冊方式 + 偵測來源異常）*/}
          <IdentityDiagnosticPanel
            derivedSource={derivedSource}
            snapshot={identitySnapshot}
            customerPhone={customer.phone}
          />

          {/* Quick actions — links + inline stage form */}
          <SideCard title="快速操作" subtitle="常用動作直接進入">
            <div className="flex flex-col gap-1.5">
              {canEdit ? (
                <Link
                  href={`/dashboard/customers/${id}/edit`}
                  className={quickActionBase}
                >
                  <span>編輯資料</span>
                  <span>→</span>
                </Link>
              ) : (
                <span className={`${quickActionBase} cursor-not-allowed opacity-50`}>
                  <span>編輯資料</span>
                  <span>→</span>
                </span>
              )}
              {canManageLineRebind ? (
                <Link href={`/dashboard/customers/merge?source=${id}`} className={quickActionBase}>
                  <span>處理重複顧客</span>
                  <span>→</span>
                </Link>
              ) : null}
              {isViewMode ? (
                <span className={`${quickActionBase} cursor-not-allowed opacity-50`}>
                  <span>新增預約</span>
                  <span>→</span>
                </span>
              ) : (
                <Link href="#booking" className={quickActionBase}>
                  <span>新增預約</span>
                  <span>→</span>
                </Link>
              )}
              {isViewMode ? (
                <span className={`${quickActionBase} cursor-not-allowed opacity-50`}>
                  <span>查看預約紀錄</span>
                  <span>→</span>
                </span>
              ) : (
                <Link
                  href={`/dashboard/bookings?customerId=${id}`}
                  className={quickActionBase}
                >
                  <span>查看預約紀錄</span>
                  <span>→</span>
                </Link>
              )}
              {isViewMode ? (
                <span className={`${quickActionBase} cursor-not-allowed opacity-50`}>
                  <span>指派方案</span>
                  <span>→</span>
                </span>
              ) : (
                <Link href="#plan" className={quickActionBase}>
                  <span>指派方案</span>
                  <span>→</span>
                </Link>
              )}
              {canEdit && (
                <div className="mt-1 rounded-md border border-earth-200 px-3 py-2">
                  <CustomerStageForm
                    customerId={id}
                    currentStage={customer.customerStage}
                  />
                </div>
              )}
            </div>
          </SideCard>

          {/* Transfer customer (ADMIN only) */}
          {user.role === "ADMIN" && staffList.length > 0 && (
            <SideCard title="轉移顧客" subtitle="指派給其他店長">
              <TransferCustomerForm
                customerId={id}
                currentStaffId={customer.assignedStaffId}
                staffList={staffList}
              />
            </SideCard>
          )}

          {/* Growth summary — compact, full management on Growth page */}
          {user.role !== "CUSTOMER" && (
            <SideCard
              title="成長摘要"
              subtitle="完整成長系統將於 Growth 頁管理"
            >
              <div className="grid grid-cols-2 gap-2">
                <GrowthMetric label="推薦人數" value={referralCount} unit="人" />
                <GrowthMetric
                  label="分享次數"
                  value={perksSummary?.shareCount ?? 0}
                  unit="次"
                />
                <GrowthMetric
                  label="來店人數"
                  value={perksSummary?.visitedCount ?? 0}
                  unit="位"
                />
                <GrowthMetric
                  label="目前點數"
                  value={totalPoints}
                  unit="點"
                  tone="amber"
                />
              </div>
              <div className="mt-2 flex items-center justify-between rounded-md bg-earth-50 px-2.5 py-1.5">
                <span className="text-[11px] text-earth-500">人才階段</span>
                <span
                  className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${talentStageColor}`}
                >
                  {talentStageLabel}
                </span>
              </div>
            </SideCard>
          )}

          {/* System info */}
          <SideCard title="系統資訊" subtitle="營運除錯用">
            <dl className="flex flex-col">
              <SystemRow
                label="ID"
                value={
                  <span className="font-mono text-[11px]">{id.slice(-8)}</span>
                }
              />
              <SystemRow
                label="建立"
                value={formatTWTime(customer.createdAt, { dateOnly: true })}
              />
              <SystemRow
                label="最後更新"
                value={formatTWTime(customer.updatedAt, { dateOnly: true })}
              />
              <SystemRow
                label="LINE 綁定"
                value={
                  customer.lineLinkedAt
                    ? formatTWTime(customer.lineLinkedAt, { dateOnly: true })
                    : null
                }
              />
              <SystemRow label="來源" value={derivedSource.label} />
            </dl>
          </SideCard>
        </aside>
      </div>
    </PageShell>
  );
}

function GrowthMetric({
  label,
  value,
  unit,
  tone = "earth",
}: {
  label: string;
  value: number;
  unit: string;
  tone?: "earth" | "amber" | "primary";
}) {
  const valueClass =
    tone === "amber"
      ? "text-amber-700"
      : tone === "primary"
        ? "text-primary-700"
        : "text-earth-800";
  return (
    <div className="rounded-md bg-earth-50 px-2.5 py-1.5">
      <div className="text-[10px] text-earth-500">{label}</div>
      <div className={`text-base font-bold tabular-nums ${valueClass}`}>
        {value}
        <span className="ml-0.5 text-[10px] font-normal text-earth-400">
          {unit}
        </span>
      </div>
    </div>
  );
}

// 取得身分證據快照供 deriveCustomerSource 使用。
// 拆出小查詢、不污染 getCustomerDetail 的回傳形狀；同時避免把 passwordHash
// 本身洩漏到其他頁面 consumer — 這裡只用 boolean 表示「是否設定」。
async function buildIdentitySnapshot(
  customer: Awaited<ReturnType<typeof getCustomerDetailForUser>>,
): Promise<CustomerSourceSnapshot> {
  let hasPassword = false;
  let accountProviders: string[] = [];

  if (customer.userId) {
    const [userRow, accounts] = await Promise.all([
      prisma.user.findUnique({
        where: { id: customer.userId },
        select: { passwordHash: true },
      }),
      prisma.account.findMany({
        where: { userId: customer.userId },
        select: { provider: true },
      }),
    ]);
    hasPassword = !!userRow?.passwordHash;
    accountProviders = accounts.map((a) => a.provider);
  }

  return {
    authSource: customer.authSource,
    email: customer.email ?? null,
    lineUserId: customer.lineUserId ?? null,
    lineLinkStatus: customer.lineLinkStatus,
    googleId: customer.googleId ?? null,
    hasUser: !!customer.userId,
    hasPassword,
    accountProviders,
  };
}

function SystemRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-1">
      <dt className="text-[11px] text-earth-500">{label}</dt>
      <dd className="text-[12px] text-earth-700">
        {value == null || value === "" ? (
          <span className="text-earth-400">—</span>
        ) : (
          value
        )}
      </dd>
    </div>
  );
}

function WalletItem({
  w,
  userRole,
  canAdjustWallet,
  readOnly = false,
}: {
  w: {
    id: string;
    plan: { name: string };
    status: string;
    remainingSessions: number;
    totalSessions: number;
    purchasedPrice: unknown;
    startDate: Date;
    expiryDate: Date | null;
    sessions: SessionRow[];
  };
  userRole: string;
  canAdjustWallet: boolean;
  readOnly?: boolean;
}) {
  // PR-2 wallet-session-ui：所有非 CUSTOMER 角色都可見註銷按鈕；
  // wallet.adjust 權限由 server action 把關，UI 只負責顯示。
  const canVoid = !readOnly && userRole !== "CUSTOMER";

  // 從 sessions 推 available / reserved 計數，給補登 form 即時 preview 用。
  const availableCount = w.sessions.filter((s) => s.status === "AVAILABLE").length;
  const reservedCount = w.sessions.filter((s) => s.status === "RESERVED").length;

  // compact 第二輪：方案卡降高 — 摘要常駐顯示，次要操作（調整堂數 / 延長
  // 期限 / 堂數明細）一律收進單一 per-wallet「管理 ▾」，確保多方案時「建立
  // 預約」仍在第一屏。功能不變，只是預設收合。
  const canAdjustActive = canAdjustWallet && w.status === "ACTIVE";
  const canExtend =
    canAdjustWallet &&
    !!w.expiryDate &&
    (w.status === "ACTIVE" || w.status === "EXPIRED");
  const hasSessions = w.sessions.length > 0;
  const hasManage = canAdjustActive || canExtend || hasSessions;
  const manageLabel = readOnly
    ? "堂數明細"
    : "管理（調整堂數 / 延長到期日 / 堂數明細）";

  return (
    <div className="rounded-lg border border-earth-200">
      {/* 摘要列 — 常駐、compact */}
      <div className="px-3 py-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="text-sm font-medium text-earth-900">{w.plan.name}</span>
              <span
                className={`rounded px-1.5 py-0.5 text-[11px] ${
                  w.status === "ACTIVE"
                    ? "bg-green-50 text-green-700"
                    : "bg-earth-100 text-earth-600"
                }`}
              >
                {WALLET_STATUS_LABEL[w.status] ?? w.status}
              </span>
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-earth-400">
              <span>購入 NT$ {Number(w.purchasedPrice).toLocaleString()}</span>
              <span>開始 {formatTWTime(w.startDate, { dateOnly: true })}</span>
              {w.expiryDate && (
                <span>到期 {formatTWTime(w.expiryDate, { dateOnly: true })}</span>
              )}
            </div>
          </div>
          <div className="shrink-0 text-right text-sm">
            <div>
              <span className="text-lg font-bold text-primary-700">{availableCount}</span>
              <span className="text-earth-500"> 堂可再預約</span>
            </div>
            <div className="text-[11px] text-earth-500">
              方案剩餘 {w.remainingSessions} / {w.totalSessions} 堂
              {reservedCount > 0 ? `・待到店 ${reservedCount} 堂` : ""}
            </div>
          </div>
        </div>
      </div>

      {/* 次要操作 — 預設收合（調整堂數 / 延長期限 / 堂數明細）*/}
      {hasManage && (
        <details className="group border-t border-earth-100">
          <summary className="flex cursor-pointer items-center justify-between rounded px-3 py-1.5 text-[11px] font-medium text-earth-500 hover:text-earth-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-earth-300">
            <span className="group-open:hidden">{manageLabel} ▾</span>
            <span className="hidden group-open:inline">收合 ▴</span>
          </summary>
          <div className="space-y-2 px-3 pb-3">
            {canAdjustActive && (
              <div className="space-y-2">
                <AdjustWalletForm walletId={w.id} currentRemaining={w.remainingSessions} />
                {availableCount > 0 && (
                  <BackfillUsedSessionsForm
                    walletId={w.id}
                    available={availableCount}
                    reserved={reservedCount}
                    startDateLocal={toLocalDateStr(w.startDate)}
                  />
                )}
              </div>
            )}
            {/* PR-2：延長有效期限 — ACTIVE / EXPIRED 且有期限者可延長 */}
            {canAdjustWallet &&
              w.expiryDate &&
              (w.status === "ACTIVE" || w.status === "EXPIRED") && (
                <ExtendWalletExpiryForm
                  walletId={w.id}
                  currentExpiry={w.expiryDate.toISOString().slice(0, 10)}
                  expired={w.status === "EXPIRED"}
                />
              )}
            {hasSessions && (
              <div className="border-t border-earth-100 pt-2">
                <p className="mb-1.5 text-[11px] font-semibold text-earth-600">
                  堂數明細
                </p>
                <WalletSessionDetail
                  sessions={w.sessions}
                  adminVoid={
                    canVoid
                      ? {
                          walletId: w.id,
                          walletPlanName: w.plan.name,
                          renderButton: (s) => (
                            <VoidSessionButton
                              sessionId={s.id}
                              sessionNo={s.sessionNo}
                              walletPlanName={w.plan.name}
                            />
                          ),
                        }
                      : undefined
                  }
                />
              </div>
            )}
          </div>
        </details>
      )}
    </div>
  );
}
