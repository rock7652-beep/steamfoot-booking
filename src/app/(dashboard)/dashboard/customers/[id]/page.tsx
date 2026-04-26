import { getCustomerDetail } from "@/server/queries/customer";
import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { getCachedPlans, getCachedStaffOptions } from "@/lib/query-cache";
import { getActiveStoreForRead } from "@/lib/store";
import { ServerTiming, withTiming } from "@/lib/perf";
import { notFound, redirect } from "next/navigation";
import { DashboardLink as Link } from "@/components/dashboard-link";
import { PageShell, PageHeader, EmptyRow } from "@/components/desktop";
import { EmptyState } from "@/components/ui/empty-state";
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
import { TalentPipelineSection } from "./talent-pipeline-section";
import { ReferralWrapper } from "./referral-wrapper";
import { PointsSection } from "./points-section";
import { getReferralsByReferrer } from "@/server/queries/referral";
import { getPointHistory } from "@/server/queries/points";
import { getUpgradeEligibility } from "@/server/queries/talent";
import { getActiveBonusRules } from "@/server/queries/bonus-rule";
import { getMyReferralSummary } from "@/server/queries/my-referral-summary";
import { CustomerPotentialBadge } from "@/components/customer-potential-badge";
import { formatTWTime } from "@/lib/date-utils";

import { CustomerSummaryStrip } from "./_components/customer-summary-strip";
import { CustomerBasicInfo } from "./_components/customer-basic-info";
import { CustomerActivitySummary } from "./_components/customer-activity-summary";
import { CustomerGrowthSummary } from "./_components/customer-growth-summary";
import { CustomerActionRail } from "./_components/customer-action-rail";

const TX_TYPE_LABEL: Record<string, string> = {
  TRIAL_PURCHASE: "體驗購買",
  SINGLE_PURCHASE: "單次消費",
  PACKAGE_PURCHASE: "課程購買",
  SESSION_DEDUCTION: "堂數扣抵",
  SUPPLEMENT: "補差額",
  REFUND: "退款",
  ADJUSTMENT: "手動調整",
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

  const [
    plans,
    staffOptions,
    canDiscount,
    customerReferrals,
    customerPoints,
    upgradeEligibility,
    activeBonusRules,
    perksSummary,
  ] = await Promise.all([
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
      ? getReferralsByReferrer(id).catch((e) => {
          console.error("[customer-detail] referrals query failed", {
            ...logCtx,
            step: "referrals",
            error: e instanceof Error ? e.message : String(e),
          });
          return [];
        })
      : Promise.resolve([]),
    user.role !== "CUSTOMER"
      ? getPointHistory(id, { limit: 10 }).catch((e) => {
          console.error("[customer-detail] points query failed", {
            ...logCtx,
            step: "points",
            error: e instanceof Error ? e.message : String(e),
          });
          return [];
        })
      : Promise.resolve([]),
    user.role === "ADMIN" || user.role === "OWNER"
      ? getUpgradeEligibility(id).catch((e) => {
          console.error("[customer-detail] upgradeEligibility query failed", {
            ...logCtx,
            step: "upgradeEligibility",
            error: e instanceof Error ? e.message : String(e),
          });
          return null;
        })
      : Promise.resolve(null),
    user.role !== "CUSTOMER"
      ? getActiveBonusRules(effectiveStoreId).catch((e) => {
          console.error("[customer-detail] bonusRules query failed", {
            ...logCtx,
            step: "bonusRules",
            error: e instanceof Error ? e.message : String(e),
          });
          return [];
        })
      : Promise.resolve([]),
    user.role !== "CUSTOMER"
      ? withTiming("getMyReferralSummary", timer, () =>
          getMyReferralSummary(id, { activeStoreId: effectiveStoreId }),
        ).catch(() => null)
      : Promise.resolve(null),
  ]);

  timer.finish();

  const isOwnerRole = user.role === "ADMIN" || user.role === "OWNER";
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
  const transactions = customer.transactions ?? [];

  const referralCount = customer._count?.sponsoredCustomers ?? 0;
  const totalVisits = customer._count?.bookings ?? 0;

  // For summary / compact activity section
  const recentBookings = bookings.slice(0, 5).map((b) => ({
    id: b.id,
    bookingDate: b.bookingDate,
    slotTime: b.slotTime,
    bookingType: b.bookingType as string,
    bookingStatus: b.bookingStatus as string,
  }));

  return (
    <PageShell>
      {/* ========== 頁首 ========== */}
      <div className="flex items-center gap-1.5 text-[11px] text-earth-500">
        <Link href="/dashboard/customers" className="hover:text-earth-700">
          顧客管理
        </Link>
        <span className="text-earth-300">/</span>
        <span className="text-earth-700">顧客詳情</span>
      </div>

      <PageHeader
        title={customer.name}
        subtitle={[customer.phone, customer.lineName ? `LINE ${customer.lineName}` : null]
          .filter(Boolean)
          .join(" · ")}
        actions={
          <>
            <Link
              href="/dashboard/customers"
              className="rounded-md border border-earth-200 bg-white px-3 py-1.5 text-xs font-medium text-earth-700 hover:bg-earth-50"
            >
              ← 顧客列表
            </Link>
            <Link
              href={`/dashboard/bookings?customerId=${id}`}
              className="rounded-md border border-earth-200 bg-white px-3 py-1.5 text-xs font-medium text-earth-700 hover:bg-earth-50"
            >
              查看預約
            </Link>
          </>
        }
      />

      {/* ========== 摘要列 ========== */}
      <CustomerSummaryStrip
        lastVisitAt={customer.lastVisitAt}
        totalVisits={totalVisits}
        referralCount={referralCount}
        totalPoints={customer.totalPoints ?? 0}
        totalRemainingSessions={totalRemaining}
        talentStage={customer.talentStage}
      />

      {/* ========== 主 Grid 8 + 4 ========== */}
      <div className="grid grid-cols-12 gap-3">
        {/* 左側主內容 (col-8) */}
        <div className="col-span-12 space-y-3 lg:col-span-8">
          <CustomerBasicInfo
            name={customer.name}
            phone={customer.phone}
            email={customer.email}
            gender={customer.gender}
            birthday={customer.birthday}
            height={customer.height}
            lineName={customer.lineName}
            lineLinkStatus={customer.lineLinkStatus}
            authSource={customer.authSource}
            createdAt={customer.createdAt}
            assignedStaff={customer.assignedStaff}
            notes={customer.notes}
          />

          <CustomerActivitySummary
            lastVisitAt={customer.lastVisitAt}
            firstVisitAt={customer.firstVisitAt}
            convertedAt={customer.convertedAt}
            totalVisits={totalVisits}
            totalRemaining={totalRemaining}
            activeWallets={activeWallets.map((w) => ({
              id: w.id,
              planName: w.plan.name,
              remainingSessions: w.remainingSessions,
              totalSessions: w.totalSessions,
            }))}
            recentBookings={recentBookings}
          />

          {user.role !== "CUSTOMER" && (
            <CustomerGrowthSummary
              customerStage={customer.customerStage}
              talentStage={customer.talentStage}
              stageChangedAt={customer.stageChangedAt}
              stageNote={customer.stageNote}
              sponsor={customer.sponsor}
              referralCount={referralCount}
              upgradeEligible={upgradeEligibility?.isEligibleForFutureOwner ?? false}
            />
          )}
        </div>

        {/* 右側 Action Rail (col-4) */}
        <CustomerActionRail
          customerId={id}
          customerStage={customer.customerStage}
          talentStage={customer.talentStage}
          lineLinkStatus={customer.lineLinkStatus}
          lineLinkedAt={customer.lineLinkedAt}
          selfBookingEnabled={customer.selfBookingEnabled}
          accountActive={!!customer.user}
          isHighPotential={upgradeEligibility?.isEligibleForFutureOwner ?? false}
          authSource={customer.authSource}
          createdAt={customer.createdAt}
          updatedAt={customer.updatedAt}
          canEdit={canEdit}
        />
      </div>

      {/* ========== 詳細 section — 以下為既有完整 UI，維持 operation / admin 功能 ========== */}

      {/* 調整顧客階段 (anchor: #stage) */}
      <section id="stage" className="scroll-mt-16 rounded-xl border border-earth-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-earth-800">階段與狀態</h2>
        <p className="mt-0.5 text-[11px] text-earth-400">
          調整此顧客的購課階段（LEAD / 體驗 / 已購課 / 已停用）
        </p>
        <CustomerStageForm customerId={id} currentStage={customer.customerStage} />
      </section>

      {/* 人才管道 full */}
      {user.role !== "CUSTOMER" && (
        <section
          id="talent"
          className="scroll-mt-16 rounded-xl border border-earth-200 bg-white p-4"
        >
          <TalentPipelineSection
            customerId={id}
            talentStage={customer.talentStage}
            sponsor={customer.sponsor}
            referralCount={referralCount}
            stageNote={customer.stageNote}
            isOwner={isOwnerRole}
            upgradeEligibility={upgradeEligibility}
          />
        </section>
      )}

      {/* Transfer (Admin only) */}
      {user.role === "ADMIN" && staffList.length > 0 && (
        <section className="rounded-xl border border-earth-200 bg-white p-4">
          <h2 className="mb-2 text-sm font-semibold text-earth-800">轉移顧客</h2>
          <TransferCustomerForm
            customerId={id}
            currentStaffId={customer.assignedStaffId}
            staffList={staffList}
          />
        </section>
      )}

      {/* 分享與回饋（小區塊） */}
      {user.role !== "CUSTOMER" && perksSummary && (
        <section className="rounded-xl border border-earth-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-earth-800">分享與回饋</h2>
              <CustomerPotentialBadge
                input={{
                  shareCount: perksSummary.shareCount,
                  visitCount: perksSummary.visitedCount,
                  totalPoints: perksSummary.totalPoints,
                }}
                size="md"
              />
            </div>
            <span className="text-[11px] text-earth-400">好康互動概況</span>
          </div>
          <div className="mt-3 grid grid-cols-4 gap-3 text-center">
            <PerkCell label="分享" value={perksSummary.shareCount} unit="次" />
            <PerkCell label="加入" value={perksSummary.lineJoinCount} unit="位" />
            <PerkCell label="來店" value={perksSummary.visitedCount} unit="位" highlight />
            <PerkCell label="點數" value={perksSummary.totalPoints} unit="點" />
          </div>
          {perksSummary.nextMilestone && (
            <p className="mt-3 text-[11px] text-earth-500">
              距離下一個回饋還差{" "}
              <span className="font-semibold text-amber-700">
                {perksSummary.nextMilestone.remaining}
              </span>{" "}
              點（目標 {perksSummary.nextMilestone.target} 點）
            </p>
          )}
        </section>
      )}

      {/* 轉介紹紀錄 (anchor: #referrals) */}
      {user.role !== "CUSTOMER" && (
        <section
          id="referrals"
          className="scroll-mt-16 rounded-xl border border-earth-200 bg-white p-4"
        >
          <ReferralWrapper
            customerId={id}
            referrals={(customerReferrals ?? []).map((r) => ({
              id: r.id,
              referredName: r.referredName,
              referredPhone: r.referredPhone,
              status: r.status,
              note: r.note,
              createdAt:
                r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
            }))}
            canManage={isOwnerRole}
          />
        </section>
      )}

      {/* 集點 */}
      {user.role !== "CUSTOMER" && (
        <section className="rounded-xl border border-earth-200 bg-white p-4">
          <PointsSection
            customerId={id}
            totalPoints={customer.totalPoints || 0}
            recentPoints={(customerPoints ?? []).map((p) => ({
              id: p.id,
              type: p.type,
              points: p.points,
              note: p.note,
              createdAt:
                p.createdAt instanceof Date ? p.createdAt.toISOString() : String(p.createdAt),
            }))}
            bonusRules={(activeBonusRules ?? []).map((r) => ({
              id: r.id,
              name: r.name,
              points: r.points,
            }))}
            canManualAward={isOwnerRole}
          />
        </section>
      )}

      {/* 課程方案 */}
      <section id="plan" className="scroll-mt-16 rounded-xl border border-earth-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-earth-800">課程方案</h2>
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
        </div>
        {wallets.length === 0 ? (
          <EmptyState
            icon="empty"
            title="尚未購買課程"
            description="可在上方指派課程方案給此顧客"
          />
        ) : (
          <div className="space-y-3">
            {activeWallets.length > 0 && (
              <div className="space-y-2">
                {activeWallets.map((w) => (
                  <WalletItem key={w.id} w={w} userRole={user.role} />
                ))}
              </div>
            )}
            {inactiveWallets.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-medium text-earth-400">歷史方案</p>
                <div className="space-y-2 opacity-60">
                  {inactiveWallets.map((w) => (
                    <WalletItem key={w.id} w={w} userRole={user.role} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* 建立新預約 */}
      <section id="booking" className="scroll-mt-16 rounded-xl border border-earth-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-earth-800">建立新預約</h2>
        {activeWallets.length === 0 ? (
          <div className="rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 text-xs text-yellow-800">
            <p className="font-medium">此顧客尚無有效課程方案</p>
            <p className="mt-1 text-yellow-700">
              體驗或單次預約請直接建立；課程堂數預約需先在上方「課程方案」區塊指派方案。
            </p>
            <div className="mt-3">
              <CreateBookingForm customerId={id} activeWallets={[]} />
            </div>
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
      </section>

      {/* 未來預約 */}
      {upcomingBookings.length > 0 && (
        <section className="rounded-xl border border-earth-200 bg-white p-4">
          <h2 className="mb-2 text-sm font-semibold text-earth-800">
            未來預約（{upcomingBookings.length}）
          </h2>
          <div className="space-y-1.5">
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
                  操作
                </Link>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 預約歷史 (anchor: #bookings-history) */}
      <section
        id="bookings-history"
        className="scroll-mt-16 rounded-xl border border-earth-200 bg-white"
      >
        <div className="flex items-center justify-between px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-earth-800">預約紀錄</h2>
            <p className="text-[11px] text-earth-400">最近 {historyBookings.length} 筆</p>
          </div>
          <Link
            href={`/dashboard/bookings?customerId=${id}`}
            className="text-[11px] text-primary-600 hover:text-primary-700"
          >
            查看全部 →
          </Link>
        </div>
        {historyBookings.length === 0 ? (
          <EmptyRow title="尚無歷史預約" hint="此顧客還沒有預約紀錄" />
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-earth-50 text-[11px] font-medium text-earth-500">
              <tr>
                <th className="px-3 py-2">日期</th>
                <th className="px-3 py-2">時段</th>
                <th className="px-3 py-2">類型</th>
                <th className="px-3 py-2">狀態</th>
                <th className="w-16 px-3 py-2 text-right">詳情</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-earth-100">
              {historyBookings.map((b) => (
                <tr key={b.id} className="h-11 hover:bg-primary-50/40">
                  <td className="px-3 text-sm tabular-nums text-earth-800">
                    {formatTWTime(b.bookingDate, { dateOnly: true })}
                  </td>
                  <td className="px-3 text-[13px] text-earth-600">{b.slotTime}</td>
                  <td className="px-3 text-[13px] text-earth-600">{b.bookingType}</td>
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
        )}
      </section>

      {/* 消費紀錄 */}
      <section className="rounded-xl border border-earth-200 bg-white">
        <div className="flex items-center justify-between px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-earth-800">消費紀錄</h2>
            <p className="text-[11px] text-earth-400">最近 {transactions.length} 筆</p>
          </div>
          <Link
            href={`/dashboard/transactions?customerId=${id}`}
            className="text-[11px] text-primary-600 hover:text-primary-700"
          >
            查看全部 →
          </Link>
        </div>
        {transactions.length === 0 ? (
          <EmptyRow title="尚無消費紀錄" hint="此顧客還沒有消費記錄" />
        ) : (
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
              {transactions.map((t) => {
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
                    <td className="px-3 text-[13px] text-earth-500">{t.paymentMethod}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </PageShell>
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

function PerkCell({
  label,
  value,
  unit,
  highlight = false,
}: {
  label: string;
  value: number;
  unit: string;
  highlight?: boolean;
}) {
  return (
    <div className={`rounded-md px-2 py-2 ${highlight ? "bg-primary-50" : "bg-earth-50"}`}>
      <p className="text-[11px] text-earth-500">{label}</p>
      <p
        className={`mt-0.5 text-lg font-bold tabular-nums ${
          highlight ? "text-primary-700" : "text-earth-800"
        }`}
      >
        {value}
      </p>
      <p className="text-[10px] text-earth-400">{unit}</p>
    </div>
  );
}
