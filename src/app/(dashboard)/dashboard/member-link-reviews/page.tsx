import { redirect } from "next/navigation";
import { DashboardLink as Link } from "@/components/dashboard-link";
import { PageHeader, PageShell } from "@/components/desktop";
import { bookingDateToday, formatTWTime } from "@/lib/date-utils";
import { checkPermission } from "@/lib/permissions";
import { getCurrentUser } from "@/lib/session";
import { getActiveStoreForRead } from "@/lib/store";
import { prisma } from "@/lib/db";
import {
  getCentralMemberHealthIssues,
  getCentralMemberLinkReviewRequests,
  type CentralMemberHealthIssueView,
} from "@/server/queries/central-member-link-review";
import { MemberLinkReviewForm } from "./review-form";

const statusLabel = { PENDING: "待處理", APPROVED: "已核准", REJECTED: "已拒絕", CANCELLED: "已取消" };
const categoryLabel = { PHONE: "手機", LINE: "LINE", GOOGLE: "Google", CENTRAL_IDENTITY: "中央會員" };
const reasonLabel = {
  duplicate_phone: "同店有兩筆顧客使用相同手機",
  line_identity_mismatch: "LINE 身分與顧客資料不一致",
  google_identity_mismatch: "Google 身分與顧客資料不一致",
  link_store_mismatch: "會員連結與顧客所屬門市不一致",
  merged_customer: "已歸檔的顧客仍保有會員連結",
  customer_linked_to_another_user: "顧客與會員連結屬於不同登入身分",
  multiple_customers_in_store: "同一中央會員在同店連到多筆顧客",
};

export default async function MemberLinkReviewsPage() {
  const user = await getCurrentUser();
  if (!user || !(await checkPermission(user.role, user.staffId, "customer.identity.rebind"))) redirect("/dashboard");
  const storeId = await getActiveStoreForRead(user);
  if (!storeId) redirect("/dashboard");

  const [requests, healthIssues] = await Promise.all([
    getCentralMemberLinkReviewRequests(storeId),
    getCentralMemberHealthIssues(storeId),
  ]);
  const pendingRequests = requests.filter((request) => request.status === "PENDING");
  const handledRequests = requests.filter((request) => request.status !== "PENDING");
  const futureCounts = pendingRequests.length
    ? await prisma.booking.groupBy({
        by: ["customerId"],
        where: {
          storeId,
          customerId: { in: pendingRequests.map((request) => request.customer.id) },
          bookingDate: { gte: bookingDateToday() },
          bookingStatus: { in: ["PENDING", "CONFIRMED"] },
        },
        _count: { _all: true },
      })
    : [];
  const futureCountByCustomer = new Map(futureCounts.map((row) => [row.customerId, row._count._all]));
  const reviewIssues = healthIssues.filter((issue) => issue.severity === "REVIEW");
  const blockedIssues = healthIssues.filter((issue) => issue.severity === "BLOCKED");

  return (
    <PageShell>
      <PageHeader
        title="中央會員資料健康檢查"
        subtitle="集中查看重複顧客、登入身分衝突與顧客提出的會員連結申請。"
        actions={<Link href="/dashboard" className="text-sm text-primary-700">← 回首頁</Link>}
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard label="待確認" value={reviewIssues.length + pendingRequests.length} tone="amber" />
        <SummaryCard label="阻擋中" value={blockedIssues.length} tone="red" />
        <SummaryCard label="已處理" value={handledRequests.length} tone="green" />
        <SummaryCard label="目前異常" value={healthIssues.length} tone="earth" />
      </div>

      {healthIssues.length === 0 && pendingRequests.length === 0 ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-800">
          目前沒有需要處理的中央會員資料，手機、LINE、Google 與中央身分檢查皆正常。
        </div>
      ) : null}

      {reviewIssues.length > 0 ? (
        <IssueSection title="待確認的重複顧客" description="僅列出同店、正規化後相同手機的顧客；仍需人工確認是否為同一人。" issues={reviewIssues} />
      ) : null}

      {blockedIssues.length > 0 ? (
        <IssueSection title="身分衝突（已阻擋）" description="系統不會自動覆蓋或改綁，請先確認本人身分再處理。" issues={blockedIssues} />
      ) : null}

      {pendingRequests.length > 0 ? (
        <section className="space-y-3">
          <div>
            <h2 className="text-base font-semibold text-earth-900">顧客提出的待處理申請</h2>
            <p className="mt-1 text-xs text-earth-500">審核非本人資料回報與解除門市連結申請。</p>
          </div>
          {pendingRequests.map((request) => {
            const remainingSessions = request.customer.planWallets.reduce((sum, wallet) => sum + wallet.remainingSessions, 0);
            const futureBookings = futureCountByCustomer.get(request.customer.id) ?? 0;
            const canApprove = request.type === "NOT_MY_MEMBERSHIP" || (remainingSessions === 0 && futureBookings === 0 && Boolean(request.identityLinkId));
            return (
              <section key={request.id} className="rounded-lg border border-earth-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-earth-900">{request.customer.name}｜{request.customer.phone}</p>
                    <p className="mt-1 text-xs text-earth-500">
                      {request.type === "NOT_MY_MEMBERSHIP" ? "非本人資料回報" : "解除門市連結"}・{formatTWTime(request.createdAt)}
                    </p>
                  </div>
                  <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs text-amber-800">待處理</span>
                </div>
                <div className="my-3 grid gap-2 rounded-md bg-earth-50 p-3 text-sm sm:grid-cols-2">
                  <p>有效方案剩餘：<strong>{remainingSessions} 堂</strong></p>
                  <p>未來有效預約：<strong>{futureBookings} 筆</strong></p>
                </div>
                <MemberLinkReviewForm requestId={request.id} type={request.type} canApprove={canApprove} />
                {request.type === "UNLINK_REQUEST" && !canApprove ? (
                  <p className="mt-2 text-xs text-amber-700">需先處理有效方案、剩餘堂數或未來預約；目前不會解除連結。</p>
                ) : null}
              </section>
            );
          })}
        </section>
      ) : null}

      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold text-earth-900">已處理紀錄</h2>
          <p className="mt-1 text-xs text-earth-500">保留顧客申請的審核結果與處理原因。</p>
        </div>
        {handledRequests.length === 0 ? (
          <div className="rounded-lg border border-earth-200 bg-white p-5 text-sm text-earth-500">目前沒有已處理紀錄。</div>
        ) : handledRequests.map((request) => (
          <div key={request.id} className="rounded-lg border border-earth-200 bg-white p-4 text-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-medium text-earth-900">{request.customer.name}｜{request.customer.phone}</p>
                <p className="mt-1 text-xs text-earth-500">{request.reviewNote ?? "未填寫處理原因"}</p>
              </div>
              <span className="rounded-full bg-earth-100 px-2.5 py-1 text-xs text-earth-700">{statusLabel[request.status]}</span>
            </div>
          </div>
        ))}
      </section>
    </PageShell>
  );
}

function SummaryCard({ label, value, tone }: { label: string; value: number; tone: "amber" | "red" | "green" | "earth" }) {
  const toneClass = {
    amber: "border-amber-200 bg-amber-50 text-amber-900",
    red: "border-red-200 bg-red-50 text-red-900",
    green: "border-emerald-200 bg-emerald-50 text-emerald-900",
    earth: "border-earth-200 bg-white text-earth-900",
  }[tone];
  return <div className={`rounded-lg border p-3 ${toneClass}`}><p className="text-xs opacity-70">{label}</p><p className="mt-1 text-xl font-semibold">{value}</p></div>;
}

function IssueSection({ title, description, issues }: { title: string; description: string; issues: CentralMemberHealthIssueView[] }) {
  return (
    <section className="space-y-3">
      <div><h2 className="text-base font-semibold text-earth-900">{title}</h2><p className="mt-1 text-xs text-earth-500">{description}</p></div>
      {issues.map((issue) => (
        <div key={issue.id} className={`rounded-lg border bg-white p-4 shadow-sm ${issue.severity === "BLOCKED" ? "border-red-200" : "border-amber-200"}`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-medium text-earth-900">{reasonLabel[issue.reason]}</p>
              <p className="mt-1 text-xs text-earth-500">{issue.customers.map((customer) => `${customer.name}｜${customer.phone}`).join("、") || "顧客連結資料不完整"}</p>
            </div>
            <span className={`rounded-full px-2.5 py-1 text-xs ${issue.severity === "BLOCKED" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"}`}>
              {categoryLabel[issue.category]}・{issue.severity === "BLOCKED" ? "已阻擋" : "待確認"}
            </span>
          </div>
          {issue.reason === "duplicate_phone" && issue.customerIds.length >= 2 ? (
            <div className="mt-3 flex justify-end">
              <Link href={`/dashboard/customers/merge?source=${issue.customerIds[0]}&target=${issue.customerIds[1]}`} className="rounded-md bg-primary-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-700">比較並安全處理</Link>
            </div>
          ) : (
            <p className="mt-3 rounded-md bg-red-50 p-2 text-xs text-red-700">為避免錯綁，系統不會自動修改；請由總管理者確認身分與稽核紀錄。</p>
          )}
        </div>
      ))}
    </section>
  );
}
