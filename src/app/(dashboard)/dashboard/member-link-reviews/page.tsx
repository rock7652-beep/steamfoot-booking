import { redirect } from "next/navigation";
import { DashboardLink as Link } from "@/components/dashboard-link";
import { PageHeader, PageShell } from "@/components/desktop";
import { bookingDateToday, formatTWTime } from "@/lib/date-utils";
import { checkPermission } from "@/lib/permissions";
import { getCurrentUser } from "@/lib/session";
import { getActiveStoreForRead } from "@/lib/store";
import { prisma } from "@/lib/db";
import { getCentralMemberLinkReviewRequests } from "@/server/queries/central-member-link-review";
import { MemberLinkReviewForm } from "./review-form";

const statusLabel = { PENDING: "待處理", APPROVED: "已核准", REJECTED: "已拒絕", CANCELLED: "已取消" };

export default async function MemberLinkReviewsPage() {
  const user = await getCurrentUser();
  if (!user || !(await checkPermission(user.role, user.staffId, "customer.identity.rebind"))) redirect("/dashboard");
  const storeId = await getActiveStoreForRead(user);
  if (!storeId) redirect("/dashboard");

  const requests = await getCentralMemberLinkReviewRequests(storeId);
  const pendingIds = requests.filter((request) => request.status === "PENDING").map((request) => request.id);
  const futureCounts = pendingIds.length
    ? await prisma.booking.groupBy({
        by: ["customerId"],
        where: {
          storeId,
          customerId: { in: requests.map((request) => request.customer.id) },
          bookingDate: { gte: bookingDateToday() },
          bookingStatus: { in: ["PENDING", "CONFIRMED"] },
        },
        _count: { _all: true },
      })
    : [];
  const futureCountByCustomer = new Map(futureCounts.map((row) => [row.customerId, row._count._all]));

  return (
    <PageShell>
      <PageHeader
        title="會員連結申請"
        subtitle="審核非本人資料回報與解除門市連結申請"
        actions={<Link href="/dashboard" className="text-sm text-primary-700">← 回首頁</Link>}
      />
      <div className="space-y-3">
        {requests.length === 0 ? (
          <div className="rounded-lg border border-earth-200 bg-white p-6 text-sm text-earth-500">目前沒有會員連結申請。</div>
        ) : requests.map((request) => {
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
                <span className="rounded-full bg-earth-100 px-2.5 py-1 text-xs text-earth-700">{statusLabel[request.status]}</span>
              </div>
              <div className="my-3 grid gap-2 rounded-md bg-earth-50 p-3 text-sm sm:grid-cols-2">
                <p>有效方案剩餘：<strong>{remainingSessions} 堂</strong></p>
                <p>未來有效預約：<strong>{futureBookings} 筆</strong></p>
              </div>
              {request.status === "PENDING" ? (
                <MemberLinkReviewForm requestId={request.id} type={request.type} canApprove={canApprove} />
              ) : (
                <p className="text-xs text-earth-500">{request.reviewNote ?? "未填寫處理原因"}</p>
              )}
              {request.type === "UNLINK_REQUEST" && !canApprove && request.status === "PENDING" ? (
                <p className="mt-2 text-xs text-amber-700">需先處理有效方案、剩餘堂數或未來預約；目前不會解除連結。</p>
              ) : null}
            </section>
          );
        })}
      </div>
    </PageShell>
  );
}
