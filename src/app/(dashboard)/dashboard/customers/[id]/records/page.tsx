import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { getActiveStoreForRead } from "@/lib/store";
import { getStoreFilter } from "@/lib/manager-visibility";
import { resolveStoreViewContextFromCookie, storeIdForViewContext, userForViewContext } from "@/lib/store-view-context-server";
import { DashboardLink as Link } from "@/components/dashboard-link";
import { addTaiwanDuration, dayRange, formatTWTime, monthRange, toLocalDateStr, toLocalMonthStr } from "@/lib/date-utils";
import { formatBookingStatus, formatBookingType, formatPaymentMethod, formatTransactionStatus, formatTransactionType } from "@/lib/data-export-labels";
import { CustomerConsumptionFilters } from "./customer-consumption-filters";

type ConsumptionKind = "plan" | "retail" | "service" | "refund" | "other";
type ConsumptionPayment = "cash" | "transfer" | "card" | "other";
type ConsumptionRow = {
  id: string;
  date: Date;
  sortAt: Date;
  label: string;
  status: string;
  amount: number;
  payment: string;
  paymentKind: ConsumptionPayment;
  kind: ConsumptionKind;
  countInTotal: boolean;
};

const kindLabels: Record<ConsumptionKind, string> = {
  plan: "方案",
  retail: "零售",
  service: "單次服務",
  refund: "退款",
  other: "現場消費／其他",
};

const kindTone: Record<ConsumptionKind, string> = {
  plan: "bg-primary-50 text-primary-800",
  retail: "bg-gold-50 text-gold-800",
  service: "bg-sky-50 text-sky-800",
  refund: "bg-red-50 text-red-700",
  other: "bg-earth-100 text-earth-700",
};

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function validDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
    && !Number.isNaN(dayRange(value).start.getTime())
    && toLocalDateStr(dayRange(value).start) === value;
}

function transactionKind(type: string): ConsumptionKind {
  if (type === "PACKAGE_PURCHASE") return "plan";
  if (type === "SINGLE_PURCHASE" || type === "TRIAL_PURCHASE") return "service";
  if (type === "REFUND") return "refund";
  return "other";
}

function transactionPayment(method: string): ConsumptionPayment {
  if (method === "CASH") return "cash";
  if (method === "TRANSFER") return "transfer";
  if (method === "CREDIT_CARD" || method === "LINE_PAY") return "card";
  return "other";
}

function buildRecordsHref(base: string, query: Record<string, string>, page: number): string {
  const params = new URLSearchParams(query);
  params.set("type", "transactions");
  if (page > 1) params.set("page", String(page));
  else params.delete("page");
  return `${base}?${params.toString()}`;
}

export default async function CustomerRecordsPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  if (!user || !(await checkPermission(user.role, user.staffId, "customer.read"))) redirect("/dashboard");
  const { id } = await params;
  const rawQuery = await searchParams;
  const transactions = firstParam(rawQuery.type) === "transactions";
  if (!(await checkPermission(user.role, user.staffId, transactions ? "transaction.read" : "booking.read"))) redirect("/dashboard");
  const context = await resolveStoreViewContextFromCookie(user);
  const storeId = storeIdForViewContext(await getActiveStoreForRead(user), context);
  const customer = await prisma.customer.findFirst({
    where: { id, ...getStoreFilter(userForViewContext(user, context), storeId) },
    select: { id: true, name: true, storeId: true },
  });
  if (!customer || (storeId && customer.storeId !== storeId)) notFound();

  const base = `/dashboard/customers/${id}/records`;
  const baseWhere = { customerId: customer.id, storeId: customer.storeId };
  const requested = Number(firstParam(rawQuery.page));
  const requestedPage = Number.isSafeInteger(requested) && requested > 0 ? requested : 1;
  const take = 30;

  let total = 0;
  let pages = 1;
  let page = requestedPage;
  let bookings: Array<{ id: string; bookingDate: Date; slotTime: string; bookingType: string; bookingStatus: string; people: number }> = [];
  let payments: ConsumptionRow[] = [];
  let filteredAmount = 0;
  let typeOptions: Array<{ value: string; label: string }> = [];

  const today = toLocalDateStr();
  const rangeParam = firstParam(rawQuery.range);
  const range = ["month", "3m", "all", "custom"].includes(rangeParam) ? rangeParam : "3m";
  const customFrom = firstParam(rawQuery.from);
  const customTo = firstParam(rawQuery.to);
  let from = addTaiwanDuration(today, -3, "MONTH");
  let to = today;
  if (range === "month") {
    from = `${toLocalMonthStr()}-01`;
    to = toLocalDateStr(monthRange(toLocalMonthStr()).end);
  } else if (range === "custom") {
    from = validDate(customFrom) ? customFrom : from;
    to = validDate(customTo) ? customTo : today;
    if (from > to) [from, to] = [to, from];
  }

  const kindParam = firstParam(rawQuery.kind);
  const kind = (["plan", "retail", "service", "refund", "other"] as const).includes(kindParam as ConsumptionKind) ? kindParam as ConsumptionKind : "all";
  const paymentParam = firstParam(rawQuery.payment);
  const payment = (["cash", "transfer", "card", "other"] as const).includes(paymentParam as ConsumptionPayment) ? paymentParam as ConsumptionPayment : "all";
  const keyword = firstParam(rawQuery.q).trim().slice(0, 60);

  if (!transactions) {
    total = await prisma.booking.count({ where: baseWhere });
    pages = Math.max(1, Math.ceil(total / take));
    page = Math.min(requestedPage, pages);
    bookings = await prisma.booking.findMany({
      where: baseWhere,
      take,
      skip: (page - 1) * take,
      orderBy: [{ bookingDate: "desc" }, { slotTime: "desc" }, { id: "desc" }],
      select: { id: true, bookingDate: true, slotTime: true, bookingType: true, bookingStatus: true, people: true },
    });
  } else {
    const transactionDate = range === "all" ? undefined : { gte: dayRange(from).start, lte: dayRange(to).end };
    const cashbookDate = range === "all" ? undefined : { gte: new Date(`${from}T00:00:00.000Z`), lte: new Date(`${to}T00:00:00.000Z`) };
    const [system, manual] = await Promise.all([
      prisma.transaction.findMany({
        where: { ...baseWhere, ...(transactionDate ? { createdAt: transactionDate } : {}) },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: { id: true, createdAt: true, transactionType: true, status: true, paymentStatus: true, planNameSnapshot: true, note: true, amount: true, paymentMethod: true },
      }),
      prisma.cashbookEntry.findMany({
        where: { ...baseWhere, type: "INCOME", ...(cashbookDate ? { entryDate: cashbookDate } : {}) },
        orderBy: [{ entryDate: "desc" }, { createdAt: "desc" }, { id: "desc" }],
        select: { id: true, entryDate: true, createdAt: true, category: true, amount: true, paymentMethod: true, note: true },
      }),
    ]);
    const allPayments: ConsumptionRow[] = [
      ...system.map((item) => {
        const itemKind = transactionKind(item.transactionType);
        const status = item.paymentStatus === "PENDING" ? "待收款" : item.paymentStatus === "CONFIRMED" ? "已收款" : formatTransactionStatus(item.status);
        return {
          id: `transaction:${item.id}`,
          date: item.createdAt,
          sortAt: item.createdAt,
          label: item.planNameSnapshot || formatTransactionType(item.transactionType),
          status,
          amount: Number(item.amount),
          payment: formatPaymentMethod(item.paymentMethod),
          paymentKind: transactionPayment(item.paymentMethod),
          kind: itemKind,
          countInTotal: item.status !== "CANCELLED" && item.status !== "VOIDED" && item.paymentStatus !== "PENDING",
        };
      }),
      ...manual.map((item) => {
        const coursePlan = item.id.startsWith("course-purchase:");
        const retail = item.category?.startsWith("零售-") ?? false;
        const service = item.category?.includes("單次服務") ?? false;
        return {
          id: `cashbook:${item.id}`,
          date: item.entryDate,
          sortAt: item.createdAt,
          label: coursePlan ? item.note?.replace(/^線上購買：/, "").split(" / ")[0] || "課程方案" : item.category?.replace(/^零售-/, "") || "現場消費",
          status: "已收款",
          amount: Number(item.amount),
          payment: item.paymentMethod === "CASH" ? "現金" : "其他（轉帳／非現金）",
          paymentKind: item.paymentMethod === "CASH" ? "cash" as const : "other" as const,
          kind: coursePlan ? "plan" as const : retail ? "retail" as const : service ? "service" as const : "other" as const,
          countInTotal: true,
        };
      }),
    ].sort((a, b) => b.sortAt.getTime() - a.sortAt.getTime());

    const availableKinds = new Set(allPayments.map((item) => item.kind));
    if (kind !== "all") availableKinds.add(kind);
    typeOptions = (["plan", "retail", "service", "refund", "other"] as ConsumptionKind[])
      .filter((value) => availableKinds.has(value))
      .map((value) => ({ value, label: kindLabels[value] }));
    const normalizedKeyword = keyword.toLocaleLowerCase("zh-TW");
    const filtered = allPayments.filter((item) =>
      (kind === "all" || item.kind === kind)
      && (payment === "all" || item.paymentKind === payment)
      && (!normalizedKeyword || item.label.toLocaleLowerCase("zh-TW").includes(normalizedKeyword)),
    );
    total = filtered.length;
    filteredAmount = filtered.reduce((sum, item) => sum + (item.countInTotal ? item.amount : 0), 0);
    pages = Math.max(1, Math.ceil(total / take));
    page = Math.min(requestedPage, pages);
    payments = filtered.slice((page - 1) * take, page * take);
  }

  const hrefQuery: Record<string, string> = {};
  for (const key of ["range", "kind", "payment", "q", "from", "to"] as const) {
    const value = firstParam(rawQuery[key]);
    if (value) hrefQuery[key] = value;
  }

  return <main className="mx-auto max-w-4xl space-y-4 p-4 sm:space-y-5 sm:p-6">
    <Link href={`/dashboard/customers/${id}#bookings`} className="inline-flex min-h-11 items-center text-primary-700">← 返回顧客資料</Link>
    <header>
      <h1 className="text-2xl font-semibold text-earth-900">{customer.name}的{transactions ? "消費" : "預約"}紀錄</h1>
      <p className="mt-1 text-sm text-earth-500">僅顯示此顧客的資料</p>
    </header>
    <nav className="grid grid-cols-2 rounded-xl bg-earth-100 p-1" aria-label="顧客紀錄類型">
      <Link href={`${base}?type=bookings`} aria-current={!transactions ? "page" : undefined} className={`flex min-h-11 items-center justify-center rounded-lg px-3 text-sm font-semibold ${!transactions ? "bg-white text-primary-800 shadow-sm" : "text-earth-600"}`}>預約紀錄</Link>
      <Link href={`${base}?type=transactions`} aria-current={transactions ? "page" : undefined} className={`flex min-h-11 items-center justify-center rounded-lg px-3 text-sm font-semibold ${transactions ? "bg-white text-primary-800 shadow-sm" : "text-earth-600"}`}>消費紀錄</Link>
    </nav>

    {transactions && <CustomerConsumptionFilters key={`${range}:${kind}:${payment}:${keyword}:${from}:${to}`} initial={{ range, kind, payment, keyword, from, to }} typeOptions={typeOptions} />}

    {transactions ? <section className="rounded-xl border border-primary-100 bg-primary-50 px-4 py-3" aria-label="篩選結果摘要">
      <p className="text-sm text-primary-800">篩選結果</p>
      <div className="mt-1 flex flex-wrap items-baseline justify-between gap-2">
        <strong className="text-lg text-primary-900">共 {total} 筆</strong>
        <strong className="text-xl tabular-nums text-primary-900">合計 NT$ {filteredAmount.toLocaleString()}</strong>
      </div>
    </section> : <p className="text-earth-600">共 {total} 筆預約紀錄</p>}

    <div className="divide-y divide-earth-200 overflow-hidden rounded-xl border border-earth-200 bg-white">
      {bookings.map((booking) => <div key={booking.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div><p className="font-medium">{formatTWTime(booking.bookingDate, { dateOnly: true })}・{booking.slotTime}</p>
        <p className="mt-1 text-earth-600">{formatBookingType(booking.bookingType)}・{booking.people} 人・{formatBookingStatus(booking.bookingStatus)}</p></div>
        <Link href={`/dashboard/bookings/${booking.id}`} className="inline-flex min-h-11 items-center text-primary-700">查看預約 →</Link>
      </div>)}
      {payments.map((item) => <article key={item.id} className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-2 py-1 text-xs font-medium ${kindTone[item.kind]}`}>{kindLabels[item.kind]}</span>
              <strong className="break-words text-earth-900">{item.label}</strong>
            </div>
            <p className="mt-2 text-sm text-earth-500">{formatTWTime(item.date, { dateOnly: true })}・{item.payment}・{item.status}</p>
          </div>
          <strong className={`shrink-0 text-lg tabular-nums ${item.kind === "refund" ? "text-red-700" : "text-primary-800"}`}>NT$ {item.amount.toLocaleString()}</strong>
        </div>
      </article>)}
      {total === 0 && <div className="px-4 py-10 text-center"><p className="font-medium text-earth-800">目前沒有符合的紀錄</p><p className="mt-1 text-sm text-earth-500">可調整時間、類型或搜尋文字。</p></div>}
    </div>

    {pages > 1 && <nav className="flex items-center justify-between" aria-label="紀錄分頁">
      {page > 1 ? <Link href={transactions ? buildRecordsHref(base, hrefQuery, page - 1) : `${base}?type=bookings&page=${page - 1}`} className="min-h-11 py-2">上一頁</Link> : <span />}
      <span>第 {page} / {pages} 頁</span>
      {page < pages ? <Link href={transactions ? buildRecordsHref(base, hrefQuery, page + 1) : `${base}?type=bookings&page=${page + 1}`} className="min-h-11 py-2">下一頁</Link> : <span />}
    </nav>}
  </main>;
}
