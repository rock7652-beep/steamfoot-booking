import { createBooking } from "@/server/actions/booking";
import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { toLocalDateStr } from "@/lib/date-utils";
import { DashboardLink as Link } from "@/components/dashboard-link";
import { redirect } from "next/navigation";
import CustomerSearch from "./customer-search";
import { DashboardBookingForm } from "./booking-form";
import { FormErrorToast } from "@/components/form-error-toast";
import { SubmitButton } from "@/components/submit-button";
import {
  PageShell,
  PageHeader,
  FormShell,
  FormSection,
  StickyFormActions,
} from "@/components/desktop";

function getNextDays(n: number): string[] {
  const days: string[] = [];
  const today = toLocalDateStr();
  const [y, m, d] = today.split("-").map(Number);
  for (let i = 0; i < n; i++) {
    const date = new Date(Date.UTC(y, m - 1, d + i));
    days.push(date.toISOString().slice(0, 10));
  }
  return days;
}

interface PageProps {
  searchParams: Promise<{ date?: string }>;
}

const inputCls =
  "block w-full rounded-lg border border-earth-300 bg-white px-3 py-2 text-sm text-earth-800 placeholder:text-earth-400 focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400";
const labelCls = "block text-sm font-medium text-earth-700";

export default async function NewBookingPage({ searchParams }: PageProps) {
  const user = await getCurrentUser();
  if (!user || !(await checkPermission(user.role, user.staffId, "booking.create"))) {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const todayStr = toLocalDateStr();
  const defaultDate = params.date ?? todayStr;
  const days = getNextDays(14);
  const isOwner = user.role === "ADMIN";

  async function handleCreate(formData: FormData) {
    "use server";
    const customerId = formData.get("customerId") as string;
    const bookingDate = formData.get("bookingDate") as string;
    const slotTime = formData.get("slotTime") as string;
    const bookingType = formData.get("bookingType") as
      | "FIRST_TRIAL"
      | "SINGLE"
      | "PACKAGE_SESSION";
    const people = Number(formData.get("people")) || 1;
    const notes = (formData.get("notes") as string) || undefined;
    const skipDutyCheck = formData.get("skipDutyCheck") === "on";

    if (!customerId) {
      redirect(
        `/dashboard/bookings/new?date=${bookingDate}&error=${encodeURIComponent("請選擇顧客")}`,
      );
    }

    const result = await createBooking({
      customerId,
      bookingDate,
      slotTime,
      bookingType,
      people,
      notes,
      skipDutyCheck: skipDutyCheck || undefined,
    });

    if (!result.success) {
      redirect(
        `/dashboard/bookings/new?date=${bookingDate}&error=${encodeURIComponent(result.error || "預約建立失敗")}`,
      );
    }

    redirect(
      `/dashboard/bookings?view=day&date=${bookingDate}&saved=${encodeURIComponent("已建立預約")}`,
    );
  }

  return (
    <PageShell>
      <FormErrorToast />

      <PageHeader
        title="新增預約"
        subtitle="左側選時段、右側選顧客與方案，確認後建立"
        actions={
          <Link
            href="/dashboard/bookings"
            className="rounded-lg border border-earth-200 px-3 py-1.5 text-xs font-medium text-earth-600 hover:bg-earth-50"
          >
            ← 預約總覽
          </Link>
        }
      />

      <FormShell width="lg">
        <form action={handleCreate} className="space-y-6 pb-4">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {/* 左欄：預約資訊 */}
            <div className="space-y-6">
              <FormSection title="預約資訊" description="日期、時段與人數">
                <DashboardBookingForm
                  days={days}
                  defaultDate={defaultDate}
                  todayStr={todayStr}
                />
                <div>
                  <label className={labelCls}>預約人數</label>
                  <select
                    name="people"
                    defaultValue="1"
                    className={`mt-1 ${inputCls}`}
                  >
                    <option value="1">1 人</option>
                    <option value="2">2 人</option>
                    <option value="3">3 人</option>
                    <option value="4">4 人</option>
                  </select>
                </div>
              </FormSection>
            </div>

            {/* 右欄：顧客 / 方案 */}
            <div className="space-y-6">
              <FormSection title="顧客資訊" description="輸入姓名、電話或 Email 搜尋">
                <div>
                  <label className={labelCls}>
                    顧客 <span className="text-red-500">*</span>
                  </label>
                  <div className="mt-1">
                    <CustomerSearch />
                  </div>
                </div>
              </FormSection>

              <FormSection title="服務 / 方案">
                <div>
                  <label className={labelCls}>
                    預約類型 <span className="text-red-500">*</span>
                  </label>
                  <select
                    name="bookingType"
                    required
                    className={`mt-1 ${inputCls}`}
                  >
                    <option value="PACKAGE_SESSION">課程堂數</option>
                    <option value="FIRST_TRIAL">體驗</option>
                    <option value="SINGLE">單次</option>
                  </select>
                </div>
              </FormSection>
            </div>
          </div>

          {/* 備註 — 滿版 */}
          <FormSection title="備註 / 其他">
            <textarea
              name="notes"
              rows={3}
              className={inputCls}
              placeholder="特殊需求、備忘事項...（選填）"
            />

            {isOwner ? (
              <label className="flex items-center gap-2 pt-1 text-sm text-earth-600">
                <input
                  type="checkbox"
                  name="skipDutyCheck"
                  className="h-4 w-4 rounded border-earth-300 text-primary-600 focus:ring-primary-500"
                />
                略過值班檢查（該時段無值班人員時仍可建立預約）
              </label>
            ) : null}
          </FormSection>

          <StickyFormActions
            info={<span>成功後會回到預約當日總覽</span>}
          >
            <Link
              href={`/dashboard/bookings?view=day&date=${defaultDate}`}
              className="rounded-lg border border-earth-300 bg-white px-4 py-2 text-sm font-medium text-earth-700 hover:bg-earth-50"
            >
              取消
            </Link>
            <SubmitButton
              label="確認建立"
              pendingLabel="建立中..."
              className="bg-primary-600 text-white hover:bg-primary-700"
            />
          </StickyFormActions>
        </form>
      </FormShell>
    </PageShell>
  );
}
