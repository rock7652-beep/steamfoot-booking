import { createBooking } from "@/server/actions/booking";
import { fetchDaySlots } from "@/server/actions/slots";
import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { enumerateBookableDates } from "@/lib/bookable-window";
import { toLocalDateStr } from "@/lib/date-utils";
import { resolveBookableUntilDate } from "@/lib/shop-config";
import { getActiveStoreForRead } from "@/lib/store";
import { assertSpaDemoStoreIdentity, SPA_DEMO_STORE } from "@/lib/spa-demo-store";
import { getStoreFilter } from "@/lib/manager-visibility";
import { resolveStoreViewContextFromCookie } from "@/lib/store-view-context-server";
import { DashboardLink as Link } from "@/components/dashboard-link";
import { redirect } from "next/navigation";
import { CustomerAndPlanFields } from "./customer-and-plan-fields";
import { DashboardBookingForm } from "./booking-form";
import { FormErrorToast } from "@/components/form-error-toast";
import { SubmitButton } from "@/components/submit-button";
import { BookingRequestKeyField } from "@/components/booking-request-key-field";
import { BookingCreateForm } from "./booking-create-form";
import { SpaBookingFields } from "./spa-booking-fields";
import {
  PageShell,
  PageHeader,
  FormShell,
  FormSection,
  StickyFormActions,
} from "@/components/desktop";
import { isSpaOperationalSchemaReady } from "@/lib/spa-schema-readiness";
import { findSpaDemoCatalogItem, SPA_DEMO_CATALOG } from "@/lib/spa-demo-catalog";

interface PageProps {
  searchParams: Promise<{
    date?: string;
    mode?: string;
    customerId?: string;
    slotTime?: string;
    serviceStaffId?: string;
  }>;
}

const inputCls =
  "block w-full rounded-lg border border-earth-300 bg-white px-3 py-2 text-sm text-earth-800 placeholder:text-earth-400 focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400";

export default async function NewBookingPage({ searchParams }: PageProps) {
  const user = await getCurrentUser();
  if (!user || !(await checkPermission(user.role, user.staffId, "booking.create"))) {
    redirect("/dashboard");
  }
  const storeViewContext = await resolveStoreViewContextFromCookie(user);
  if (storeViewContext?.isViewMode) {
    redirect("/dashboard/bookings");
  }

  const params = await searchParams;
  const todayStr = toLocalDateStr();
  const defaultDate = params.date ?? todayStr;
  const activeStoreId = await getActiveStoreForRead(user);
  const isSpaDemoStore = activeStoreId === SPA_DEMO_STORE.id;
  const spaSchemaReady = isSpaDemoStore ? await isSpaOperationalSchemaReady() : false;
  const requestedSlotTime = /^\d{2}:\d{2}$/.test(params.slotTime ?? "")
    ? params.slotTime
    : undefined;
  const [spaIdentity, defaultServiceStaff, spaTreatments, defaultCustomer, shopConfig] =
    await Promise.all([
      isSpaDemoStore
        ? prisma.store.findUnique({
            where: { id: SPA_DEMO_STORE.id },
            select: { id: true, slug: true, isDemo: true },
          })
        : Promise.resolve(null),
      isSpaDemoStore && params.serviceStaffId
        ? prisma.staff.findFirst({
            where: {
              id: params.serviceStaffId,
              storeId: SPA_DEMO_STORE.id,
              status: "ACTIVE",
              isOwner: false,
            },
            select: { id: true, displayName: true, colorCode: true },
          })
        : Promise.resolve(null),
      isSpaDemoStore && spaSchemaReady
        ? prisma.treatment.findMany({
            where: {
              storeId: SPA_DEMO_STORE.id,
              isActive: true,
              id: { in: SPA_DEMO_CATALOG.map((item) => item.id) },
            },
            select: {
              id: true,
              name: true,
              variantLabel: true,
              price: true,
              serviceMinutes: true,
              bufferMinutes: true,
            },
            orderBy: [{ sortOrder: "asc" }, { name: "asc" }, { serviceMinutes: "asc" }],
          })
        : Promise.resolve([]),
      params.customerId
        ? prisma.customer.findFirst({
            where: {
              id: params.customerId,
              ...getStoreFilter(user, activeStoreId),
            },
            select: { id: true, name: true, phone: true, email: true },
          })
        : Promise.resolve(null),
      activeStoreId
        ? prisma.shopConfig.findUnique({
            where: { storeId: activeStoreId },
            select: { bookableUntilDate: true },
          })
        : Promise.resolve(null),
    ]);
  if (isSpaDemoStore) assertSpaDemoStoreIdentity(spaIdentity);
  const lockSpaSchedule = !!defaultServiceStaff && !!requestedSlotTime;
  const bookableUntil = resolveBookableUntilDate(shopConfig?.bookableUntilDate);
  const days = enumerateBookableDates(todayStr, bookableUntil);
  const isOwner = user.role === "ADMIN";
  // 從「新增補課」入口進來 → 預設選補課（顧客有有效補課券時）。
  const defaultMode = params.mode === "makeup" ? "makeup" : undefined;

  // 效能：SSR 預載「初始日期」的時段，讓第一屏就有時段，避免 client mount 後才
  // fetchDaySlots 的二次往返（店長感受到的「頁面到了、時段還要再等一下」）。
  // 過去日期不預載（表單會擋）；查詢失敗 → undefined，client fallback 維持原行為。
  const initialSlotDate = days.includes(defaultDate) ? defaultDate : days[0];
  let initialSlots: Awaited<ReturnType<typeof fetchDaySlots>>["slots"] | undefined;
  if (!isSpaDemoStore && !lockSpaSchedule && initialSlotDate && initialSlotDate >= todayStr) {
    try {
      initialSlots = (await fetchDaySlots(initialSlotDate)).slots;
    } catch {
      initialSlots = undefined;
    }
  }

  async function handleCreate(formData: FormData) {
    "use server";
    const customerId = formData.get("customerId") as string;
    const bookingDate = formData.get("bookingDate") as string;
    const slotTime = formData.get("slotTime") as string;
    const bookingType = formData.get("bookingType") as
      | "FIRST_TRIAL"
      | "SINGLE"
      | "PACKAGE_SESSION";
    const customerPlanWalletId =
      (formData.get("customerPlanWalletId") as string) || undefined;
    const servicePlanId =
      (formData.get("servicePlanId") as string) || undefined;
    const people = Number(formData.get("people")) || 1;
    const notes = (formData.get("notes") as string) || undefined;
    const skipDutyCheck = formData.get("skipDutyCheck") === "on";
    // 補課優先：資料結構 = bookingType=PACKAGE_SESSION + isMakeup=true。
    // 若補課券不足以覆蓋人數，createBooking 會用補課券抵一部分，剩餘人數
    // 使用 customerPlanWalletId 指定/FEFO 自選的方案堂數。
    const isMakeup = formData.get("isMakeup") === "on";
    const requestKey = (formData.get("requestKey") as string) || undefined;
    const serviceStaffId =
      (formData.get("serviceStaffId") as string) || undefined;
    const treatmentIds = formData
      .getAll("treatmentIds")
      .map((value) => String(value))
      .filter(Boolean);

    if (!customerId) {
      redirect(
        `/dashboard/bookings/new?date=${bookingDate}&error=${encodeURIComponent("請選擇顧客")}`,
      );
    }

    const bookingInput = {
      customerId,
      bookingDate,
      slotTime,
      bookingType: isMakeup ? "PACKAGE_SESSION" : bookingType,
      people,
      notes,
      skipDutyCheck: skipDutyCheck || undefined,
      customerPlanWalletId,
      servicePlanId,
      serviceStaffId,
      treatmentIds: treatmentIds.length > 0 ? treatmentIds : undefined,
      ...(isMakeup ? { isMakeup: true as const } : {}),
    };
    const result = requestKey
      ? await createBooking(bookingInput, {
          requestKey,
          source: "staff-booking",
          assignedStaffId: serviceStaffId ?? null,
        })
      : await createBooking(bookingInput);

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
        subtitle={
          isSpaDemoStore
            ? "先確認日期與服務，再直接選可用時段；顧客資料最後填"
            : "左側選時段、右側選顧客與方案，確認後建立"
        }
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
        <BookingCreateForm action={handleCreate}>
          <BookingRequestKeyField />
          <div className={isSpaDemoStore ? "space-y-6" : "grid grid-cols-1 gap-6 md:grid-cols-2"}>
            {/* 左欄：預約資訊 */}
            <div className="space-y-6">
              {isSpaDemoStore ? (
                <SpaBookingFields
                  days={days}
                  defaultDate={defaultDate}
                  treatments={spaTreatments.map((treatment) => ({
                    ...treatment,
                    price: Number(treatment.price),
                    kind: findSpaDemoCatalogItem(treatment.id)?.kind ?? "SERVICE",
                    resourceType:
                      findSpaDemoCatalogItem(treatment.id)?.resourceType ?? "BED",
                  }))}
                  defaultServiceStaffId={defaultServiceStaff?.id}
                  defaultSlotTime={requestedSlotTime}
                />
              ) : (
                <FormSection title="預約資訊" description="日期、時段與人數">
                  <DashboardBookingForm
                    days={days}
                    defaultDate={defaultDate}
                    defaultSlotTime={requestedSlotTime}
                    lockScheduleSelection={lockSpaSchedule}
                    todayStr={todayStr}
                    initialSlots={initialSlots}
                  />
                </FormSection>
              )}
            </div>

            {/* 右欄：顧客 / 方案 — 客戶端互動由 CustomerAndPlanFields 負責 */}
            <div className="space-y-6">
              <CustomerAndPlanFields
                defaultMode={defaultMode}
                spaMode={isSpaDemoStore}
                defaultCustomerId={defaultCustomer?.id}
                defaultCustomerLabel={
                  defaultCustomer
                    ? `${defaultCustomer.name}（${defaultCustomer.phone || defaultCustomer.email || ""}）`
                    : undefined
                }
              />
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

            {isOwner && !isSpaDemoStore ? (
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
        </BookingCreateForm>
      </FormShell>
    </PageShell>
  );
}
