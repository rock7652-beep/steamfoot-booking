import { getStoreIndustryModule } from "@/lib/industry-module-server";
import { getActiveStoreForRead } from "@/lib/store";
import { getStoreContext } from "@/lib/store-context";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { getCustomerEditForUser } from "@/server/queries/customer";
import { resolveStoreViewContextFromCookie } from "@/lib/store-view-context-server";
import { DashboardLink as Link } from "@/components/dashboard-link";
import { PageShell, PageHeader } from "@/components/desktop";
import { EditCustomerForm } from "./edit-customer-form";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditCustomerPage({ params }: PageProps) {
  const { id } = await params;

  const user = await getCurrentUser();
  if (!user) notFound();
  if (!(await checkPermission(user.role, user.staffId, "customer.update"))) {
    redirect(`/dashboard/customers/${id}`);
  }
  const storeViewContext = await resolveStoreViewContextFromCookie(user);
  if (storeViewContext?.isViewMode) {
    redirect(`/dashboard/customers/${id}`);
  }

  const customer = await getCustomerEditForUser(user, id);
  const activeStoreId = await getActiveStoreForRead(user);
  const isSpa =
    !!activeStoreId && (await getStoreIndustryModule(activeStoreId)) === "spa";
  const storeContext = await getStoreContext();
  const returnHref = isSpa
    ? `/dashboard/customers?search=${encodeURIComponent(customer.name ?? "")}`
    : `/dashboard/customers/${id}`;
  const returnUrl = storeContext
    ? `/s/${storeContext.storeSlug}/admin${returnHref}`
    : returnHref;
  const birthdayStr = customer.birthday
    ? customer.birthday.toISOString().slice(0, 10)
    : "";

  return (
    <PageShell>
      <PageHeader
        title="編輯顧客"
        subtitle={customer.name}
        actions={
          <Link
            href={returnHref}
            className="rounded-lg border border-earth-200 px-3 py-1.5 text-xs font-medium text-earth-600 hover:bg-earth-50"
          >
            {isSpa ? "← 返回顧客清單" : "← 返回詳情"}
          </Link>
        }
      />

      <EditCustomerForm
        isSpa={isSpa}
        returnHref={returnHref}
        returnUrl={returnUrl}
        customer={{
          id: customer.id,
          name: customer.name ?? "",
          phone: customer.phone ?? "",
          email: customer.email ?? "",
          gender: customer.gender ?? "",
          birthday: birthdayStr,
          height: customer.height ?? null,
          serviceNote: customer.serviceNote ?? "",
          lineName: customer.lineName ?? "",
        }}
      />
    </PageShell>
  );
}
