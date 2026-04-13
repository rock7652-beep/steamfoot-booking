import { getCustomerDetail } from "@/server/queries/customer";
import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { getCurrentStorePlan } from "@/lib/store-plan";
import { hasFeature as hasPricingFeature, FEATURES as FF } from "@/lib/feature-flags";
import { getCachedPlans, getCachedStaffOptions } from "@/lib/query-cache";
import { ServerTiming, withTiming } from "@/lib/perf";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { AssignPlanForm } from "./assign-plan-form";
import { TransferCustomerForm } from "./transfer-customer-form";
import { CreateBookingForm } from "./create-booking-form";
import { AdjustWalletForm } from "./adjust-wallet-form";
import { LineBindingSection } from "./line-binding-section";
import { HealthSectionWrapper } from "./health-section";
import { HealthSummarySection } from "./health-summary";
import { HealthHistorySection } from "./health-history";
import { CustomerStageForm } from "./customer-stage-form";
import { getCustomerTags, getCustomerScript } from "@/server/queries/customer-tags";
import { getOpsActionLogs } from "@/server/actions/ops-action-log";
import { OpsPanel } from "./ops-panel";
import { EditCustomerModal } from "./edit-customer-modal";
import {
  STATUS_LABEL,
  STATUS_COLOR,
  WALLET_STATUS_LABEL,
} from "@/lib/booking-constants";
import { TALENT_STAGE_LABELS } from "@/types/talent";
import { TalentPipelineSection } from "./talent-pipeline-section";
import { ReferralWrapper } from "./referral-wrapper";
import { PointsSection } from "./points-section";
import { getReferralsByReferrer } from "@/server/queries/referral";
import { getPointHistory } from "@/server/queries/points";

const STAGE_LABEL: Record<string, string> = {
  LEAD: "名單", TRIAL: "體驗", ACTIVE: "已購課", INACTIVE: "已停用",
};
const STAGE_COLOR: Record<string, string> = {
  LEAD: "bg-earth-100 text-earth-700", TRIAL: "bg-blue-100 text-blue-700",
  ACTIVE: "bg-green-100 text-green-700", INACTIVE: "bg-yellow-100 text-yellow-700",
};
const TX_TYPE_LABEL: Record<string, string> = {
  TRIAL_PURCHASE: "體驗購買", SINGLE_PURCHASE: "單次消費", PACKAGE_PURCHASE: "課程購買",
  SESSION_DEDUCTION: "堂數扣抵", SUPPLEMENT: "補差額", REFUND: "退款", ADJUSTMENT: "手動調整",
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

  const timer = new ServerTiming(`/dashboard/customers/${id}`);

  const [customer, plans, staffOptions, tags, scripts, customerActionLogs, canDiscount, customerReferrals, customerPoints] = await Promise.all([
    withTiming("getCustomerDetail", timer, () => getCustomerDetail(id)),
    withTiming("getCachedPlans", timer, () => getCachedPlans(user.storeId!)),
    withTiming("getCachedStaffOptions", timer, () => getCachedStaffOptions()),
    user.role !== "CUSTOMER" ? withTiming("getCustomerTags", timer, () => getCustomerTags(id)) : Promise.resolve([]),
    user.role !== "CUSTOMER" ? withTiming("getCustomerScript", timer, () => getCustomerScript(id)) : Promise.resolve([]),
    user.role !== "CUSTOMER" ? withTiming("getOpsActionLogs", timer, () => getOpsActionLogs("customer_action")) : Promise.resolve(new Map()),
    checkPermission(user.role, user.staffId, "transaction.discount"),
    user.role !== "CUSTOMER" ? getReferralsByReferrer(id).catch(() => []) : Promise.resolve([]),
    user.role !== "CUSTOMER" ? getPointHistory(id, { limit: 10 }).catch(() => []) : Promise.resolve([]),
  ]);

  timer.finish();

  // PricingPlan: check AI health features
  const pricingPlan = await getCurrentStorePlan();
  const hasAiHealth = hasPricingFeature(pricingPlan, FF.AI_HEALTH_SUMMARY);

  // For transfer form, only pass staff list to Owner
  const staffList =
    user.role === "ADMIN"
      ? staffOptions.map((s) => ({ id: s.id, displayName: s.displayName }))
      : [];

  const activeWallets = customer.planWallets.filter((w) => w.status === "ACTIVE");
  const inactiveWallets = customer.planWallets.filter((w) => w.status !== "ACTIVE");
  const totalRemaining = activeWallets.reduce((s, w) => s + w.remainingSessions, 0);

  const upcomingBookings = customer.bookings.filter(
    (b) => b.bookingStatus === "PENDING" || b.bookingStatus === "CONFIRMED"
  );
  const historyBookings = customer.bookings.filter(
    (b) => b.bookingStatus !== "PENDING" && b.bookingStatus !== "CONFIRMED"
  );


  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/dashboard/customers" className="text-sm text-earth-500 hover:text-earth-700">
          ← 顧客列表
        </Link>
      </div>

      {/* Basic Info */}
      <div className="rounded-xl border bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-earth-900">{customer.name}</h1>
              <EditCustomerModal
                customer={{
                  id,
                  name: customer.name,
                  phone: customer.phone,
                  email: customer.email,
                  gender: customer.gender,
                  birthday: customer.birthday?.toISOString().slice(0, 10) ?? null,
                  height: customer.height,
                  notes: customer.notes,
                  lineName: customer.lineName,
                }}
              />
            </div>
            <p className="mt-0.5 text-sm text-earth-500">{customer.phone}</p>
            {customer.lineName && <p className="text-xs text-earth-400">LINE: {customer.lineName}</p>}
          </div>
          <div className="flex flex-col items-end gap-2">
            <span className={`rounded px-2 py-1 text-xs font-medium ${STAGE_COLOR[customer.customerStage] ?? "bg-earth-100 text-earth-700"}`}>
              {STAGE_LABEL[customer.customerStage] ?? customer.customerStage}
            </span>
            {customer.user ? (
              <span className="rounded bg-green-100 px-2 py-0.5 text-xs text-green-700">
                帳號已啟用
              </span>
            ) : (
              <span className="rounded bg-orange-100 px-2 py-0.5 text-xs text-orange-700">
                帳號未開通
              </span>
            )}
            {customer.selfBookingEnabled && (
              <span className="rounded bg-primary-100 px-2 py-0.5 text-xs text-primary-700">
                自助預約開啟
              </span>
            )}
          </div>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-earth-500">直屬店長</dt>
            <dd className="font-medium">{customer.assignedStaff?.displayName ?? "未指派"}</dd>
          </div>
          <div>
            <dt className="text-earth-500">剩餘堂數</dt>
            <dd className="text-lg font-bold text-primary-700">{totalRemaining} 堂</dd>
          </div>
          <div>
            <dt className="text-earth-500">首次到店</dt>
            <dd>{customer.firstVisitAt ? new Date(customer.firstVisitAt).toLocaleDateString("zh-TW", { timeZone: "Asia/Taipei" }) : "—"}</dd>
          </div>
          <div>
            <dt className="text-earth-500">首次購課</dt>
            <dd>{customer.convertedAt ? new Date(customer.convertedAt).toLocaleDateString("zh-TW", { timeZone: "Asia/Taipei" }) : "—"}</dd>
          </div>
          {customer.notes && (
            <div className="col-span-3">
              <dt className="text-earth-500">備註</dt>
              <dd className="text-earth-700">{customer.notes}</dd>
            </div>
          )}
        </dl>

        {/* Stage change — optimistic client component */}
        <CustomerStageForm customerId={id} currentStage={customer.customerStage} />

        {/* 人才管道 — sponsor & talentStage */}
        {user.role !== "CUSTOMER" && (
          <TalentPipelineSection
            customerId={id}
            talentStage={customer.talentStage}
            sponsor={customer.sponsor}
            referralCount={customer.sponsoredCustomers.length}
            stageNote={customer.stageNote}
            isOwner={user.role === "ADMIN" || user.role === "STORE_MANAGER"}
          />
        )}

        {/* LINE 綁定 */}
        <LineBindingSection
          customerId={id}
          lineLinkStatus={customer.lineLinkStatus}
          lineUserId={customer.lineUserId ?? null}
          lineLinkedAt={customer.lineLinkedAt?.toISOString() ?? null}
          lineBindingCode={customer.lineBindingCode ?? null}
          lineBindingCodeCreatedAt={customer.lineBindingCodeCreatedAt?.toISOString() ?? null}
        />

        {/* Transfer (Owner only) */}
        {user.role === "ADMIN" && staffList.length > 0 && (
          <div className="mt-3 border-t pt-3">
            <TransferCustomerForm
              customerId={id}
              currentStaffId={customer.assignedStaffId}
              staffList={staffList}
            />
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════ */}
      {/* 轉介紹紀錄（獨立區塊）                          */}
      {/* ═══════════════════════════════════════════════ */}
      {user.role !== "CUSTOMER" && (
        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <ReferralWrapper
            customerId={id}
            referrals={(customerReferrals ?? []).map((r) => ({
              id: r.id,
              referredName: r.referredName,
              referredPhone: r.referredPhone,
              status: r.status,
              note: r.note,
              createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
            }))}
            canManage={user.role === "ADMIN" || user.role === "STORE_MANAGER"}
          />
        </div>
      )}

      {/* ═══════════════════════════════════════════════ */}
      {/* 行動積分（獨立區塊）                            */}
      {/* ═══════════════════════════════════════════════ */}
      {user.role !== "CUSTOMER" && (
        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <PointsSection
            totalPoints={customer.totalPoints ?? 0}
            recentPoints={(customerPoints ?? []).map((p) => ({
              id: p.id,
              type: p.type,
              points: p.points,
              note: p.note,
              createdAt: p.createdAt instanceof Date ? p.createdAt.toISOString() : String(p.createdAt),
            }))}
          />
        </div>
      )}

      {/* AI健康評估（串接健康管理系統）— 需 GROWTH+ */}
      {hasAiHealth && (
        <HealthSectionWrapper
          customerId={id}
          customerEmail={customer.email}
          customerPhone={customer.phone}
          healthLinkStatus={customer.healthLinkStatus}
          healthProfileId={customer.healthProfileId}
        >
          {customer.healthProfileId && (
            <HealthSummarySection healthProfileId={customer.healthProfileId} customerId={id} />
          )}
        </HealthSectionWrapper>
      )}

      {/* AI健康評估歷程（教練/店長視角）— 需 GROWTH+ */}
      {hasAiHealth && customer.healthProfileId && customer.healthLinkStatus === "linked" && (
        <HealthHistorySection healthProfileId={customer.healthProfileId} customerId={id} />
      )}

      {/* Ops Panel (staff only) */}
      {user.role !== "CUSTOMER" && (
        <OpsPanel
          customerId={id}
          customerName={customer.name}
          phone={customer.phone}
          lineLinked={customer.lineLinkStatus === "LINKED" && !!customer.lineUserId}
          tags={tags}
          scripts={scripts}
          followUp={(() => {
            // Find the latest action log for any refId containing this customer ID
            for (const [, log] of customerActionLogs) {
              if (log.refId.includes(id)) return log;
            }
            return null;
          })()}
        />
      )}

      {/* Wallets */}
      <div id="plan" className="rounded-xl border bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold text-earth-800">課程方案</h2>
          <AssignPlanForm customerId={id} canDiscount={canDiscount} plans={plans.map((p) => ({
            id: p.id,
            name: p.name,
            category: p.category,
            price: Number(p.price),
            sessionCount: p.sessionCount,
          }))} />
        </div>
        {customer.planWallets.length === 0 ? (
          <EmptyState
            icon="empty"
            title="尚未購買課程"
            description="可在上方指派課程方案給此顧客"
          />
        ) : (
          <div className="space-y-4">
            {/* 有效課程 */}
            {activeWallets.length > 0 && (
              <div className="space-y-3">
                {activeWallets.map((w) => (
                  <WalletItem key={w.id} w={w} userRole={user.role} />
                ))}
              </div>
            )}
            {/* 歷史課程 */}
            {inactiveWallets.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-medium text-earth-400">歷史方案</p>
                <div className="space-y-3 opacity-60">
                  {inactiveWallets.map((w) => (
                    <WalletItem key={w.id} w={w} userRole={user.role} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Create Booking */}
      <div id="booking" className="rounded-xl border bg-white p-6 shadow-sm">
        <h2 className="mb-4 font-semibold text-earth-800">建立新預約</h2>
        {activeWallets.length === 0 ? (
          <div className="rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
            <p className="font-medium">此顧客尚無有效課程方案</p>
            <p className="mt-1 text-xs text-yellow-700">
              體驗或單次預約請直接建立；課程堂數預約需先在上方「課程方案」區塊指派方案。
            </p>
            <div className="mt-3">
              <CreateBookingForm
                customerId={id}
                activeWallets={[]}
              />
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
      </div>

      {/* Upcoming bookings */}
      {upcomingBookings.length > 0 && (
        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <h2 className="mb-3 font-semibold text-earth-800">
            未來預約（{upcomingBookings.length}）
          </h2>
          <div className="space-y-2">
            {upcomingBookings.map((b) => (
              <div key={b.id} className="flex items-center justify-between rounded-lg bg-blue-50 px-3 py-2 text-sm">
                <span>{new Date(b.bookingDate).toLocaleDateString("zh-TW")} {b.slotTime}</span>
                <span className="text-xs text-blue-700">
                  {STATUS_LABEL[b.bookingStatus] ?? b.bookingStatus}
                </span>
                <Link href={`/dashboard/bookings/${b.id}`} className="text-primary-600 hover:underline">
                  操作
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Booking history */}
      <div className="rounded-xl border bg-white p-6 shadow-sm">
        <h2 className="mb-3 font-semibold text-earth-800">
          預約紀錄（最近 {historyBookings.length} 筆）
        </h2>
        {historyBookings.length === 0 ? (
          <EmptyState icon="empty" title="尚無歷史預約" description="此顧客還沒有預約紀錄" />
        ) : (
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b text-xs text-earth-500">
                <th className="pb-2 text-left">日期</th>
                <th className="pb-2 text-left">時段</th>
                <th className="pb-2 text-left">類型</th>
                <th className="pb-2 text-left">狀態</th>
                <th className="pb-2 text-left">詳情</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-earth-100">
              {historyBookings.map((b) => (
                <tr key={b.id}>
                  <td className="py-2">{new Date(b.bookingDate).toLocaleDateString("zh-TW")}</td>
                  <td className="py-2 text-earth-600">{b.slotTime}</td>
                  <td className="py-2 text-earth-600">{b.bookingType}</td>
                  <td className="py-2">
                    <span className={`rounded px-1.5 py-0.5 text-xs ${
                      b.bookingStatus === "COMPLETED" ? "bg-green-100 text-green-700" :
                      b.bookingStatus === "CANCELLED" ? "bg-earth-100 text-earth-500" :
                      "bg-earth-100 text-earth-600"
                    }`}>
                      {STATUS_LABEL[b.bookingStatus] ?? b.bookingStatus}
                    </span>
                  </td>
                  <td className="py-2">
                    <Link href={`/dashboard/bookings/${b.id}`} className="text-primary-600 hover:underline">
                      →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Transactions */}
      <div className="rounded-xl border bg-white p-6 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold text-earth-800">
            消費紀錄（最近 {customer.transactions.length} 筆）
          </h2>
          <Link
            href={`/dashboard/transactions?customerId=${id}`}
            className="text-xs text-primary-600 hover:underline"
          >
            查看全部
          </Link>
        </div>
        {customer.transactions.length === 0 ? (
          <EmptyState icon="empty" title="尚無消費紀錄" description="此顧客還沒有消費記錄" />
        ) : (
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b text-xs text-earth-500">
                <th className="pb-2 text-left">日期</th>
                <th className="pb-2 text-left">類型</th>
                <th className="pb-2 text-right">金額</th>
                <th className="pb-2 text-left">付款方式</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-earth-100">
              {customer.transactions.map((t) => {
                const hasDiscount = t.originalAmount && t.discountType && t.discountType !== "none";
                return (
                <tr key={t.id}>
                  <td className="py-2 text-earth-600">
                    {new Date(t.createdAt).toLocaleDateString("zh-TW", { timeZone: "Asia/Taipei" })}
                  </td>
                  <td className="py-2">{TX_TYPE_LABEL[t.transactionType] ?? t.transactionType}</td>
                  <td className={`py-2 text-right font-medium ${Number(t.amount) < 0 ? "text-red-600" : "text-earth-900"}`}>
                    {hasDiscount ? (
                      <div>
                        <span className="text-xs text-earth-400 line-through">NT$ {Number(t.originalAmount).toLocaleString()}</span>
                        <br />
                        <span>NT$ {Number(t.amount).toLocaleString()}</span>
                        {t.discountReason && (
                          <span className="ml-1 text-[10px] text-amber-600">({t.discountReason})</span>
                        )}
                      </div>
                    ) : (
                      <>NT$ {Number(t.amount).toLocaleString()}</>
                    )}
                  </td>
                  <td className="py-2 text-earth-500">{t.paymentMethod}</td>
                </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function WalletItem({ w, userRole }: { w: { id: string; plan: { name: string }; status: string; remainingSessions: number; totalSessions: number; purchasedPrice: unknown; startDate: Date; expiryDate: Date | null }; userRole: string }) {
  return (
    <div className={`rounded-lg border p-3 ${w.status !== "ACTIVE" ? "" : ""}`}>
      <div className="flex items-start justify-between">
        <div>
          <span className="font-medium">{w.plan.name}</span>
          <span className={`ml-2 rounded px-1.5 py-0.5 text-xs ${
            w.status === "ACTIVE" ? "bg-green-100 text-green-700" : "bg-earth-100 text-earth-600"
          }`}>
            {WALLET_STATUS_LABEL[w.status] ?? w.status}
          </span>
        </div>
        <div className="text-right text-sm">
          <span className="text-lg font-bold text-primary-700">{w.remainingSessions}</span>
          <span className="text-earth-500"> / {w.totalSessions} 堂</span>
        </div>
      </div>
      <div className="mt-1 flex items-center gap-4 text-xs text-earth-400">
        <span>購入 NT$ {Number(w.purchasedPrice).toLocaleString()}</span>
        <span>開始 {new Date(w.startDate).toLocaleDateString("zh-TW")}</span>
        {w.expiryDate && <span>到期 {new Date(w.expiryDate).toLocaleDateString("zh-TW")}</span>}
      </div>
      {userRole === "ADMIN" && w.status === "ACTIVE" && (
        <div className="mt-2 border-t pt-2">
          <AdjustWalletForm walletId={w.id} currentRemaining={w.remainingSessions} />
        </div>
      )}
    </div>
  );
}
