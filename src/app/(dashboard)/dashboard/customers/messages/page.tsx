import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/permissions";
import { getActiveStoreForRead } from "@/lib/store";
import { customerMessageAccess } from "@/server/services/customer-message-access";
import { customerMessageOptions,customerMessageSearch,customerMessageHistory } from "@/server/services/customer-messages";
import { PageHeader,PageShell } from "@/components/desktop";
import { CustomerMessageComposer } from "./composer";
export const maxDuration=300;
export default async function CustomerMessagesPage() {
  const user=await getCurrentUser();
  if(!user || !await checkPermission(user.role,user.staffId,"customer.message.send") || !await checkPermission(user.role,user.staffId,"customer.read"))notFound();
  const storeId=await getActiveStoreForRead(user);
  if(!storeId)notFound();
  await customerMessageAccess(storeId);
  const [options,initial,history]=await Promise.all([customerMessageOptions(storeId),customerMessageSearch(storeId,{}),customerMessageHistory(storeId)]);
  return <PageShell><PageHeader title="顧客訊息" subtitle="選顧客、寫內容，確認後由本店 LINE 發送"/><CustomerMessageComposer key={`${user.id}:${storeId}`} options={options} initial={initial} initialHistory={history}/></PageShell>;
}
