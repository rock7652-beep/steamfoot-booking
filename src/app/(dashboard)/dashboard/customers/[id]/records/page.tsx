import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { getActiveStoreForRead } from "@/lib/store";
import { getStoreFilter } from "@/lib/manager-visibility";
import { resolveStoreViewContextFromCookie, storeIdForViewContext, userForViewContext } from "@/lib/store-view-context-server";
import { DashboardLink as Link } from "@/components/dashboard-link";
import { formatTWTime } from "@/lib/date-utils";
import { formatBookingStatus, formatBookingType, formatPaymentMethod, formatTransactionType, formatTransactionStatus } from "@/lib/data-export-labels";

export default async function CustomerRecordsPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ type?: string; page?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user || !(await checkPermission(user.role, user.staffId, "customer.read"))) redirect("/dashboard");
  const { id } = await params;
  const query = await searchParams;
  const transactions = query.type === "transactions";
  if (!(await checkPermission(user.role, user.staffId, transactions ? "transaction.read" : "booking.read"))) redirect("/dashboard");
  const context = await resolveStoreViewContextFromCookie(user);
  const storeId = storeIdForViewContext(await getActiveStoreForRead(user), context);
  const customer = await prisma.customer.findFirst({
    where: { id, ...getStoreFilter(userForViewContext(user, context), storeId) },
    select: { id: true, name: true, storeId: true },
  });
  if (!customer || (storeId && customer.storeId !== storeId)) notFound();
  const where = { customerId: customer.id, storeId: customer.storeId };
  const total = transactions ? await prisma.transaction.count({ where }) : await prisma.booking.count({ where });
  const pages = Math.max(1, Math.ceil(total / 30));
  const requested = Number(query.page);
  const page = Number.isSafeInteger(requested) && requested > 0 ? Math.min(requested, pages) : 1;
  const take = 30, skip = (page - 1) * take;
  const bookings = transactions ? [] : await prisma.booking.findMany({
    where, take, skip, orderBy: [{ bookingDate: "desc" }, { slotTime: "desc" }, { id: "desc" }],
    select: { id: true, bookingDate: true, slotTime: true, bookingType: true, bookingStatus: true, people: true },
  });
  const payments = transactions ? await prisma.transaction.findMany({
    where, take, skip, orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { id: true, createdAt: true, transactionType: true, status: true, amount: true, paymentMethod: true },
  }) : [];
  const base = `/dashboard/customers/${id}/records`;
  const type = transactions ? "transactions" : "bookings";
  return <main className="mx-auto max-w-4xl space-y-5 p-4 sm:p-6">
    <Link href={`/dashboard/customers/${id}#bookings`} className="inline-flex min-h-11 items-center text-primary-700">← 返回顧客資料</Link>
    <h1 className="text-2xl font-semibold text-earth-900">{customer.name}的{transactions ? "消費" : "預約"}紀錄</h1>
    <nav className="flex gap-4">
      <Link href={`${base}?type=bookings`} aria-current={!transactions ? "page" : undefined} className="min-h-11 py-2 text-primary-700">預約紀錄</Link>
      <Link href={`${base}?type=transactions`} aria-current={transactions ? "page" : undefined} className="min-h-11 py-2 text-primary-700">消費紀錄</Link>
    </nav>
    <p className="text-earth-600">僅顯示此顧客・共 {total} 筆</p>
    <div className="divide-y divide-earth-200 rounded-lg border border-earth-200 bg-white">
      {bookings.map(b => <div key={b.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div><p className="font-medium">{formatTWTime(b.bookingDate, { dateOnly: true })}・{b.slotTime}</p>
        <p className="mt-1 text-earth-600">{formatBookingType(b.bookingType)}・{b.people} 人・{formatBookingStatus(b.bookingStatus)}</p></div>
        <Link href={`/dashboard/bookings/${b.id}`} className="inline-flex min-h-11 items-center text-primary-700">查看預約 →</Link>
      </div>)}
      {payments.map(t => <div key={t.id} className="flex flex-wrap justify-between gap-3 p-4">
        <div><p>{formatTWTime(t.createdAt, { dateOnly: true })}・{formatTransactionType(t.transactionType)}</p>
        <p className="mt-1 text-earth-600">{formatPaymentMethod(t.paymentMethod)}・{formatTransactionStatus(t.status)}</p></div>
        <p className="font-medium tabular-nums">NT$ {Number(t.amount).toLocaleString()}</p>
      </div>)}
      {total === 0 && <p className="p-4 text-earth-600">目前沒有紀錄</p>}
    </div>
    <nav className="flex items-center justify-between">
      {page > 1 ? <Link href={`${base}?type=${type}&page=${page - 1}`} className="min-h-11 py-2">上一頁</Link> : <span />}
      <span>第 {page} / {pages} 頁</span>
      {page < pages ? <Link href={`${base}?type=${type}&page=${page + 1}`} className="min-h-11 py-2">下一頁</Link> : <span />}
    </nav>
  </main>;
}
