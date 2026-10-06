import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { AppError } from "@/lib/errors";
import { PageShell, PageHeader } from "@/components/desktop";
import { inventoryContext } from "@/server/services/inventory";
import { workOrderData } from "@/server/services/work-orders";
import { WorkOrderWorkspace } from "./workspace";

export default async function WorkOrdersPage(){
  const user=await getCurrentUser();if(!user)redirect("/login");
  if(!await checkPermission(user.role,user.staffId,"work_order.read"))return <PageShell><PageHeader title="工單"/><p>沒有查看工單的權限</p></PageShell>;
  let data, message;
  try {data=await workOrderData(await inventoryContext("work_order.read"));}
  catch(e){if(e instanceof AppError&&["VALIDATION","FORBIDDEN"].includes(e.code))message=e.message;else throw e;}
  if(!data)return <PageShell><PageHeader title="工單"/><p role="status">{message}</p></PageShell>;
  return <PageShell><WorkOrderWorkspace key={`${user.id}:${data.store.id}:${data.canWrite}:${data.canCollect}`} initial={data}/></PageShell>;
}
