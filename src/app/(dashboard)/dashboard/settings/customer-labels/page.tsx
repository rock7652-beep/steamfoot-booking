import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { notFound } from "next/navigation";
import { loadCustomerLabels } from "@/server/actions/customer-labels";
import { LabelManager } from "./label-manager";
export default async function CustomerLabelsPage() {
  const user=await getCurrentUser();
  if(!user || !await checkPermission(user.role,user.staffId,"customer.read"))notFound();
  const data=await loadCustomerLabels();
  if(!data.available)notFound();
  return <section className="space-y-3 p-4"><h1 className="text-xl font-semibold">顧客標籤</h1><LabelManager initial={data}/></section>;
}
