import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { toLocalDateStr } from "@/lib/date-utils";
import { redirect } from "next/navigation";
import { getDutyByWeek } from "@/server/queries/duty";
import { DutyWeekView } from "./duty-week-view";

interface PageProps {
  searchParams: Promise<{ week?: string }>;
}

/** 取得某日所在週的週一日期 */
function getMonday(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00Z");
  const day = d.getUTCDay(); // 0=Sun, 1=Mon...
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

export default async function DutyPage({ searchParams }: PageProps) {
  const user = await getCurrentUser();
  if (!user || !(await checkPermission(user.role, user.staffId, "duty.read"))) {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const todayStr = toLocalDateStr();
  const weekStart = params.week ?? getMonday(todayStr);

  const assignments = await getDutyByWeek(weekStart);

  // 取營業時間（用於顯示各天時段）
  const { prisma } = await import("@/lib/db");
  const [businessHours, specialDays] = await Promise.all([
    prisma.businessHours.findMany(),
    prisma.specialBusinessDay.findMany({
      where: {
        date: {
          gte: new Date(weekStart + "T00:00:00Z"),
          lte: new Date(new Date(weekStart + "T00:00:00Z").getTime() + 6 * 86400000),
        },
      },
    }),
  ]);

  const canManage = user.role === "OWNER" || await checkPermission(user.role, user.staffId, "duty.manage");

  const { isDutySchedulingEnabled } = await import("@/lib/shop-config");
  const dutyEnabled = await isDutySchedulingEnabled();

  return (
    <div className="mx-auto max-w-6xl">
      {/* 值班排班聯動狀態提示 */}
      <div className="mb-4 flex items-center gap-2">
        {dutyEnabled ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-50 px-3 py-1 text-xs font-medium text-primary-700">
            <span className="h-1.5 w-1.5 rounded-full bg-primary-500" />
            排班聯動已啟用
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-earth-100 px-3 py-1 text-xs font-medium text-earth-500">
            <span className="h-1.5 w-1.5 rounded-full bg-earth-400" />
            排班聯動未啟用（值班僅供參考）
          </span>
        )}
        {user.role === "OWNER" && (
          <a
            href="/dashboard/settings/duty"
            className="text-xs text-primary-600 hover:text-primary-800 hover:underline"
          >
            設定
          </a>
        )}
      </div>
      <DutyWeekView
        weekStart={weekStart}
        assignments={assignments.map((a) => ({
          id: a.id,
          date: a.date.toISOString().slice(0, 10),
          slotTime: a.slotTime,
          staffId: a.staffId,
          staffName: a.staff.displayName,
          staffColor: a.staff.colorCode,
          dutyRole: a.dutyRole,
          participationType: a.participationType,
        }))}
        businessHours={businessHours.map((bh) => ({
          dayOfWeek: bh.dayOfWeek,
          isOpen: bh.isOpen,
          openTime: bh.openTime,
          closeTime: bh.closeTime,
          slotInterval: bh.slotInterval,
          defaultCapacity: bh.defaultCapacity,
        }))}
        specialDays={specialDays.map((sd) => ({
          date: sd.date.toISOString().slice(0, 10),
          type: sd.type,
          reason: sd.reason,
          openTime: sd.openTime,
          closeTime: sd.closeTime,
          slotInterval: sd.slotInterval,
          defaultCapacity: sd.defaultCapacity,
        }))}
        canManage={canManage}
      />
    </div>
  );
}
