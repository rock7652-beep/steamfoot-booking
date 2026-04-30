import { getCustomerDetail } from "@/server/queries/customer";
import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { getCachedPlans, getCachedStaffOptions } from "@/lib/query-cache";
import { getActiveStoreForRead } from "@/lib/store";
import { ServerTiming, withTiming } from "@/lib/perf";
import { prisma } from "@/lib/db";
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
import { formatTWTime } from "@/lib/date-utils";
import { TALENT_STAGE_LABELS } from "@/types/talent";
import type { CustomerStage, TalentStage } from "@prisma/client";
import { deriveCustomerSource, type CustomerSourceSnapshot } from "@/lib/customer-source";

import { CustomerBasicInfo } from "./_components/customer-basic-info";
import { IdentityDiagnosticPanel } from "./_components/identity-diagnostic-panel";

const TX_TYPE_LABEL: Record<string, string> = {
  TRIAL_PURCHASE: "體驗購買",
  SINGLE_PURCHASE: "單次消費",
  PACKAGE_PURCHASE: "課程購買",
  SESSION_DEDUCTION: "堂數扣抵",
  SUPPLEMENT: "補差額",
  REFUND: "退款",
  ADJUSTMENT: "手動調整",
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

  const logCtx = {
    page: "customer-detail" as const,
    customerId: id,
    activeStoreId,
    sessionRole: user.role,
    sessionStoreId: user.storeId ?? null,
  };

  const timer = new ServerTiming(`/dashboard/customers/${id}`);

  let customer: Awaited<ReturnType<typeof getCustomerDetail>>;
  try {
    customer = await withTiming("getCustomerDetail", timer, () => getCustomerDetail(id));
  } catch (e) {
    console.error("[customer-detail] base query failed", {
      ...logCtx,
      step: "base",
      error: e instanceof Error ? e.message : String(e),
    });
    notFound();
  }

  if (activeStoreId && customer.storeId !== activeStoreId) {
    console.warn("[customer-detail] cross-store access blocked", {
      ...logCtx,
      step: "store-guard",
      customerStoreId: customer.storeId,
    });
    notFound();
  }

  const effectiveStoreId = customer.storeId;

  const [plans, staffOptions, canDiscount, perksSummary] = await Promise.all([
    withTiming("getCachedPlans", timer, () => getCachedPlans(effectiveStoreId)).catch((e) => {
      console.error("[customer-detail] plans query failed", {
        ...logCtx,
        step: "plans",
        error: e instanceof Error ? e.message : String(e),
      });
      return [] as Awaited<ReturnType<typeof getCachedPlans>>;
    }),
    withTiming("getCachedStaffOptions", timer, () => getCachedStaffOptions()).catch((e) => {
      console.error("[customer-detail] staffOptions query failed", {
        ...logCtx,
        step: "staffOptions",
        error: e instanceof Error ? e.message : String(e),
      });
      return [] as Awaited<ReturnType<typeof getCachedStaffOptions>>;
    }),
    checkPermission(user.role, user.staffId, "transaction.discount").catch(() => false),
    user.role !== "CUSTOMER"
      ? withTiming("getMyReferralSummary", timer, () =>
          getMyReferralSummary(id, { activeStoreId: effectiveStoreId }),
        ).catch(() => null)
      : Promise.resolve(null),
  ]);

  timer.finish();

  // ── 身分證據快照（用於 deriveCustomerSource）──
  // 不從 getCustomerDetail 直接撈（避免 leak passwordHash 給其他 consumer），
  // 在頁面層做一次小查詢，取「是否有 passwordHash」+ 「Account 的 provider 列表」
  const identitySnapshot = await buildIdentitySnapshot(customer);
  const derivedSource = deriveCustomerSource(identitySnapshot);

  const canEdit = user.role !== "CUSTOMER";

  const staffList =
    user.role === "ADMIN"
      ? staffOptions.map((s) => ({ id: s.id, displayName: s.displayName }))
      : [];

  const wallets = customer.planWallets ?? [];
  const activeWallets = wallets.filter((w) => w.status === "ACTIVE");
  const inactiveWallets = wallets.filter((w) => w.status !== "ACTIVE");
  const totalRemaining = activeWallets.reduce((s, w) => s + w.remainingSessions, 0);

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

  const headerActionBase =
    "rounded-md border border-earth-200 bg-white px-3 py-1.5 text-xs font-medium text-earth-700 hover:bg-earth-50";

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
            <Link
              href={`/dashboard/bookings?customerId=${id}`}
              className={headerActionBase}
            >
              查看預約
            </Link>
            {canEdit && (
              <Link
                href={`/dashboard/customers/${id}/edit`}
                className={headerActionBase}
              >
                編輯資料
              </Link>
            )}
            <Link
              href="#booking"
              className="rounded-md bg-primary-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-700"
            >
              + 新增預約
            </Link>
          </>
        }
      />

      {/* Header chips — quick state at a glance */}
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1.5 border-b border-earth-200 pb-2">
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${customerStageColor}`}
        >
          {customerStageLabel}
        </span>
        <span
          className={
            customer.lineLinkStatus === "LINKED"
              ? "rounded-full bg-green-50 px-2 py-0.5 text-[11px] font-medium text-green-700"
              : "rounded-full bg-earth-100 px-2 py-0.5 text-[11px] font-medium text-earth-500"
          }
        >
          {customer.lineLinkStatus === "LINKED" ? "LINE 已綁定" : "LINE 未綁定"}
        </span>
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${talentStageColor}`}
        >
          {talentStageLabel}
        </span>
        <span className="ml-2 text-earth-200">｜</span>
        <span className="inline-flex items-center gap-1 text-[12px] text-earth-700">
          <span className="text-[11px] text-earth-500">剩餘堂數</span>
          <span
            className={`text-[14px] font-bold tabular-nums ${
              totalRemaining > 0 ? "text-primary-700" : "text-earth-500"
            }`}
          >
            {totalRemaining}
          </span>
          <span className="text-[11px] text-earth-500">堂</span>
        </span>
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

      {/* Main 8/4 grid */}
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-12">
        {/* ========== Left 8 — primary operations ========== */}
        <div className="space-y-3 xl:col-span-8">
          {/* 1. Plans */}
          <section
            id="plan"
            className="scroll-mt-16 rounded-xl border border-earth-200 bg-white p-4"
          >
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-earth-800">課程方案</h2>
                <p className="text-[11px] text-earth-400">
                  目前有效方案、剩餘堂數、到期日
                </p>
              </div>
              {canEdit && (
                <AssignPlanForm
                  customerId={id}
                  canDiscount={canDiscount}
                  plans={plans.map((p) => ({
                    id: p.id,
                    name: p.name,
                    category: p.category,
                    price: Number(p.price),
                    sessionCount: p.sessionCount,
                  }))}
                />
              )}
            </div>

            {wallets.length === 0 ? (
              <div className="flex items-center justify-between rounded-lg border border-earth-100 bg-earth-50/40 px-4 py-3 text-xs text-earth-500">
                <span>尚未指派方案</span>
                <span className="text-[11px] text-earth-400">
                  使用右上方「+ 指派方案」開始
                </span>
              </div>
            ) : (
              <div className="space-y-2">
                {activeWallets.map((w) => (
                  <WalletItem key={w.id} w={w} userRole={user.role} />
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
                        <WalletItem key={w.id} w={w} userRole={user.role} />
                      ))}
                    </div>
                  </details>
                )}
              </div>
            )}
          </section>

          {/* 2. Create booking */}
          <section
            id="booking"
            className="scroll-mt-16 rounded-xl border border-earth-200 bg-white p-4"
          >
            <h2 className="mb-3 text-sm font-semibold text-earth-800">建立預約</h2>
            {activeWallets.length === 0 ? (
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
                activeWallets={activeWallets.map((w) => ({
                  id: w.id,
                  planName: w.plan.name,
                  remainingSessions: w.remainingSessions,
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
                      <Link
                        href={`/dashboard/bookings/${b.id}`}
                        className="text-primary-700 hover:underline"
                      >
                        操作 →
                      </Link>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* 3. Booking history (recent 5) */}
          <section
            id="bookings-history"
            className="scroll-mt-16 rounded-xl border border-earth-200 bg-white"
          >
            <div className="flex items-center justify-between px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold text-earth-800">預約紀錄</h2>
                <p className="text-[11px] text-earth-400">
                  最近 {recentHistory.length} / {historyBookings.length} 筆
                </p>
              </div>
              <Link
                href={`/dashboard/bookings?customerId=${id}`}
                className="text-[11px] text-primary-600 hover:text-primary-700"
              >
                查看全部 →
              </Link>
            </div>
            {recentHistory.length === 0 ? (
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
                          <Link
                            href={`/dashboard/bookings/${b.id}`}
                            className="text-[11px] text-primary-600 hover:text-primary-700"
                          >
                            →
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* 4. Transactions (recent 5) */}
          <section className="rounded-xl border border-earth-200 bg-white">
            <div className="flex items-center justify-between px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold text-earth-800">消費紀錄</h2>
                <p className="text-[11px] text-earth-400">
                  最近 {recentTransactions.length} / {transactions.length} 筆
                </p>
              </div>
              <Link
                href={`/dashboard/transactions?customerId=${id}`}
                className="text-[11px] text-primary-600 hover:text-primary-700"
              >
                查看全部 →
              </Link>
            </div>
            {recentTransactions.length === 0 ? (
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
            )}
          </section>
        </div>

        {/* ========== Right 4 — info & quick actions ========== */}
        <aside className="space-y-3 xl:col-span-4">
          {/* Basic info */}
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

          {/* 身分診斷（協助店長判斷真實註冊方式 + 偵測來源異常）*/}
          <IdentityDiagnosticPanel
            derivedSource={derivedSource}
            snapshot={identitySnapshot}
            customerPhone={customer.phone}
          />

          {/* Status badges */}
          <SideCard title="狀態" subtitle="目前系統狀態">
            <div className="flex flex-wrap gap-1.5">
              <span
                className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${customerStageColor}`}
              >
                {customerStageLabel}
              </span>
              {customer.lineLinkStatus === "LINKED" ? (
                <span className="rounded bg-green-50 px-1.5 py-0.5 text-[11px] font-medium text-green-700">
                  LINE 已綁定
                </span>
              ) : (
                <span className="rounded bg-earth-100 px-1.5 py-0.5 text-[11px] font-medium text-earth-500">
                  LINE 未綁定
                </span>
              )}
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
          </SideCard>

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
              <Link href="#booking" className={quickActionBase}>
                <span>新增預約</span>
                <span>→</span>
              </Link>
              <Link
                href={`/dashboard/bookings?customerId=${id}`}
                className={quickActionBase}
              >
                <span>查看預約紀錄</span>
                <span>→</span>
              </Link>
              <Link href="#plan" className={quickActionBase}>
                <span>指派方案</span>
                <span>→</span>
              </Link>
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
  customer: Awaited<ReturnType<typeof getCustomerDetail>>,
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
}) {
  // PR-2 wallet-session-ui：所有非 CUSTOMER 角色都可見註銷按鈕；
  // wallet.adjust 權限由 server action 把關，UI 只負責顯示。
  const canVoid = userRole !== "CUSTOMER";

  return (
    <div className="rounded-lg border border-earth-200 p-3">
      <div className="flex items-start justify-between">
        <div>
          <span className="text-sm font-medium text-earth-900">{w.plan.name}</span>
          <span
            className={`ml-2 rounded px-1.5 py-0.5 text-[11px] ${
              w.status === "ACTIVE"
                ? "bg-green-50 text-green-700"
                : "bg-earth-100 text-earth-600"
            }`}
          >
            {WALLET_STATUS_LABEL[w.status] ?? w.status}
          </span>
        </div>
        <div className="text-right text-sm">
          <span className="text-lg font-bold text-primary-700">{w.remainingSessions}</span>
          <span className="text-earth-500"> / {w.totalSessions} 堂</span>
        </div>
      </div>
      <div className="mt-1 flex items-center gap-4 text-[11px] text-earth-400">
        <span>購入 NT$ {Number(w.purchasedPrice).toLocaleString()}</span>
        <span>開始 {formatTWTime(w.startDate, { dateOnly: true })}</span>
        {w.expiryDate && <span>到期 {formatTWTime(w.expiryDate, { dateOnly: true })}</span>}
      </div>
      {userRole === "ADMIN" && w.status === "ACTIVE" && (
        <div className="mt-2 border-t pt-2">
          <AdjustWalletForm walletId={w.id} currentRemaining={w.remainingSessions} />
        </div>
      )}

      {w.sessions.length > 0 && (
        <details className="mt-3 group">
          <summary className="cursor-pointer text-xs font-semibold text-earth-700 hover:text-earth-900">
            <span className="group-open:hidden">堂數明細 ▾</span>
            <span className="hidden group-open:inline">收合 ▴</span>
          </summary>
          <div className="mt-2">
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
        </details>
      )}
    </div>
  );
}
