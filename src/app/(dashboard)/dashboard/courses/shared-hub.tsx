import { CourseMonthPicker } from "./month-picker";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { getActiveStoreForRead } from "@/lib/store";
import { getStoreIndustryModule } from "@/lib/industry-module-server";
import { prisma } from "@/lib/db";
import { coursePrisma } from "@/lib/course-db";
import { monthRange, toLocalMonthStr } from "@/lib/date-utils";
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
    const [store] = await Promise.all([
      prisma.store.findUnique({
        where: { id: storeId },
        select: { name: true, slug: true },
      }),
    ]);
    body = (
      <>
        <section className={card}>
          <h2 className="text-sm font-medium text-earth-500">目前店家</h2>
          <p className="mt-2 text-xl font-semibold text-primary-900">
            {store?.name}
          </p>
          <p className="mt-1 text-sm text-earth-500">店家代碼：{store?.slug}</p>
          <p className="mt-3 text-xs text-earth-500">
            目前提供資訊核對；店家資料編輯尚未接入。
          </p>
        </section>
        <Pending>
          顧客預約／取消規則與課程通知仍待報名流程接通；這裡不套用蒸足的時段與扣堂設定。
        </Pending>
      </>
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
        select: { coachId: true, startsAt: true, endsAt: true },
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
    body = (
      <>
        <CourseMonthPicker month={month} />
        <p className="text-sm text-earth-600">
          {month} · 依台灣時間計算，排除已取消課程，包含本月尚未上課的排程。
        </p>
        <div className="grid grid-cols-3 overflow-hidden rounded-lg border border-earth-200 bg-white">
          {[
            ["已排課堂數", sessions.length, "堂"],
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
          報名人數、滿班率、出席率、熱門課程與實收營收尚無完整資料，暫不顯示。
        </Pending>
      </>
    );
  }
  return (
    <PageShell>
      <PageHeader title={title} subtitle={subtitle} />
      <div className="space-y-5">{body}</div>
    </PageShell>
  );
}
