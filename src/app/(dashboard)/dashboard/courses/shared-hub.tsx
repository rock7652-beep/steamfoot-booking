import { TrendChart } from "../ops/trend-chart";
import { CourseSettingsEditor } from "./settings-editor";
import { CourseMonthPicker } from "./month-picker";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { getActiveStoreForRead } from "@/lib/store";
import { getStoreIndustryModule } from "@/lib/industry-module-server";
import { prisma } from "@/lib/db";
import { coursePrisma } from "@/lib/course-db";
import { monthRange, toLocalMonthStr, toLocalDateStr } from "@/lib/date-utils";
import { PageShell, PageHeader } from "@/components/desktop";
import { FEATURES } from "@/lib/feature-flags";
import { hasCurrentStoreFeature } from "@/lib/feature-gate";

export type CourseHubView = "settings" | "operations" | "analytics";
const card = "rounded-lg border border-earth-200 bg-white p-4";
function Pending({ children }: { children: React.ReactNode }) {
  return (
    <details className="rounded-lg border border-earth-200 bg-earth-50 p-3">
      <summary className="cursor-pointer text-sm font-medium text-earth-700">
        目前功能與資料範圍
      </summary>
      <p className="mt-2 text-sm leading-relaxed text-earth-500">{children}</p>
    </details>
  );
}
export async function CourseSharedHub({
  view,
  month: requestedMonth,
}: {
  view: CourseHubView;
  month?: string;
}) {
  const user = await getCurrentUser();
  if (!user) notFound();
  const permission =
    view === "analytics"
      ? "report.read"
      : view === "operations"
        ? "cashbook.read"
        : "booking.read";
  if (!(await checkPermission(user.role, user.staffId, permission))) notFound();
  if (view === "settings" && !["ADMIN", "OWNER", "PARTNER"].includes(user.role))
    notFound();
  const storeId = await getActiveStoreForRead(user);
  if (!storeId || (await getStoreIndustryModule(storeId)) !== "course")
    notFound();
  if (view === "operations") redirect("/dashboard/cashbook");
  const title = view === "settings" ? "設定" : "分析";
  const subtitle =
    view === "settings" ? "店家基本資訊" : "以已排定的課程資料了解排課狀況";
  let body: React.ReactNode;
  if (view === "settings") {
    const [store, rule, canEdit, config] = await Promise.all([
      prisma.store.findUnique({
        where: { id: storeId },
        select: { name: true },
      }),
      coursePrisma.courseBookingRule.findUnique({ where: { storeId } }),
      checkPermission(user.role, user.staffId, "business_hours.manage"),
      prisma.shopConfig.findUnique({ where: { storeId }, select: { address: true, mapUrl: true, lineOfficialUrl: true, bankName: true, bankCode: true, bankAccountNumber: true } }),
    ]);
    body = (
      <CourseSettingsEditor
        name={store?.name ?? ""}
        bankName={config?.bankName??""} bankCode={config?.bankCode??""} bankAccountNumber={config?.bankAccountNumber??""}
        address={config?.address ?? ""} mapUrl={config?.mapUrl ?? ""} lineOfficialUrl={config?.lineOfficialUrl ?? ""}
        bookingLeadMinutes={rule?.bookingLeadMinutes ?? 0}
        cancellationLeadMinutes={rule?.cancellationLeadMinutes ?? 0}
        canEdit={canEdit}
      />
    );
  } else if (!(await hasCurrentStoreFeature(FEATURES.BASIC_REPORTS))) {
    body = (
      <section className={card}>
        <h2 className="text-lg font-semibold text-primary-900">
          目前方案尚未開通分析
        </h2>
        <p className="mt-2 text-sm text-earth-500">
          目前付費方案未包含分析；課程體驗版可使用此功能。
        </p>
        <p className="mt-4 text-sm text-earth-600">
          開通後提供本月排課堂數、排定授課時數與教練排課量；不含尚未接通的報名及出席數據。
        </p>
      </section>
    );
  } else {
    const month =
        requestedMonth && /^\d{4}-(0[1-9]|1[0-2])$/.test(requestedMonth)
          ? requestedMonth
          : toLocalMonthStr(),
      bounds = monthRange(month);
    const [sessions, staff] = await Promise.all([
      coursePrisma.courseSession.findMany({
        where: {
          storeId,
          cancelledAt: null,
          startsAt: { gte: bounds.start, lte: bounds.end },
        },
        select: {
          coachId: true,
          startsAt: true,
          endsAt: true,
          bookings: { select: { status: true, customerId: true, checkedInAt: true, pointCost: true } },
        },
      }),
      prisma.staff.findMany({
        where: { storeId },
        select: { id: true, displayName: true },
      }),
    ]);
    const minutes = sessions.reduce(
      (sum, s) => sum + (s.endsAt.getTime() - s.startsAt.getTime()) / 60000,
      0,
    );
    const counts = new Map<string, number>();
    for (const s of sessions)
      counts.set(s.coachId, (counts.get(s.coachId) ?? 0) + 1);
    const canReadCash = await checkPermission(user.role, user.staffId, "cashbook.read");
    const cash = canReadCash ? await prisma.cashbookEntry.findMany({ where: { storeId, entryDate: { gte: new Date(`${month}-01T00:00:00Z`), lt: new Date(`${toLocalDateStr(new Date(bounds.end.getTime() + 1))}T00:00:00Z`) } }, select: { type: true, amount: true } }) : [];
    const income = cash.filter((c) => c.type === "INCOME").reduce((n,c) => n+Number(c.amount),0);
    const expense = cash.filter((c) => c.type === "EXPENSE").reduce((n,c) => n+Number(c.amount),0);
    const dayKeys = [...new Set(sessions.map((s) => toLocalDateStr(s.startsAt)))].sort();
    const daily = dayKeys.map((date) => {
      const rows = sessions.filter((s) => toLocalDateStr(s.startsAt) === date).flatMap((s) => s.bookings);
      return { date, bookingCount: rows.filter((b) => b.status !== "CANCELLED").length, arrivedCount: rows.filter((b) => b.status === "ATTENDED").length, revenue: 0, newCustomerCount: 0, returningCustomerCount: 0 };
    });
    body = (
      <>
        <CourseMonthPicker month={month} />
        <p className="text-sm text-earth-600">
          {month} · 依台灣時間計算，排除已取消課程，包含本月尚未上課的排程。
        </p>
        <div className="grid grid-cols-3 overflow-hidden rounded-lg border border-earth-200 bg-white">
          {[
            ["已排課堂數", sessions.length, "堂"],
            ["學員人數（去重）", new Set(sessions.flatMap((s) => s.bookings).filter((b) => b.status !== "CANCELLED").map((b) => b.customerId)).size, "人"],
            ["報到待完成", sessions.flatMap((s) => s.bookings).filter((b) => b.status === "RESERVED" && b.checkedInAt).length, "人次"],
            ["未到", sessions.flatMap((s) => s.bookings).filter((b) => b.status === "NO_SHOW").length, "人次"],
            ["完成扣點", sessions.flatMap((s) => s.bookings).filter((b) => b.status === "ATTENDED").reduce((n,b) => n+b.pointCost,0), "點"],
            [
              "預約參與人次",
              sessions
                .flatMap((s) => s.bookings)
                .filter((b) => b.status !== "CANCELLED").length,
              "人次",
            ],
            [
              "已完成人次",
              sessions
                .flatMap((s) => s.bookings)
                .filter((b) => b.status === "ATTENDED").length,
              "人次",
            ],
            ["排定授課時數", Math.round((minutes / 60) * 10) / 10, "小時"],
            ["排課教練", counts.size, "位"],
          ].map(([label, value, unit]) => (
            <section
              key={String(label)}
              className="flex items-center justify-between border-b border-earth-100 px-4 py-3"
            >
              <h2 className="text-sm text-earth-600">{label}</h2>
              <p className="text-lg font-semibold tabular-nums text-primary-900">
                {value}
                <span className="ml-2 text-sm font-normal text-earth-500">
                  {unit}
                </span>
              </p>
            </section>
          ))}
        </div>
        {canReadCash && <section className={card}><h2 className="font-semibold text-primary-900">本月實際收支</h2><p className="mt-2 text-sm">收入 NT$ {income.toLocaleString()} · 支出 NT$ {expense.toLocaleString()} · 淨收支 NT$ {(income-expense).toLocaleString()}</p><p className="mt-1 text-xs text-earth-500">依營運收支明細的記帳日期計算；指派點數本身不代表已收款。</p></section>}
        <section className={card}><h2 className="mb-3 font-semibold text-primary-900">每日參與與完成</h2>{daily.length ? <TrendChart data={daily} metric="bookings" bookingLabels={{ booked: "參與人次", arrived: "完成人次" }} /> : <p className="text-sm">本月尚無課程。</p>}</section>
        <section className={card}>
          <h2 className="font-semibold text-primary-900">教練排課量</h2>
          {counts.size ? (
            <ul className="mt-4 divide-y divide-earth-100">
              {[...counts]
                .sort((a, b) => b[1] - a[1])
                .map(([id, count]) => (
                  <li
                    key={id}
                    className="flex justify-between gap-4 py-3 text-sm"
                  >
                    <span>
                      {staff.find((s) => s.id === id)?.displayName ??
                        "已移除的人員"}
                    </span>
                    <span className="font-medium tabular-nums">{count} 堂</span>
                  </li>
                ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-earth-500">本月尚未排課。</p>
          )}
        </section>
        <Pending>
          依課程日期歸月，取消不計入參與。人數以實際上課者去重；同一人參加兩堂為一人、兩人次。報到仍占用點數，完成才扣點；未到不扣點。
        </Pending>
      </>
    );
  }
  return (
    <PageShell className="course-workspace mx-auto flex max-w-[1440px] flex-col gap-4 px-6 py-6">
      <PageHeader title={title} subtitle={subtitle} />
      <div className="space-y-5">{body}</div>
    </PageShell>
  );
}
