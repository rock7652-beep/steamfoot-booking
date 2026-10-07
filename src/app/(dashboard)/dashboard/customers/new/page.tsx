import { requireDashboardCoreFeature } from "@/lib/dashboard-core-feature";
import { getStoreIndustryModule } from "@/lib/industry-module-server";
import { getActiveStoreForRead } from "@/lib/store";
import { listStaffSelectOptions } from "@/server/queries/staff";
import { createCustomer } from "@/server/actions/customer";
import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { resolveStoreViewContextFromCookie } from "@/lib/store-view-context-server";
import { getStoreContext } from "@/lib/store-context";
import { normalizeEmail, normalizePhone } from "@/lib/normalize";
import { notFound, redirect } from "next/navigation";
import { DashboardLink as Link } from "@/components/dashboard-link";
import { NewCustomerForm } from "./new-customer-form";
import { FormErrorToast } from "@/components/form-error-toast";
import {
  PageShell,
  PageHeader,
} from "@/components/desktop";

export default async function NewCustomerPage({
  searchParams,
}: {
  searchParams: Promise<{ existingCustomerId?: string }>;
}) {
  await requireDashboardCoreFeature("customer_management");
  const user = await getCurrentUser();
  if (!user) notFound();
  if (!(await checkPermission(user.role, user.staffId, "customer.create"))) {
    redirect("/dashboard");
  }
  const storeViewContext = await resolveStoreViewContextFromCookie(user);
  if (storeViewContext?.isViewMode) {
    redirect("/dashboard/customers");
  }

  const activeStoreId = await getActiveStoreForRead(user);
  const isSpa =
    !!activeStoreId && (await getStoreIndustryModule(activeStoreId)) === "spa";
  const staffOptions = await listStaffSelectOptions();
  const { existingCustomerId } = await searchParams;
  const storeContext = await getStoreContext();
  const dashboardBase = storeContext
    ? `/s/${storeContext.storeSlug}/admin/dashboard`
    : "/dashboard";

  async function handleSubmit(formData: FormData) {
    "use server";
    const assignedStaffIdRaw =
      (formData.get("assignedStaffId") as string) || "";
    const lineNameRaw = (formData.get("lineName") as string) || "";
    const serviceNoteRaw = (formData.get("serviceNote") as string) || "";
    const emailRaw = normalizeEmail((formData.get("email") as string) ?? "");
    const genderRaw = (formData.get("gender") as string) || "";
    const birthdayRaw = ((formData.get("birthday") as string) ?? "").trim();

    // optional 欄位：空字串轉 undefined，schema 才會跳過驗證
    const result = await createCustomer({
      name: ((formData.get("name") as string) ?? "").trim(),
      phone: normalizePhone((formData.get("phone") as string) ?? ""),
      email: emailRaw || undefined,
      gender:
        genderRaw === "male" || genderRaw === "female" || genderRaw === "other"
          ? genderRaw
          : undefined,
      birthday: birthdayRaw || undefined,
      lineName: lineNameRaw || undefined,
      serviceNote: serviceNoteRaw || undefined,
      assignedStaffId: assignedStaffIdRaw || undefined,
    });

    return result;
  }

  return (
    <PageShell>
      <FormErrorToast />

      <PageHeader
        title="新增顧客"
        subtitle="填妥基本資料後建檔，之後可隨時編輯"
        actions={
          <Link
            href="/dashboard/customers"
            className="rounded-lg border border-earth-200 px-3 py-1.5 text-xs font-medium text-earth-600 hover:bg-earth-50"
          >
            ← 顧客列表
          </Link>
        }
      />

      {existingCustomerId ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm">
          <p className="font-medium text-amber-900">
            此手機或 Email 已存在於本店
          </p>
          <p className="mt-1 text-amber-800">
            請前往既有顧客資料確認，避免建立重複的客戶。
          </p>
          <Link
            href={`/dashboard/customers/${existingCustomerId}`}
            className="mt-3 inline-flex items-center gap-1 rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700"
          >
            前往既有顧客 →
          </Link>
        </div>
      ) : null}

      <NewCustomerForm isSpa={isSpa} staffOptions={staffOptions} save={handleSubmit} returnUrl={`${dashboardBase}/customers`} />
    </PageShell>
  );
}
