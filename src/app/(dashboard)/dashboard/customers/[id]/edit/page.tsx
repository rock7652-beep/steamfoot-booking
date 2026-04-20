import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { getCustomerDetail } from "@/server/queries/customer";
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

  const customer = await getCustomerDetail(id);
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
            href={`/dashboard/customers/${id}`}
            className="rounded-lg border border-earth-200 px-3 py-1.5 text-xs font-medium text-earth-600 hover:bg-earth-50"
          >
            ← 返回詳情
          </Link>
        }
      />

      <EditCustomerForm
        customer={{
          id: customer.id,
          name: customer.name ?? "",
          phone: customer.phone ?? "",
          email: customer.email ?? "",
          gender: customer.gender ?? "",
          birthday: birthdayStr,
          height: customer.height ?? null,
          notes: customer.notes ?? "",
          lineName: customer.lineName ?? "",
        }}
      />
    </PageShell>
  );
}
